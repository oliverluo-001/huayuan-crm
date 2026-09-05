import { DEFAULT_QUOTE_OUTPUT_LAYOUT, normalizeQuoteOutputLayout } from "./quote-output-layout";

describe("quote output layout", () => {
  it("uses the standard layout when no custom layout is supplied", () => {
    const layout = normalizeQuoteOutputLayout();
    expect(layout.sections.map((section) => section.type)).toEqual(
      DEFAULT_QUOTE_OUTPUT_LAYOUT.sections.map((section) => section.type),
    );
    expect(layout).not.toBe(DEFAULT_QUOTE_OUTPUT_LAYOUT);
  });

  it("keeps module order while removing unsupported fields and unsafe ids", () => {
    const layout = normalizeQuoteOutputLayout({
      version: 1,
      accentColor: "#123abc",
      sections: [
        {
          id: "items<script>",
          type: "items",
          enabled: true,
          titleZh: "产品",
          titleEn: "Items",
          fields: ["description", "unsupported", "amount", "amount"],
        },
        {
          id: "intro",
          type: "custom_text",
          enabled: true,
          titleZh: "说明",
          titleEn: "Introduction",
          contentZh: "自定义内容",
        },
      ],
    });

    expect(layout.accentColor).toBe("#123abc");
    expect(layout.sections.map((section) => section.type)).toEqual(["items", "custom_text"]);
    expect(layout.sections[0].id).toBe("itemsscript");
    expect(layout.sections[0].fields).toEqual(["description", "amount"]);
    expect(layout.sections[1].contentZh).toBe("自定义内容");
  });

  it("falls back to the brand color when a color is invalid", () => {
    const layout = normalizeQuoteOutputLayout({
      version: 1,
      accentColor: "red",
      sections: DEFAULT_QUOTE_OUTPUT_LAYOUT.sections,
    });
    expect(layout.accentColor).toBe(DEFAULT_QUOTE_OUTPUT_LAYOUT.accentColor);
  });
});
