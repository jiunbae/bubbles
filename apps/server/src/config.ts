function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  PORT: parseInt(process.env.PORT || '3001', 10),
  MONGO_URI: process.env.MONGO_URI || 'mongodb://localhost:27017/bubbles',
  REDIS_URL: process.env.REDIS_URL || '',
  JWT_SECRET: requireEnv('JWT_SECRET'),
  JWT_SECRET_PREVIOUS: process.env.JWT_SECRET_PREVIOUS || '',
  SESSION_SECRET: requireEnv('SESSION_SECRET'),
  SESSION_SECRET_PREVIOUS: process.env.SESSION_SECRET_PREVIOUS || '',
  // Rotate with OWNER_ID_SECRET_PREVIOUS so durable ownership can migrate.
  OWNER_ID_SECRET: process.env.OWNER_ID_SECRET || requireEnv('SESSION_SECRET'),
  OWNER_ID_SECRET_PREVIOUS: process.env.OWNER_ID_SECRET_PREVIOUS || '',
  CORS_ORIGINS: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim())
    : ['http://localhost:5173'],
  // Bracket access on purpose: `bun build` inlines `process.env.NODE_ENV` at
  // build time, which baked "development" into the image and made the
  // deployed NODE_ENV setting a no-op. Do not rewrite this to dot notation.
  NODE_ENV: process.env['NODE_ENV'] || 'development',
  POD_ID: process.env.HOSTNAME || crypto.randomUUID().slice(0, 8),
  get IS_PRODUCTION() {
    return this.NODE_ENV === 'production';
  },
} as const;
