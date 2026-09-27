import { Router } from "express";
import type { RouterDeps } from "../router";

/**
 * GET /metrics
 *
 * Prometheus scrape target.
 */
export function metricsRouter({ metrics }: RouterDeps): Router {
  const router = Router();

  router.get("/metrics", async (_req, res) => {
    res.setHeader("Content-Type", metrics.registry.contentType);
    res.send(await metrics.registry.metrics());
  });

  return router;
}
