import {
  isValidIanaTimezone,
  resolveCustomerTimezone,
} from "./customer-timezone";

describe("customer timezone resolution", () => {
  it("keeps a valid explicit IANA timezone", () => {
    expect(resolveCustomerTimezone("Europe/Berlin", "Bangkok", "Thailand"))
      .toBe("Europe/Berlin");
  });

  it("infers Bangkok and other common foreign-trade locations", () => {
    expect(resolveCustomerTimezone("", "Bangkok", "")).toBe("Asia/Bangkok");
    expect(resolveCustomerTimezone("", "", "Thailand")).toBe("Asia/Bangkok");
    expect(resolveCustomerTimezone("", "Kuala Lumpur", "Malaysia"))
      .toBe("Asia/Kuala_Lumpur");
    expect(resolveCustomerTimezone("", "Berlin", "Germany"))
      .toBe("Europe/Berlin");
  });

  it("does not guess an unknown or multi-zone location", () => {
    expect(resolveCustomerTimezone("", "California", "United States"))
      .toBe("");
    expect(isValidIanaTimezone("Bangkok")).toBe(false);
  });
});
