const PLACEHOLDER_SECRETS = new Set([
  "local-dev-only-change-before-any-shared-use-01",
  "replace-with-a-long-random-string",
  "change-me",
]);

export type AppConfig = {
  databaseUrl: string;
  jwtSecret: string;
  port: number;
  corsOrigin: string;
  nodeEnv: string;
  bootstrapAdminEmail: string | null;
  bootstrapAdminPassword: string | null;
};

export function getConfig(): AppConfig {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const jwtSecret = process.env.JWT_SECRET?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }
  if (!jwtSecret || jwtSecret.length < 16) {
    throw new Error("JWT_SECRET must be at least 16 characters.");
  }
  const nodeEnv = process.env.NODE_ENV?.trim() || "development";
  if (nodeEnv === "production" && PLACEHOLDER_SECRETS.has(jwtSecret)) {
    throw new Error("Replace JWT_SECRET before starting in production.");
  }
  const port = Number(process.env.PORT || 4000);
  if (!Number.isInteger(port) || port < 1) {
    throw new Error("PORT must be a positive integer.");
  }
  return {
    databaseUrl,
    jwtSecret,
    port,
    corsOrigin: process.env.CORS_ORIGIN?.trim() || "http://localhost:3000",
    nodeEnv,
    bootstrapAdminEmail: process.env.BOOTSTRAP_ADMIN_EMAIL?.trim() || null,
    bootstrapAdminPassword: process.env.BOOTSTRAP_ADMIN_PASSWORD || null,
  };
}
