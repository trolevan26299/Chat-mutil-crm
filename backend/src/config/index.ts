/**
 * Centralized configuration loader.
 * All environment variables are read once at startup and typed here.
 */

function requireEnv(key: string, fallback: string): string {
  const val = process.env[key];
  if (!val && process.env.NODE_ENV === 'production') {
    throw new Error(`❌ Required env var missing in production: ${key}`);
  }
  return val || fallback;
}

export const config = {
  port: parseInt(process.env.PORT || '3000'),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: requireEnv('JWT_SECRET', 'dev-secret-change-me'),
  encryptionKey: requireEnv('ENCRYPTION_KEY', 'dev-key-change-me-16b'),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://crmuser:password@localhost:5432/zalocrm',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  uploadDir: process.env.UPLOAD_DIR || '/var/lib/zalo-crm/files',
  appUrl: process.env.APP_URL || 'http://localhost:3000',

  /* --- AI via OpenRouter --- */
  openrouterApiKey: process.env.OPENROUTER_API_KEY || '',
  openrouterBaseUrl: 'https://openrouter.ai/api/v1/chat/completions',
  aiDefaultModel: process.env.AI_DEFAULT_MODEL || 'google/gemini-2.0-flash-001',

  /* --- Google AI (for RAG embeddings) --- */
  googleAiApiKey: process.env.GOOGLE_AI_API_KEY || '',
  geminiEmbeddingModel: 'text-embedding-004',
  embeddingDimension: 768,

  isProduction: process.env.NODE_ENV === 'production',
};
