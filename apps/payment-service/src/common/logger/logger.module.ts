import { Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isProduction = configService.get<string>('nodeEnv') === 'production';
        return {
          pinoHttp: {
            level: configService.get<string>('logLevel', 'debug'),
            transport: isProduction
              ? undefined
              : {
                  target: 'pino-pretty',
                  options: {
                    colorize: true,
                    singleLine: true,
                    translateTime: 'SYS:standard',
                  },
                },
            redact: {
              paths: ['req.headers.authorization', 'paymentDetails', 'cardNumber', 'cvv'],
              censor: '[REDACTED]',
            },
          },
        };
      },
    }),
  ],
})
export class LoggerModule {}
