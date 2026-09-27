import { Router } from "express";
import type { RouterDeps } from "../router";

/**
 * GET /health
 *
 * Checks the database is reachable. Returns 503 while shutting down so the load
 * balancer stops sending traffic.
 */
export function healthRouter({ pingDb, logger, isShuttingDown }: RouterDeps): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    if (isShuttingDown?.()) {
      res.status(503).json({ status: "shutting_down" });
      return;
    }

    try {
      pingDb();
      res.status(200).json({ status: "ok", db: "ok" });
    } catch (err) {
      logger.error({ err }, "health check failed");
      res.status(503).json({ status: "error", db: "unreachable" });
    }
  });

  return router;
}
