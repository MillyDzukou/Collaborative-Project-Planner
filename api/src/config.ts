import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const DEV_JWT_SECRET = "change_me_in_dev";
const nodeEnv = process.env.NODE_ENV ?? "development";
const jwtSecret = required("JWT_SECRET", DEV_JWT_SECRET);

// Refuse to start in production with the well-known development secret —
// anyone could forge session tokens.
if (nodeEnv === "production" && jwtSecret === DEV_JWT_SECRET) {
  throw new Error("JWT_SECRET must be set to a strong, unique value in production");
}

export const config = {
  nodeEnv,
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  redisUrl: required("REDIS_URL", "redis://localhost:6379"),
  /** Comma-separated allow-list of browser origins permitted by CORS and the WebSocket Origin check. */
  webOrigins: required("WEB_ORIGIN", "http://localhost:5173")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  jwtSecret,
  logLevel: process.env.LOG_LEVEL ?? (nodeEnv === "test" ? "silent" : "info"),
  /** Max requests per IP per minute across the API. */
  globalRateLimit: Number(process.env.RATE_LIMIT_GLOBAL ?? 600),
  /** Max POST /auth/register calls per IP per hour. Raised in dev compose so e2e suites are rerunnable. */
  registerRateLimit: Number(process.env.RATE_LIMIT_REGISTER ?? 10),
  /** Number of reverse-proxy hops to trust for client IPs (needed for correct rate limiting behind a proxy). */
  trustProxy: Number(process.env.TRUST_PROXY ?? 0),
};
