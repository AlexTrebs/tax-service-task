import { z } from "zod";

export interface EnvConfig {
  port: number;
  dbPath: string;
  logLevel: string;
  shutdownDelayMs: number;
  shutdownTimeoutMs: number;
}

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DB_PATH: z.string().min(1).default("data/tax.db"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  SHUTDOWN_DELAY_MS: z.coerce.number().int().nonnegative().default(0),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000)
});

/**
 * Validates environment variables, failing fast on bad values
 *
 * @param env - Environment to read from (defaults to process.env)
 * @returns The validated config
 */
export function loadEnv(env: NodeJS.ProcessEnv = process.env): EnvConfig {
  const parsed = envSchema.safeParse(env);

  if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
  }

  return {
    port: parsed.data.PORT,
    dbPath: parsed.data.DB_PATH,
    logLevel: parsed.data.LOG_LEVEL,
    shutdownDelayMs: parsed.data.SHUTDOWN_DELAY_MS,
    shutdownTimeoutMs: parsed.data.SHUTDOWN_TIMEOUT_MS
  };
}
