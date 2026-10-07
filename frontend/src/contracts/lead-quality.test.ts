import { describe, expect, it } from "vitest";
import type { B2BLead } from "@/types";
import { isLeadImportable } from "./lead-quality";

const eligible = (): B2BLead => ({ id: "1", taskId: "t", company: "Buyer", status: "candidate", createdAt: "", email: "sales@buyer.com", sourceUrl: "https://buyer.com/contact", emailStatus: "domain_valid", recommendedAction: "Ready to Email", rawData: { contactQuality: { version: 2, email: "sales@buyer.com", sourceUrl: "https://buyer.com/contact", sourceStatus: 200, checkedAt: new Date().toISOString(), published: true, suppressed: false, reasons: [] } } });
describe("lead contact quality gate", () => {
  it("allows freshly checked contacts including use as an array filter", () => {
    expect([eligible(), eligible()].filter(isLeadImportable)).toHaveLength(2);
  });
  it("rejects old scores, missing email, duplicates and already converted records", () => {
    for (const patch of [{ rawData: {} }, { email: "" }, { status: "duplicate" }, { crmCustomerId: "customer" }, { recommendedAction: "Needs Review" }]) {
      expect(isLeadImportable({ ...eligible(), ...patch })).toBe(false);
    }
  });
  it("rejects stale, changed, absent or suppressed source evidence", () => {
    for (const patch of [{ checkedAt: new Date(Date.now() - 7 * 3600_000).toISOString() }, { email: "other@buyer.com" }, { published: false }, { suppressed: true }, { sourceStatus: 403 }]) {
      const lead = eligible(); Object.assign(lead.rawData!.contactQuality!, patch);
      expect(isLeadImportable(lead)).toBe(false);
    }
  });
});
