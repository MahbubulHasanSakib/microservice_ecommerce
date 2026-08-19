export const configuration = () => ({
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  tcpPort: parseInt(process.env['TCP_PORT'] ?? '3002', 10),
  httpPort: parseInt(process.env['HTTP_PORT'] ?? '3012', 10),
  database: {
    url: process.env['DATABASE_URL'] ?? '',
  },
  redis: {
    host: process.env['REDIS_HOST'] ?? 'localhost',
    port: parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
  },
  jwt: {
    secret: process.env['JWT_SECRET'] ?? 'super-secret-production-grade-jwt-key-min-32-chars-long',
    accessExpiration: process.env['JWT_ACCESS_EXPIRATION'] ?? '900s', // 15m
    refreshExpiration: process.env['JWT_REFRESH_EXPIRATION'] ?? '7d',
  },
  userService: {
    host: process.env['USER_SERVICE_HOST'] ?? 'localhost',
    port: parseInt(process.env['USER_SERVICE_PORT'] ?? '3001', 10),
  },
});
