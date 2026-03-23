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
  JWT_SECRET: requireEnv('JWT_SECRET'),
  SESSION_SECRET: requireEnv('SESSION_SECRET'),
  CORS_ORIGINS: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim())
    : ['http://localhost:5173'],
  NODE_ENV: process.env.NODE_ENV || 'development',
  get IS_PRODUCTION() {
    return this.NODE_ENV === 'production';
  },
} as const;
