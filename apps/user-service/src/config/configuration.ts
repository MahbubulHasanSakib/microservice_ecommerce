export const configuration = () => ({
  tcpPort: parseInt(process.env['TCP_PORT'] ?? '3001', 10),
  httpPort: parseInt(process.env['HTTP_PORT'] ?? '3011', 10),
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  database: {
    url: process.env['DATABASE_URL'],
  },
});

export type AppConfig = ReturnType<typeof configuration>;
