import type { B2BLead } from "@/types";

export function isLeadImportable(lead: B2BLead): boolean {
  const quality = lead.rawData?.contactQuality;
  const age = Date.now() - Date.parse(quality?.checkedAt || "");
  return Boolean(lead.company && lead.email && lead.sourceUrl && !lead.crmCustomerId && lead.status !== "duplicate" &&
    lead.recommendedAction === "Ready to Email" && lead.emailStatus === "domain_valid" && quality?.version === 2 &&
    quality.published && !quality.suppressed && quality.sourceStatus === 200 &&
    quality.email === lead.email.trim().toLowerCase() && quality.sourceUrl === lead.sourceUrl && age >= 0 && age < 6 * 60 * 60_000);
}
