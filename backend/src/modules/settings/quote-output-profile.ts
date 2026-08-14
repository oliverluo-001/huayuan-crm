export type QuoteOutputLanguage = "zh" | "en" | "bilingual";
export type QuoteBrandAssetKind = "logo" | "signature";

export interface QuoteBrandAsset {
  storedName: string;
  originalName: string;
  mimeType: string;
  size: number;
  updatedAt: string;
}

export interface QuoteOutputProfile {
  companyNameZh: string;
  companyNameEn: string;
  taglineZh: string;
  taglineEn: string;
  addressZh: string;
  addressEn: string;
  phone: string;
  email: string;
  website: string;
  contactName: string;
  contactTitle: string;
  contactPhone: string;
  contactEmail: string;
  bankName: string;
  bankAddress: string;
  accountName: string;
  accountNumber: string;
  swiftCode: string;
  beneficiaryAddress: string;
  defaultLanguage: QuoteOutputLanguage;
  footerZh: string;
  footerEn: string;
  logoAsset: QuoteBrandAsset | null;
  signatureAsset: QuoteBrandAsset | null;
}

export const DEFAULT_QUOTE_OUTPUT_PROFILE: QuoteOutputProfile = {
  companyNameZh: "华源法兰",
  companyNameEn: "Huayuan Flange",
  taglineZh: "专业法兰及管件出口服务",
  taglineEn: "Professional flange and pipe fitting export service",
  addressZh: "",
  addressEn: "",
  phone: "",
  email: "",
  website: "https://crm.huayuanflange.com",
  contactName: "",
  contactTitle: "",
  contactPhone: "",
  contactEmail: "",
  bankName: "",
  bankAddress: "",
  accountName: "",
  accountNumber: "",
  swiftCode: "",
  beneficiaryAddress: "",
  defaultLanguage: "bilingual",
  footerZh: "本报价仅供指定客户评估使用，未经书面许可不得转发。",
  footerEn:
    "This quotation is provided for the named customer only and may not be forwarded without written permission.",
  logoAsset: null,
  signatureAsset: null,
};

const TEXT_LIMITS: Record<keyof Omit<QuoteOutputProfile, "defaultLanguage" | "logoAsset" | "signatureAsset">, number> = {
  companyNameZh: 160,
  companyNameEn: 160,
  taglineZh: 240,
  taglineEn: 240,
  addressZh: 500,
  addressEn: 500,
  phone: 80,
  email: 160,
  website: 240,
  contactName: 120,
  contactTitle: 120,
  contactPhone: 80,
  contactEmail: 160,
  bankName: 200,
  bankAddress: 500,
  accountName: 200,
  accountNumber: 120,
  swiftCode: 80,
  beneficiaryAddress: 500,
  footerZh: 1000,
  footerEn: 1000,
};

export function normalizeQuoteOutputLanguage(value: unknown): QuoteOutputLanguage {
  return value === "zh" || value === "en" || value === "bilingual"
    ? value
    : DEFAULT_QUOTE_OUTPUT_PROFILE.defaultLanguage;
}

export function normalizeQuoteOutputProfile(input: Partial<QuoteOutputProfile> = {}): QuoteOutputProfile {
  const merged = { ...DEFAULT_QUOTE_OUTPUT_PROFILE, ...input };
  const output: QuoteOutputProfile = { ...DEFAULT_QUOTE_OUTPUT_PROFILE };

  for (const key of Object.keys(TEXT_LIMITS) as Array<keyof typeof TEXT_LIMITS>) {
    output[key] = String(merged[key] ?? "")
      .trim()
      .slice(0, TEXT_LIMITS[key]) as never;
  }

  output.defaultLanguage = normalizeQuoteOutputLanguage(merged.defaultLanguage);
  output.logoAsset = normalizeBrandAsset(merged.logoAsset);
  output.signatureAsset = normalizeBrandAsset(merged.signatureAsset);

  return output;
}

function normalizeBrandAsset(value: unknown): QuoteBrandAsset | null {
  if (!value || typeof value !== "object") return null;
  const asset = value as Partial<QuoteBrandAsset>;
  if (!asset.storedName || !asset.originalName) return null;
  return {
    storedName: String(asset.storedName).trim().slice(0, 120),
    originalName: String(asset.originalName).trim().slice(0, 255),
    mimeType: String(asset.mimeType || "application/octet-stream").slice(0, 160),
    size: Number(asset.size || 0),
    updatedAt: String(asset.updatedAt || new Date().toISOString()),
  };
}
