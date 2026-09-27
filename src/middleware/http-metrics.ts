import type { RequestHandler } from "express";
import type { Metrics } from "../metrics-registry";

// Records request latency by method, route and status code
export function httpMetrics(metrics: Metrics): RequestHandler {
  return (req, res, next) => {
    const end = metrics.httpRequestDuration.startTimer();

    // req.route is only set after routing, so read it once the response is sent
    res.on("finish", () => {
      end({
        method: req.method,
        route: req.route?.path ?? "unmatched",
        status_code: String(res.statusCode)
      });
    });

    next();
  };
}
