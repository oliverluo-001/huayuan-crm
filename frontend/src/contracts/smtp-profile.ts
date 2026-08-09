export interface SmtpProfileDraft {
  smtpHost: string;
  smtpPort: string;
  smtpSecure: boolean;
  smtpUser: string;
  smtpFrom: string;
}

export function validateSmtpProfileDraft(profile: SmtpProfileDraft) {
  const host = profile.smtpHost.trim().toLowerCase();
  const port = Number.parseInt(profile.smtpPort, 10);
  const user = profile.smtpUser.trim();

  if (!host) return "请输入 SMTP 服务器地址";
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return "SMTP 端口必须在 1 到 65535 之间";
  }
  if (port === 465 && !profile.smtpSecure) {
    return "465 端口必须选择 SSL/TLS 安全连接";
  }
  if (port === 587 && profile.smtpSecure) {
    return "587 端口应选择 STARTTLS（页面中对应非 SSL 模式）";
  }
  if (host.includes("zoho") && !/^\S+@\S+\.\S+$/.test(user)) {
    return "Zoho SMTP 用户名必须填写完整邮箱地址，例如 zachary.kael@huayuanflange.com";
  }
  if (!user) return "请输入 SMTP 用户名";
  if (!profile.smtpFrom.trim()) return "请输入发件人地址";
  return null;
}

export function smtpConfigurationHint(profile: SmtpProfileDraft) {
  const host = profile.smtpHost.trim().toLowerCase();
  if (!host.includes("zoho")) return null;
  return "Zoho：付费企业域名邮箱通常使用 smtppro.zoho.com；免费组织或个人账户通常使用 smtp.zoho.com。465 选择 SSL/TLS，587 选择 STARTTLS，用户名填写完整邮箱地址。最终以 Zoho 账户内 Server Configuration Details 为准。";
}
