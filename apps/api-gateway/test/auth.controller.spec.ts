import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { Role, SERVICES } from '@ecommerce/shared';
import { AuthController } from '../src/auth/auth.controller';

const mockAuthClient = {
  send: jest.fn(),
};

const mockJwtService = {
  decode: jest.fn().mockReturnValue({ jti: 'mock-jti-123' }),
};

describe('Gateway AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: SERVICES.AUTH_SERVICE, useValue: mockAuthClient },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should forward register request to Auth Service via TCP', async () => {
    const registerDto = {
      email: 'test@example.com',
      password: 'Password123!',
      firstName: 'Test',
      lastName: 'User',
    };

    const mockResponse = {
      accessToken: 'jwt.access.token',
      refreshToken: 'refresh.token',
      expiresIn: 900,
      user: {
        id: 'u-1',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };

    mockAuthClient.send.mockReturnValue(of(mockResponse));

    const result = await controller.register(registerDto);
    expect(result.accessToken).toBe('jwt.access.token');
    expect(mockAuthClient.send).toHaveBeenCalled();
  });

  it('should forward login request to Auth Service via TCP', async () => {
    const loginDto = { email: 'test@example.com', password: 'Password123!' };
    const mockResponse = {
      accessToken: 'jwt.access.token',
      refreshToken: 'refresh.token',
      expiresIn: 900,
      user: {
        id: 'u-1',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };

    mockAuthClient.send.mockReturnValue(of(mockResponse));

    const result = await controller.login(loginDto);
    expect(result.accessToken).toBe('jwt.access.token');
  });

  it('should forward logout request with decoded JTI to Auth Service', async () => {
    mockAuthClient.send.mockReturnValue(of({ success: true }));

    const result = await controller.logout(
      { userId: 'u-1', email: 'test@example.com', roles: [Role.CUSTOMER] },
      { headers: { authorization: 'Bearer mock-token' } } as unknown as Request,
      { refreshToken: 'mock-refresh' },
    );

    expect(result.success).toBe(true);
    expect(mockAuthClient.send).toHaveBeenCalledWith('auth.logout', {
      userId: 'u-1',
      jti: 'mock-jti-123',
      refreshToken: 'mock-refresh',
    });
  });
});
