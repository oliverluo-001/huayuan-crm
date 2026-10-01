import { describe, expect, it } from "vitest";
import { quoteReferencePrice } from "./quote-price";

describe("quote currency safety", () => {
  it("does not use a EUR price in a USD quote", () => {
    expect(quoteReferencePrice("USD", [{ currency: "EUR", referencePrice: 12 }])).toBe("");
    expect(quoteReferencePrice("USD", [], { currency: "CNY", price: 100 })).toBe("");
  });
  it("uses matching currency and preserves explicit zero", () => {
    expect(quoteReferencePrice("usd", [{ currency: "USD", referencePrice: 0 }])).toBe("0");
    expect(quoteReferencePrice("USD", [], { currency: "USD", price: 10 })).toBe("10");
  });
});
