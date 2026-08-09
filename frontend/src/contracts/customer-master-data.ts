export interface CustomerMasterForm {
  country: string;
  address: string;
  customerType: string;
  mainMarkets: string;
  annualPurchaseAmount: string;
  preferredCurrency: string;
  preferredIncoterm: string;
  source: string;
  ownerId: string;
  collaboratorIds: string[];
}

export const EMPTY_CUSTOMER_MASTER_FORM: CustomerMasterForm = {
  country: "",
  address: "",
  customerType: "",
  mainMarkets: "",
  annualPurchaseAmount: "",
  preferredCurrency: "USD",
  preferredIncoterm: "",
  source: "",
  ownerId: "",
  collaboratorIds: [],
};

export const CUSTOMER_TYPE_OPTIONS = [
  { value: "manufacturer", label: "制造商" },
  { value: "distributor", label: "经销商" },
  { value: "importer", label: "进口商" },
  { value: "trading_company", label: "贸易公司" },
  { value: "epc_contractor", label: "EPC / 工程承包商" },
  { value: "end_user", label: "终端用户" },
  { value: "other", label: "其他" },
] as const;

export const CUSTOMER_SOURCE_OPTIONS = [
  { value: "lead", label: "自动化获客" },
  { value: "manual", label: "手工录入" },
  { value: "website", label: "官网询盘" },
  { value: "exhibition", label: "展会" },
  { value: "referral", label: "客户转介绍" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "search", label: "主动开发" },
  { value: "email", label: "邮件询盘" },
  { value: "import", label: "批量导入" },
  { value: "other", label: "其他" },
] as const;

export const CURRENCY_OPTIONS = ["USD", "EUR", "CNY", "GBP", "JPY", "AUD", "CAD"] as const;
export const INCOTERM_OPTIONS = ["EXW", "FCA", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"] as const;

export const DECISION_ROLE_OPTIONS = [
  { value: "decision_maker", label: "最终决策人" },
  { value: "influencer", label: "决策影响者" },
  { value: "champion", label: "内部支持者" },
  { value: "user", label: "产品使用者" },
  { value: "gatekeeper", label: "信息把关人" },
  { value: "other", label: "其他" },
] as const;

export const PURCHASING_INFLUENCE_OPTIONS = [
  { value: "high", label: "高" },
  { value: "medium", label: "中" },
  { value: "low", label: "低" },
] as const;

export const CONTACT_STATUS_OPTIONS = [
  { value: "unknown", label: "待确认" },
  { value: "active", label: "在职且可联系" },
  { value: "inactive", label: "暂不联系" },
  { value: "left", label: "已离职" },
] as const;

export const PREFERRED_LANGUAGE_OPTIONS = ["中文", "英语", "西班牙语", "法语", "德语", "葡萄牙语", "俄语", "阿拉伯语", "日语", "韩语", "泰语", "印尼语"] as const;

export function masterOptionLabel(
  options: ReadonlyArray<{ value: string; label: string }>,
  value?: string,
) {
  if (!value) return "未填写";
  return options.find((option) => option.value === value)?.label || value;
}
