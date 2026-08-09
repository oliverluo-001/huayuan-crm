const baseUrl = String(process.env.HEALTHCHECK_URL || 'https://crm.huayuanflange.com').replace(/\/+$/, '');
const attempts = Math.max(1, Number(process.env.HEALTHCHECK_ATTEMPTS || 20));
const retryDelayMs = Math.max(0, Number(process.env.HEALTHCHECK_RETRY_DELAY_MS || 3000));

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function checkOnce() {
  const homepage = await fetch(`${baseUrl}/`, {
    headers: { 'user-agent': 'huayuan-crm-deployment-health-check' },
    signal: AbortSignal.timeout(10000),
  });
  if (!homepage.ok) throw new Error(`首页返回 HTTP ${homepage.status}`);
  const html = await homepage.text();
  if (!/<div\s+id=["']root["']/.test(html)) throw new Error('首页缺少前端根节点');

  const authStatus = await fetch(`${baseUrl}/api/auth/status`, {
    headers: { accept: 'application/json', 'user-agent': 'huayuan-crm-deployment-health-check' },
    signal: AbortSignal.timeout(10000),
  });
  if (!authStatus.ok) throw new Error(`登录状态接口返回 HTTP ${authStatus.status}`);
  const payload = await authStatus.json();
  const data = payload?.data ?? payload;
  if (typeof data?.initialized !== 'boolean') throw new Error('登录状态接口缺少 initialized 布尔值');

  return { homepage: homepage.status, authStatus: authStatus.status, initialized: data.initialized };
}

let lastError;
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    const result = await checkOnce();
    console.log(`Deployment health check passed: ${JSON.stringify(result)}`);
    process.exit(0);
  } catch (error) {
    lastError = error;
    console.warn(`Health check attempt ${attempt}/${attempts} failed: ${error.message}`);
    if (attempt < attempts) await sleep(retryDelayMs);
  }
}

console.error(`Deployment health check failed for ${baseUrl}: ${lastError?.message || lastError}`);
process.exit(1);
