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

export interface QuoteOutputTemplate {
  id: number;
  name: string;
  description: string;
  layout: QuoteOutputLayout;
  isDefault: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export const QUOTE_SECTION_DEFINITIONS: Record<QuoteOutputSectionType, {
  label: string;
  titleZh: string;
  titleEn: string;
  fields?: Array<{ key: string; label: string }>;
}> = {
  header: { label: "报价抬头", titleZh: "报价单", titleEn: "QUOTATION" },
  customer: {
    label: "客户与报价信息", titleZh: "客户与报价信息", titleEn: "Customer & Quotation",
    fields: [
      ["company", "客户公司"], ["region", "国家/地区"], ["contact", "联系人"], ["email", "邮箱"],
      ["date", "报价日期"], ["validUntil", "有效期"], ["incoterm", "贸易条款"], ["route", "运输路线"],
    ].map(([key, label]) => ({ key, label })),
  },
  items: {
    label: "产品明细", titleZh: "产品明细", titleEn: "Quoted Items",
    fields: [
      ["description", "产品描述"], ["unit", "单位"], ["quantity", "数量"], ["unitPrice", "单价"],
      ["discount", "折扣"], ["amount", "金额"],
    ].map(([key, label]) => ({ key, label })),
  },
  totals: {
    label: "金额汇总", titleZh: "金额汇总", titleEn: "Summary",
    fields: [
      ["subtotal", "商品小计"], ["freight", "运费"], ["additionalCharges", "附加费用"],
      ["tax", "税费"], ["total", "报价总额"], ["conversion", "参考折算"],
    ].map(([key, label]) => ({ key, label })),
  },
  commercial: {
    label: "贸易与交付条款", titleZh: "贸易、交付与保障条款", titleEn: "Commercial Terms",
    fields: [["delivery", "交期"], ["payment", "付款条件"], ["packaging", "包装"], ["warranty", "质保"]]
      .map(([key, label]) => ({ key, label })),
  },
  notes: {
    label: "备注与公司条款", titleZh: "备注和公司条款", titleEn: "Notes and Terms",
    fields: [["notes", "报价备注"], ["terms", "公司条款"]].map(([key, label]) => ({ key, label })),
  },
  bank: {
    label: "银行信息", titleZh: "银行信息", titleEn: "Bank Details",
    fields: [
      ["bankName", "开户行"], ["bankAddress", "银行地址"], ["accountName", "收款人"],
      ["accountNumber", "账号"], ["swiftCode", "SWIFT"], ["beneficiaryAddress", "收款人地址"],
    ].map(([key, label]) => ({ key, label })),
  },
  contact: {
    label: "联系方式与签名", titleZh: "联系方式与签名", titleEn: "Contact & Signature",
    fields: [
      ["company", "公司"], ["address", "地址"], ["contactName", "联系人"], ["contactPhone", "电话"],
      ["contactEmail", "邮箱"], ["website", "网站"], ["signature", "签名图片"],
    ].map(([key, label]) => ({ key, label })),
  },
  footer: { label: "页脚", titleZh: "页脚", titleEn: "Footer" },
  custom_text: { label: "自定义内容", titleZh: "自定义内容", titleEn: "Custom Content" },
  page_break: { label: "强制分页", titleZh: "分页", titleEn: "Page Break" },
};

export const DEFAULT_QUOTE_OUTPUT_LAYOUT: QuoteOutputLayout = {
  version: 1,
  accentColor: "#0f5db8",
  sections: (["header", "customer", "items", "totals", "commercial", "notes", "bank", "contact", "footer"] as QuoteOutputSectionType[])
    .map(createQuoteSection),
};

export function createQuoteSection(type: QuoteOutputSectionType): QuoteOutputSection {
  const definition = QUOTE_SECTION_DEFINITIONS[type];
  return {
    id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    enabled: true,
    titleZh: definition.titleZh,
    titleEn: definition.titleEn,
    ...(definition.fields ? { fields: definition.fields.map((field) => field.key) } : {}),
    ...(type === "custom_text" ? { contentZh: "", contentEn: "" } : {}),
  };
}

export function cloneQuoteOutputLayout(layout: QuoteOutputLayout): QuoteOutputLayout {
  return JSON.parse(JSON.stringify(layout));
}
