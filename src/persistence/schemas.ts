import { z } from "zod";

// Requires a timezone (Z or +hh:mm), a local time is ambiguous
const isoDateTime = z.iso.datetime({ offset: true });

const pennies = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const taxRate = z.number().min(0).max(1);
const id = z.string().trim().min(1);

const saleItem = z.object({
  itemId: id,
  cost: pennies,
  taxRate
});

export const saleEventSchema = z.object({
  eventType: z.literal("SALES"),
  date: isoDateTime,
  invoiceId: id,
  items: z
    .array(saleItem)
    .min(1)
    // Amendments target items by itemId, so duplicates would be ambiguous
    .refine((items) => new Set(items.map((i) => i.itemId)).size === items.length, {
      message: "itemId must be unique within an invoice"
    })
});

export const taxPaymentEventSchema = z.object({
  eventType: z.literal("TAX_PAYMENT"),
  date: isoDateTime,
  amount: pennies
});

export const transactionSchema = z.discriminatedUnion("eventType", [
  saleEventSchema,
  taxPaymentEventSchema
]);

export const amendmentSchema = z.object({
  date: isoDateTime,
  invoiceId: id,
  itemId: id,
  cost: pennies,
  taxRate
});

// An unencoded "+" (e.g. +01:00) arrives as a space after URL decoding
const restorePlus = (value: unknown): unknown =>
  typeof value === "string" ? value.replaceAll(" ", "+") : value;

export const taxPositionQuerySchema = z.object({
  date: z.preprocess(restorePlus, isoDateTime)
});

export type SaleEvent = z.infer<typeof saleEventSchema>;
export type TaxPaymentEvent = z.infer<typeof taxPaymentEventSchema>;
export type Amendment = z.infer<typeof amendmentSchema>;
