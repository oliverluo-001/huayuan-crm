import { describe, expect, it } from "vitest";
import { cloneQuoteOutputLayout, createQuoteSection, DEFAULT_QUOTE_OUTPUT_LAYOUT } from "./quote-output-layout";

describe("quote output layout", () => {
  it("clones a layout without sharing nested sections", () => {
    const copy = cloneQuoteOutputLayout(DEFAULT_QUOTE_OUTPUT_LAYOUT);
    copy.sections[0].titleZh = "形式发票";
    expect(DEFAULT_QUOTE_OUTPUT_LAYOUT.sections[0].titleZh).toBe("报价单");
  });

  it("creates editable custom content modules", () => {
    const section = createQuoteSection("custom_text");
    expect(section.enabled).toBe(true);
    expect(section.contentZh).toBe("");
    expect(section.id).toContain("custom_text-");
  });
});
