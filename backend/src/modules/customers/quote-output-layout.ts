export type QuoteOutputSectionType =
  | "header"
  | "customer"
  | "items"
  | "totals"
  | "commercial"
  | "notes"
  | "bank"
  | "contact"
  | "footer"
  | "custom_text"
  | "page_break";

export interface QuoteOutputSection {
  id: string;
  type: QuoteOutputSectionType;
  enabled: boolean;
  titleZh: string;
  titleEn: string;
  contentZh?: string;
  contentEn?: string;
  fields?: string[];
}

export interface QuoteOutputLayout {
  version: 1;
  accentColor: string;
  sections: QuoteOutputSection[];
}

const SECTION_TYPES = new Set<QuoteOutputSectionType>([
  "header",
  "customer",
  "items",
  "totals",
  "commercial",
  "notes",
  "bank",
  "contact",
  "footer",
  "custom_text",
  "page_break",
]);

const DEFAULT_FIELDS: Partial<Record<QuoteOutputSectionType, string[]>> = {
  customer: ["company", "region", "contact", "email", "date", "validUntil", "incoterm", "route"],
  items: ["description", "unit", "quantity", "unitPrice", "discount", "amount"],
  totals: ["subtotal", "freight", "additionalCharges", "tax", "total", "conversion"],
  commercial: ["delivery", "payment", "packaging", "warranty"],
  notes: ["notes", "terms"],
  bank: ["bankName", "bankAddress", "accountName", "accountNumber", "swiftCode", "beneficiaryAddress"],
  contact: ["company", "address", "contactName", "contactPhone", "contactEmail", "website", "signature"],
};

const TITLES: Record<QuoteOutputSectionType, [string, string]> = {
  header: ["报价单", "QUOTATION"],
  customer: ["客户与报价信息", "Customer & Quotation"],
  items: ["产品明细", "Quoted Items"],
  totals: ["金额汇总", "Summary"],
  commercial: ["贸易、交付与保障条款", "Commercial Terms"],
  notes: ["备注和公司条款", "Notes and Terms"],
  bank: ["银行信息", "Bank Details"],
  contact: ["联系方式与签名", "Contact & Signature"],
  footer: ["页脚", "Footer"],
  custom_text: ["自定义内容", "Custom Content"],
  page_break: ["分页", "Page Break"],
};

export const DEFAULT_QUOTE_OUTPUT_LAYOUT: QuoteOutputLayout = {
  version: 1,
  accentColor: "#0f5db8",
  sections: [
    section("header"),
    section("customer"),
    section("items"),
    section("totals"),
    section("commercial"),
    section("notes"),
    section("bank"),
    section("contact"),
    section("footer"),
  ],
};

export function normalizeQuoteOutputLayout(input?: Partial<QuoteOutputLayout> | null): QuoteOutputLayout {
  const rawSections = Array.isArray(input?.sections) ? input!.sections.slice(0, 30) : [];
  const usedIds = new Set<string>();
  const sections: QuoteOutputSection[] = [];
  for (const [index, raw] of rawSections.entries()) {
    if (!raw || typeof raw !== "object" || !SECTION_TYPES.has(raw.type as QuoteOutputSectionType)) continue;
    const type = raw.type as QuoteOutputSectionType;
    const fallbackId = `${type}-${index + 1}`;
    let id = cleanText(raw.id, 80).replace(/[^a-zA-Z0-9_-]/g, "") || fallbackId;
    let suffix = usedIds.size + 1;
    while (usedIds.has(id)) id = `${fallbackId}-${suffix++}`;
    usedIds.add(id);
    const allowedFields = DEFAULT_FIELDS[type] || [];
    const requestedFields = Array.isArray(raw.fields) ? raw.fields.map(String) : allowedFields;
    sections.push({
      id,
      type,
      enabled: raw.enabled !== false,
      titleZh: cleanText(raw.titleZh, 160) || TITLES[type][0],
      titleEn: cleanText(raw.titleEn, 160) || TITLES[type][1],
      ...(type === "custom_text"
        ? {
            contentZh: cleanText(raw.contentZh, 10000),
            contentEn: cleanText(raw.contentEn, 10000),
          }
        : {}),
      ...(allowedFields.length
        ? { fields: [...new Set(requestedFields.filter((field) => allowedFields.includes(field)))] }
        : {}),
    });
  }
  return {
    version: 1,
    accentColor: /^#[0-9a-fA-F]{6}$/.test(String(input?.accentColor || ""))
      ? String(input!.accentColor)
      : DEFAULT_QUOTE_OUTPUT_LAYOUT.accentColor,
    sections: sections.length ? sections : cloneQuoteOutputLayout(DEFAULT_QUOTE_OUTPUT_LAYOUT).sections,
  };
}

export function cloneQuoteOutputLayout(layout: QuoteOutputLayout): QuoteOutputLayout {
  return JSON.parse(JSON.stringify(layout));
}

export function quoteSectionTitle(
  section: QuoteOutputSection,
  language: "zh" | "en" | "bilingual",
) {
  if (language === "zh") return section.titleZh;
  if (language === "en") return section.titleEn;
  return [section.titleZh, section.titleEn].filter(Boolean).join(" / ");
}

function section(type: QuoteOutputSectionType): QuoteOutputSection {
  return {
    id: type,
    type,
    enabled: true,
    titleZh: TITLES[type][0],
    titleEn: TITLES[type][1],
    ...(DEFAULT_FIELDS[type] ? { fields: [...DEFAULT_FIELDS[type]!] } : {}),
  };
}

function cleanText(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}
