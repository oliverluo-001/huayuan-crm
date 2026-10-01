import { describe, expect, it } from "vitest";
import { quoteCustomerDefaults } from "./quote-customer-defaults";
const form = { currency: "USD", incoterm: "FOB", exchangeRate: "7.1" };
describe("quote customer preferences", () => {
  it("inherits valid preferences before pricing and clears incompatible rate", () => {
    expect(quoteCustomerDefaults(form, { preferredCurrency: "eur", preferredIncoterm: "CIF" }, { currency: false, incoterm: false }, false)).toEqual({ currency: "EUR", incoterm: "CIF", exchangeRate: "" });
  });
  it("never replaces manual choices or relabels existing prices", () => {
    expect(quoteCustomerDefaults(form, { preferredCurrency: "EUR", preferredIncoterm: "CIF" }, { currency: true, incoterm: true }, false)).toEqual(form);
    expect(quoteCustomerDefaults(form, { preferredCurrency: "EUR" }, { currency: false, incoterm: false }, true)).toEqual(form);
    expect(quoteCustomerDefaults(form, { preferredCurrency: "USD" }, { currency: false, incoterm: false }, false)).toEqual(form);
    expect(quoteCustomerDefaults(form, { preferredCurrency: "bad currency" }, { currency: false, incoterm: false }, false)).toEqual(form);
  });
});
