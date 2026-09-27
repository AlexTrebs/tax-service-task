import { Router } from "express";
import { formatZodError, respondValidationError } from "../errors/validation-error";
import { jsonBody } from "../middleware/require-json";
import { amendmentSchema } from "../persistence/schemas";
import type { RouterDeps } from "../router";

/**
 * PATCH /sale
 *
 * Amends one item of an invoice from a point in time onward. Always accepted, even if
 * the sale or item doesn't exist yet. The amendment is stored as its own row and matched
 * to the sale when the tax position is calculated.
 */
export function saleRouter({ sales, metrics }: RouterDeps): Router {
  const router = Router();

  router.patch("/sale", jsonBody, (req, res) => {
    const parsed = amendmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return respondValidationError(req, res, metrics, formatZodError(parsed.error));
    }
    const amendment = parsed.data;

    sales.amendSale(amendment);
    metrics.amendments.inc();
    req.log.info(
      { invoiceId: amendment.invoiceId, itemId: amendment.itemId, date: amendment.date },
      "sale amendment accepted"
    );

    res.status(202).end();
  });

  return router;
}
