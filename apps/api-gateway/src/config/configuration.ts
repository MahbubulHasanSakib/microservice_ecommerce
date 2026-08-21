export const configuration = () => ({
  port: parseInt(process.env['PORT'] ?? '3000', 10),
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  jwt: {
    secret: process.env['JWT_SECRET'] ?? 'super-secret-production-grade-jwt-key-min-32-chars-long',
  },
  redis: {
    host: process.env['REDIS_HOST'] ?? 'localhost',
    port: parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
  },
  userService: {
    host: process.env['USER_SERVICE_HOST'] ?? 'localhost',
    port: parseInt(process.env['USER_SERVICE_PORT'] ?? '3001', 10),
  },
  authService: {
    host: process.env['AUTH_SERVICE_HOST'] ?? 'localhost',
    port: parseInt(process.env['AUTH_SERVICE_PORT'] ?? '3002', 10),
  },
  productService: {
    host: process.env['PRODUCT_SERVICE_HOST'] ?? 'localhost',
    port: parseInt(process.env['PRODUCT_SERVICE_PORT'] ?? '3003', 10),
  },
  orderService: {
    host: process.env['ORDER_SERVICE_HOST'] ?? 'localhost',
    port: parseInt(process.env['ORDER_SERVICE_PORT'] ?? '3004', 10),
  },
});
