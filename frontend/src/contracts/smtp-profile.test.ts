import { describe, expect, it } from "vitest";
import {
  smtpConfigurationHint,
  validateSmtpProfileDraft,
} from "./smtp-profile";

const validZoho = {
  smtpHost: "smtppro.zoho.com",
  smtpPort: "465",
  smtpSecure: true,
  smtpUser: "zachary.kael@huayuanflange.com",
  smtpFrom: "zachary.kael@huayuanflange.com",
};

describe("SMTP profile contract", () => {
  it("accepts Zoho SSL settings with a complete email username", () => {
    expect(validateSmtpProfileDraft(validZoho)).toBeNull();
    expect(smtpConfigurationHint(validZoho)).toContain("smtppro.zoho.com");
  });

  it("rejects port 465 without SSL and incomplete Zoho usernames", () => {
    expect(
      validateSmtpProfileDraft({ ...validZoho, smtpSecure: false }),
    ).toContain("SSL/TLS");
    expect(
      validateSmtpProfileDraft({ ...validZoho, smtpUser: "huayuan_owner" }),
    ).toContain("完整邮箱地址");
  });

  it("requires STARTTLS mode for port 587", () => {
    expect(
      validateSmtpProfileDraft({
        ...validZoho,
        smtpPort: "587",
        smtpSecure: true,
      }),
    ).toContain("STARTTLS");
  });
});
