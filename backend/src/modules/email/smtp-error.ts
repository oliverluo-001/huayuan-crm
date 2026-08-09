const SMTP_AUTHENTICATION_ERROR =
  "SMTP 认证失败：请在“设置 → SMTP 发信配置”中重新填写邮箱授权码（通常不是网页登录密码），保存并测试连接后再重新运行任务";

export function formatSmtpError(error: unknown) {
  const candidate = error as {
    response?: unknown;
    message?: unknown;
    code?: unknown;
    responseCode?: unknown;
  };
  const raw = String(
    candidate?.response || candidate?.message || error || "未知错误",
  );
  const code = String(candidate?.code || "");
  const responseCode = Number(candidate?.responseCode || 0);

  if (
    responseCode === 535 ||
    /\b535\b|authentication failed|invalid login|bad credentials|username and password not accepted/i.test(
      raw,
    )
  ) {
    return SMTP_AUTHENTICATION_ERROR;
  }
  if (
    ["ECONNECTION", "ECONNREFUSED", "ENOTFOUND"].includes(code) ||
    /connection refused|getaddrinfo|enotfound/i.test(raw)
  ) {
    return "无法连接 SMTP 服务器，请检查服务器地址、端口和网络设置";
  }
  if (code === "ETIMEDOUT" || /timed? out|timeout/i.test(raw)) {
    return "连接 SMTP 服务器超时，请检查端口和安全连接方式";
  }
  if (/certificate|self[- ]signed|tls/i.test(raw)) {
    return "SMTP 安全连接失败，请核对端口与 SSL/TLS 设置";
  }
  return raw.slice(0, 2000);
}
