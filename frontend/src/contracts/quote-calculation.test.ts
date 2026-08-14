import { describe, expect, it } from "vitest";
import { calculateQuoteTotals } from "./quote-calculation";

describe("quote calculation contract", () => {
  it("calculates line discount, freight, tax, multiple charges and conversion", () => {
    expect(calculateQuoteTotals(
      [{ quantity: 2, unitPrice: 100, discount: 10 }],
      20,
      10,
      [{ amount: 12.5 }, { amount: 7.5 }],
      7.2,
    )).toEqual({
      subtotal: 180,
      freight: 20,
      additionalFeeTotal: 20,
      taxAmount: 18,
      total: 238,
      convertedTotal: 1713.6,
    });
  });

  it("clamps discounts to the supported zero-to-one-hundred range", () => {
    expect(calculateQuoteTotals(
      [
        { quantity: 1, unitPrice: 100, discount: 120 },
        { quantity: 1, unitPrice: 50, discount: -10 },
      ],
      0,
      0,
      [],
      1,
    ).total).toBe(50);
  });
});
