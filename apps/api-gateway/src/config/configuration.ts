/**
 * API Gateway — Configuration factory
 *
 * All config is read from environment variables. Never hardcode values here.
 * The validationSchema runs BEFORE this factory — if a required var is missing,
 * the app crashes on startup with a clear error message (fail-fast).
 */
export const configuration = () => ({
  port: parseInt(process.env['PORT'] ?? '3000', 10),
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  userService: {
    host: process.env['USER_SERVICE_HOST'] ?? 'localhost',
    port: parseInt(process.env['USER_SERVICE_PORT'] ?? '3001', 10),
  },
});

export type AppConfig = ReturnType<typeof configuration>;
