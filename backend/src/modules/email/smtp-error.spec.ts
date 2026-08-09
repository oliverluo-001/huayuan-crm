import { formatSmtpError } from "./smtp-error";

describe("formatSmtpError", () => {
  it("turns SMTP 535 into actionable Chinese guidance", () => {
    expect(
      formatSmtpError({
        responseCode: 535,
        response: "535 Authentication Failed",
      }),
    ).toContain("邮箱授权码");
  });

  it("explains connection and TLS failures", () => {
    expect(formatSmtpError({ code: "ECONNREFUSED" })).toContain(
      "无法连接 SMTP 服务器",
    );
    expect(formatSmtpError(new Error("self-signed certificate"))).toContain(
      "安全连接失败",
    );
  });
});
