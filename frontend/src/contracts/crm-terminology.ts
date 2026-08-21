export const CUSTOMER_TIER_OPTIONS = [
  { value: "A", label: "A - 战略客户" },
  { value: "B", label: "B - 重点客户" },
  { value: "C", label: "C - 培育客户" },
  { value: "D", label: "D - 暂缓跟进" },
] as const;

export const QUOTE_STATUS_OPTIONS = [
  { value: "draft", label: "草稿" },
  { value: "sent", label: "已发送给客户" },
  { value: "accepted", label: "客户已接受" },
  { value: "rejected", label: "客户已拒绝" },
  { value: "expired", label: "已过期" },
] as const;

export const SAMPLE_STATUS_OPTIONS = [
  { value: "pending", label: "待寄出" },
  { value: "sent", label: "已寄出" },
  { value: "delivered", label: "客户已签收" },
  { value: "returned", label: "已退回" },
] as const;

export const LEAD_REGION_OPTIONS = [
  { value: "Global", label: "全球" },
  { value: "Middle East", label: "中东" },
  { value: "Southeast Asia", label: "东南亚" },
  { value: "North America", label: "北美" },
  { value: "Europe", label: "欧洲" },
  { value: "Oceania", label: "大洋洲" },
  { value: "Africa", label: "非洲" },
  { value: "South America", label: "南美" },
  { value: "South Asia", label: "南亚" },
  { value: "East Asia", label: "东亚" },
] as const;

export const LEAD_BUYER_TYPE_OPTIONS = [
  { value: "importer", label: "进口商" },
  { value: "distributor", label: "分销商" },
  { value: "wholesaler", label: "批发商" },
  { value: "stockist", label: "库存商" },
  { value: "dealer", label: "经销商" },
  { value: "supplier", label: "供应商" },
  { value: "trading company", label: "贸易公司" },
  { value: "industrial supplier", label: "工业品供应商" },
  { value: "OEM manufacturer", label: "OEM 制造商" },
  { value: "EPC contractor", label: "EPC 工程承包商" },
  { value: "project contractor", label: "项目承包商" },
  { value: "maintenance contractor", label: "维修服务承包商" },
  { value: "shipyard / marine company", label: "船厂 / 海事企业" },
  { value: "oil & gas company", label: "石油天然气企业" },
  { value: "power plant / energy company", label: "电厂 / 能源企业" },
  {
    value: "pressure vessel / boiler / equipment manufacturer",
    label: "压力容器、锅炉及设备制造商",
  },
  {
    value: "construction / infrastructure contractor",
    label: "建筑 / 基础设施承包商",
  },
] as const;

export const LEAD_ACTION_LABELS: Readonly<Record<string, string>> = {
  "Ready to Email": "可直接联系",
  "Needs Review": "待人工核验",
  Remove: "建议剔除",
  "Hard Bounce": "无效邮箱",
};

export const LEAD_CONFIDENCE_LABELS: Readonly<Record<string, string>> = {
  High: "高可信",
  Medium: "中等可信",
  Low: "低可信",
};

export const LEAD_SOURCE_TYPE_LABELS: Readonly<Record<string, string>> = {
  "Company Website": "企业官网",
  "Contact Page": "官网联系页",
  "Directory / Marketplace": "企业名录 / B2B 平台",
  manual: "手动导入",
};

export const B2B_TASK_STATUS_LABELS: Readonly<Record<string, string>> = {
  draft: "待启动",
  ready: "等待执行",
  running: "搜索中",
  paused: "已暂停",
  completed: "本轮已完成",
  exhausted: "当前搜索策略已执行完",
  cancelled: "已停止",
  failed: "执行失败",
};

export const EMAIL_TASK_STATUS_LABELS: Readonly<Record<string, string>> = {
  pending: "待执行",
  active: "执行中",
  sending: "正在发送",
  completed: "已完成",
  cancelled: "已取消",
  failed: "执行失败",
};

export const EMAIL_SEND_STATUS_LABELS: Readonly<Record<string, string>> = {
  queued: "等待发送",
  sending: "正在发送",
  sent: "发送成功",
  bounced: "邮件退信",
  skipped: "已跳过",
  failed: "发送失败",
};

export const ACTIVITY_TYPE_LABELS: Readonly<Record<string, string>> = {
  email: "邮件往来",
  call: "电话沟通",
  meeting: "客户会议",
  whatsapp: "WhatsApp 沟通",
  note: "跟进记录",
  other: "其他互动",
};

export const ATTACHMENT_CATEGORY_OPTIONS = [
  { value: "inquiry", label: "询价文件" },
  { value: "drawing", label: "产品图纸" },
  { value: "contract", label: "合同文件" },
  { value: "other", label: "其他资料" },
] as const;

export function optionLabel(
  options: readonly { value: string; label: string }[],
  value: string | null | undefined,
  fallback = "未标注",
) {
  if (!value) return fallback;
  return options.find((option) => option.value === value)?.label || value;
}

export function statusLabel(
  labels: Readonly<Record<string, string>>,
  value: string | number | null | undefined,
  fallback = "未知状态",
) {
  if (value === null || value === undefined || value === "") return fallback;
  return labels[String(value)] || fallback;
}
