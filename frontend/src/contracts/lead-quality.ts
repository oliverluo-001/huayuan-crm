import type { B2BLead } from "@/types";

export function isLeadImportable(lead: B2BLead): boolean {
  return !leadSelectionBlockReason(lead);
}

/** Explain the exact gate that keeps a lead out of the selectable email pool. */
export function leadSelectionBlockReason(lead: B2BLead): string {
  const quality = lead.rawData?.contactQuality;
  const age = Date.now() - Date.parse(quality?.checkedAt || "");
  if (!lead.company) return "未识别公司名称";
  if (!lead.email) return "未发现公开邮箱";
  if (!lead.sourceUrl) return "缺少官网或来源页面";
  if (lead.crmCustomerId) return "已转入客户库";
  if (lead.status === "duplicate") return "重复线索";
  if (lead.recommendedAction !== "Ready to Email") return lead.reviewReason || "尚未通过联系前质量检查";
  if (lead.emailStatus !== "domain_valid") return "邮箱域名尚未通过核验";
  if (quality?.version !== 2) return "尚未完成最新来源页核验";
  if (quality.suppressed) return "邮箱已退订、硬退信或被禁止联系";
  if (!quality.published) return "来源网页未复核到该邮箱";
  if (quality.sourceStatus !== 200) return "官网或来源页面当前无法访问";
  if (quality.email !== lead.email.trim().toLowerCase()) return "邮箱与最新核验结果不一致";
  if (quality.sourceUrl !== lead.sourceUrl) return "来源页面已变化，请重新核验";
  if (!Number.isFinite(age) || age < 0 || age >= 6 * 60 * 60_000) return "联系方式核验已过期，请重新验证";
  return "";
}
