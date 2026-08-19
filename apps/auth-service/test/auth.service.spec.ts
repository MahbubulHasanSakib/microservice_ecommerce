import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { of } from 'rxjs';
import * as bcrypt from 'bcrypt';
import { Role, SERVICES } from '@ecommerce/shared';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';

const mockPrismaService = {
  credential: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  refreshToken: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  auditLog: {
    create: jest.fn(),
  },
};

const mockRedisService = {
  blacklistToken: jest.fn().mockResolvedValue(undefined),
  isTokenBlacklisted: jest.fn().mockResolvedValue(false),
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue('mock.jwt.token'),
};

const mockConfigService = {
  get: jest.fn((key: string, defaultValue?: any) => {
    if (key === 'jwt.secret') return 'test-secret-key-that-is-at-least-32-chars-long';
    if (key === 'jwt.accessExpiration') return '900s';
    return defaultValue;
  }),
};

const mockUserClient = {
  send: jest.fn(),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: SERVICES.USER_SERVICE, useValue: mockUserClient },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register()', () => {
    const registerDto = {
      email: 'david@example.com',
      password: 'Password123!',
      firstName: 'David',
      lastName: 'Miller',
    };

    const mockUserResponse = {
      id: 'user-uuid-1',
      email: 'david@example.com',
      firstName: 'David',
      lastName: 'Miller',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should register a new user, create credentials, and return tokens', async () => {
      mockPrismaService.credential.findUnique.mockResolvedValue(null);
      mockUserClient.send.mockReturnValue(of(mockUserResponse));
      mockPrismaService.credential.create.mockResolvedValue({ id: 'cred-1' });
      mockPrismaService.refreshToken.create.mockResolvedValue({ id: 'rt-1' });

      const result = await service.register(registerDto);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.id).toBe('user-uuid-1');
      expect(mockPrismaService.credential.create).toHaveBeenCalled();
    });

    it('should throw ConflictException if email already registered in auth_db', async () => {
      mockPrismaService.credential.findUnique.mockResolvedValue({ id: 'existing-id' });

      await expect(service.register(registerDto)).rejects.toThrow(ConflictException);
    });
  });

  describe('login()', () => {
    const loginDto = { email: 'david@example.com', password: 'Password123!' };

    it('should login successfully with correct password', async () => {
      const hashedPassword = await bcrypt.hash('Password123!', 10);
      mockPrismaService.credential.findUnique.mockResolvedValue({
        id: 'cred-1',
        userId: 'user-uuid-1',
        email: 'david@example.com',
        password: hashedPassword,
        roles: [Role.CUSTOMER],
        isActive: true,
      });

      mockUserClient.send.mockReturnValue(of({
        id: 'user-uuid-1',
        email: 'david@example.com',
        firstName: 'David',
        lastName: 'Miller',
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      mockPrismaService.refreshToken.create.mockResolvedValue({ id: 'rt-1' });

      const result = await service.login(loginDto);

      expect(result.accessToken).toBe('mock.jwt.token');
      expect(result.user.email).toBe('david@example.com');
    });

    it('should throw UnauthorizedException on wrong password', async () => {
      const hashedPassword = await bcrypt.hash('DifferentPassword!', 10);
      mockPrismaService.credential.findUnique.mockResolvedValue({
        id: 'cred-1',
        userId: 'user-uuid-1',
        email: 'david@example.com',
        password: hashedPassword,
        isActive: true,
      });

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refreshTokens() — Token Rotation & Theft Detection', () => {
    it('SECURITY: should invalidate entire token family and throw if a revoked token is reused', async () => {
      mockPrismaService.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-uuid-1',
        familyId: 'family-100',
        isRevoked: true, // ALREADY REVOKED — REUSE ATTEMPT!
        expiresAt: new Date(Date.now() + 100000),
        credential: { email: 'david@example.com', roles: [Role.CUSTOMER] },
      });

      mockPrismaService.refreshToken.updateMany.mockResolvedValue({ count: 3 });

      await expect(service.refreshTokens({ refreshToken: 'stolen-token' })).rejects.toThrow(
        UnauthorizedException,
      );

      // Verify entire family was revoked
      expect(mockPrismaService.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { familyId: 'family-100' },
        data: { isRevoked: true },
      });
    });
  });

  describe('logout()', () => {
    it('should blacklist JWT JTI in Redis and revoke refresh token', async () => {
      mockPrismaService.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.logout({
        userId: 'user-uuid-1',
        jti: 'token-uuid-123',
        refreshToken: 'plain-refresh-token',
      });

      expect(result.success).toBe(true);
      expect(mockRedisService.blacklistToken).toHaveBeenCalledWith('token-uuid-123', 900);
      expect(mockPrismaService.refreshToken.updateMany).toHaveBeenCalled();
    });
  });
});
