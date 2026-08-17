import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SERVICES } from '@ecommerce/shared';
import { UsersController } from './users.controller';

/**
 * UsersModule — API Gateway
 *
 * Registers the TCP ClientProxy to communicate with User Service.
 */
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: SERVICES.USER_SERVICE,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: configService.get<string>('userService.host', 'localhost'),
            port: configService.get<number>('userService.port', 3001),
          },
        }),
      },
    ]),
  ],
  controllers: [UsersController],
})
export class UsersModule {}
