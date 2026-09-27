import type { Request, Response } from "express";
import type { ZodError } from "zod";
import type { Metrics } from "../metrics-registry";

export interface ValidationDetail {
  path: string;
  message: string;
}

// Flattens zod issues into { path, message } pairs for the response body
export const formatZodError = (error: ZodError): ValidationDetail[] =>
  error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));

// Sends a 400 with validation details, and logs and counts the rejection
export function respondValidationError(
  req: Request,
  res: Response,
  metrics: Metrics,
  details: ValidationDetail[]
): void {
  // Label with the route template, not req.path, to keep metric cardinality bounded
  metrics.validationFailures.inc({ route: req.route?.path ?? "unmatched" });
  req.log.warn({ details }, "request validation failed");
  res.status(400).json({ error: "ValidationError", details });
}
