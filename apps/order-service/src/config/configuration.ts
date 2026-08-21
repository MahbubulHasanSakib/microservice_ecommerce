export interface OrderServiceConfig {
  nodeEnv: string;
  tcpPort: number;
  httpPort: number;
  productService: {
    host: string;
    port: number;
  };
  database: {
    url: string;
  };
}

export const configuration = (): OrderServiceConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  tcpPort: parseInt(process.env.TCP_PORT ?? '3004', 10),
  httpPort: parseInt(process.env.HTTP_PORT ?? '3014', 10),
  productService: {
    host: process.env.PRODUCT_SERVICE_HOST ?? 'localhost',
    port: parseInt(process.env.PRODUCT_SERVICE_PORT ?? '3003', 10),
  },
  database: {
    url: process.env.DATABASE_URL ?? '',
  },
});
