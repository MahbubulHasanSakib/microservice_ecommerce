import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { UsersService } from '../src/users/users.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { CreateUserDto } from '../src/users/dto/create-user.dto';

const mockPrismaService = {
  user: {
    create: jest.fn(),
    findUnique: jest.fn(),
  },
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create()', () => {
    const createDto: CreateUserDto = {
      email: 'john@example.com',
      password: 'Secret123!',
      firstName: 'John',
      lastName: 'Doe',
      phoneNumber: '+1234567890',
    };

    const mockDbUser = {
      id: 'a-uuid-1234',
      email: 'john@example.com',
      password: '$2b$12$hashedpassword',
      firstName: 'John',
      lastName: 'Doe',
      phoneNumber: '+1234567890',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    };

    it('should create a user with phoneNumber and return a UserResponse', async () => {
      mockPrismaService.user.create.mockResolvedValue(mockDbUser);

      const result = await service.create(createDto);

      expect(result.id).toBe('a-uuid-1234');
      expect(result.email).toBe('john@example.com');
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Doe');
      expect(result.phoneNumber).toBe('+1234567890');
    });

    it('SECURITY: must NEVER return the password field', async () => {
      mockPrismaService.user.create.mockResolvedValue(mockDbUser);

      const result = await service.create(createDto);
      expect(result).not.toHaveProperty('password');
    });

    it('should hash the password before storing (not store plaintext)', async () => {
      mockPrismaService.user.create.mockResolvedValue(mockDbUser);

      await service.create(createDto);

      const storedPassword = mockPrismaService.user.create.mock.calls[0][0].data.password;
      expect(storedPassword).not.toBe(createDto.password);
      expect(storedPassword).toMatch(/^\$2b\$12\$/);
    });

    it('should throw ConflictException when email already exists', async () => {
      const prismaUniqueError = { code: 'P2002', message: 'Unique constraint failed' };
      mockPrismaService.user.create.mockRejectedValue(prismaUniqueError);

      await expect(service.create(createDto)).rejects.toThrow(ConflictException);
    });

    it('should re-throw unexpected database errors', async () => {
      const unexpectedError = new Error('Connection pool exhausted');
      mockPrismaService.user.create.mockRejectedValue(unexpectedError);

      await expect(service.create(createDto)).rejects.toThrow('Connection pool exhausted');
    });
  });

  describe('findById()', () => {
    const mockDbUser = {
      id: 'a-uuid-1234',
      email: 'john@example.com',
      password: '$2b$12$hashedpassword',
      firstName: 'John',
      lastName: 'Doe',
      phoneNumber: '+1234567890',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    };

    it('should return a UserResponse with phoneNumber for a valid ID', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockDbUser);

      const result = await service.findById('a-uuid-1234');

      expect(result.id).toBe('a-uuid-1234');
      expect(result.email).toBe('john@example.com');
      expect(result.phoneNumber).toBe('+1234567890');
    });

    it('SECURITY: must NEVER return the password field', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockDbUser);

      const result = await service.findById('a-uuid-1234');
      expect(result).not.toHaveProperty('password');
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.findById('nonexistent-uuid')).rejects.toThrow(NotFoundException);
    });
  });
});
