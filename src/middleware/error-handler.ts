import type { ErrorRequestHandler, RequestHandler } from "express";
import { respondValidationError } from "../errors/validation-error";
import type { Metrics } from "../metrics-registry";

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: "NotFound" });
};

// Maps client errors to 4xx responses, anything else is logged and returned as a generic 500
export function errorHandler(metrics: Metrics): ErrorRequestHandler {
  return (err, req, res, next) => {
    // Too late to send an error response, let Express close the connection
    if (res.headersSent) {
      next(err);
      return;
    }

    if (err?.type === "entity.parse.failed") {
      respondValidationError(req, res, metrics, [{ path: "", message: "Malformed JSON body" }]);
      return;
    }

    if (err?.type === "entity.too.large") {
      res.status(413).json({ error: "PayloadTooLarge" });
      return;
    }

    // Other body parser errors caused by the client (e.g. unsupported charset) are safe to expose
    if (err?.expose && err.status >= 400 && err.status < 500) {
      req.log.warn({ err }, "client error");
      res.status(err.status).json({ error: err.name.replace(/Error$/, ""), message: err.message });
      return;
    }

    req.log.error({ err }, "unhandled error");
    res.status(500).json({ error: "InternalServerError" });
  };
}
