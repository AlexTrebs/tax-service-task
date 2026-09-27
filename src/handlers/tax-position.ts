import { Router } from "express";
import { formatZodError, respondValidationError } from "../errors/validation-error";
import { taxPositionQuerySchema } from "../persistence/schemas";
import type { RouterDeps } from "../router";

/**
 * GET /tax-position
 *
 * Returns the tax position (sales tax minus payments) at the given date.
 *
 * Query Parameters:
 * - date: ISO 8601 date-time with timezone (required)
 */
export function taxPositionRouter({ taxPosition, metrics }: RouterDeps): Router {
  const router = Router();

  router.get("/tax-position", (req, res) => {
    const parsed = taxPositionQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return respondValidationError(req, res, metrics, formatZodError(parsed.error));
    }
    const { date } = parsed.data;

    const position = taxPosition.at(date);
    metrics.taxPositionQueries.inc();

    res.status(200).json({ date, taxPosition: position });
  });

  return router;
}
