import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { SERVICES } from '@ecommerce/shared';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret'),
      }),
    }),
    ClientsModule.registerAsync([
      {
        name: SERVICES.AUTH_SERVICE,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: configService.get<string>('authService.host', 'localhost'),
            port: configService.get<number>('authService.port', 3002),
          },
        }),
      },
    ]),
  ],
  controllers: [AuthController],
  providers: [JwtStrategy, JwtAuthGuard, RolesGuard],
  exports: [JwtStrategy, JwtAuthGuard, RolesGuard, JwtModule, PassportModule],
})
export class AuthModule {}
