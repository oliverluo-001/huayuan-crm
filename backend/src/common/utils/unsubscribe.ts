import * as crypto from 'node:crypto';

export function createUnsubscribeToken(email: string, secret: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      email: String(email || '').trim().toLowerCase(),
      issuedAt: Date.now(),
    }),
    'utf8',
  ).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyUnsubscribeToken(token: string, secret: string): { email: string; issuedAt: number } {
  const [payload, signature] = String(token || '').split('.');
  if (!payload || !signature) throw new Error('退订链接无效');

  const expected = Buffer.from(sign(payload, secret));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    throw new Error('退订链接签名无效');
  }

  let decoded: any;
  try {
    decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw new Error('退订链接格式无效');
  }

  const email = String(decoded.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('退订邮箱无效');
  return { email, issuedAt: Number(decoded.issuedAt) || 0 };
}

function sign(payload: string, secret: string): string {
  if (!secret) throw new Error('缺少退订签名密钥');
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}
