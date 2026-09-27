import { randomUUID } from "node:crypto";
import { pinoHttp } from "pino-http";
import { REQUEST_ID_MAX_LENGTH } from "../config/constants";
import type { Logger } from "../logger";

const SAFE_REQUEST_ID = new RegExp(`^[\\w.-]{1,${REQUEST_ID_MAX_LENGTH}}$`);

/**
 * Access logging with request IDs
 *
 * Reuses the caller's x-request-id if it's safe, otherwise generates one.
 * The ID is returned in the response header and attached to every log line.
 */
export function requestLogger(logger: Logger) {
  return pinoHttp({
    logger,
    genReqId: (req, res) => {
      const incoming = req.headers["x-request-id"];
      const id =
        typeof incoming === "string" && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
      res.setHeader("x-request-id", id);
      return id;
    },
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    },
    // Skip probes and scrapes, they'd drown out real traffic
    autoLogging: { ignore: (req) => req.url === "/metrics" || req.url === "/health" }
  });
}
