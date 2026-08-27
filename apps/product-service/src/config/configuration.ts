export interface ProductServiceConfig {
  nodeEnv: string;
  tcpPort: number;
  httpPort: number;
  database: {
    url: string;
  };
  redis: {
    host: string;
    port: number;
  };
}

export const configuration = (): ProductServiceConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  tcpPort: parseInt(process.env.TCP_PORT ?? '3003', 10),
  httpPort: parseInt(process.env.HTTP_PORT ?? '3013', 10),
  database: {
    url: process.env.DATABASE_URL ?? '',
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  },
});
