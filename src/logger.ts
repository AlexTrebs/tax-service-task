import pino from "pino";
import { SERVICE_NAME } from "./config/constants";

// Creates the JSON logger used across the service
export function createLogger(level: string) {
  return pino({
    level,
    base: { service: SERVICE_NAME },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: ["req.headers.authorization", "req.headers.cookie"]
  });
}

export type Logger = ReturnType<typeof createLogger>;
