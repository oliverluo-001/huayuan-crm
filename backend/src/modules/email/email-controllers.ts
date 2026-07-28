import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  HttpCode,
  Res,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Response } from 'express';
import { EmailService } from './email.service';
import { CustomersService } from '../customers/customers.service';
import { SuppressionService } from '../suppression/suppression.service';
import { SettingsService } from '../settings/settings.service';
import { createUnsubscribeToken, verifyUnsubscribeToken } from '../../common/utils/unsubscribe';

@Controller()
export class EmailRecipientsController {
  constructor(
    private readonly emailService: EmailService,
    private readonly customersService: CustomersService,
    private readonly suppressionService: SuppressionService,
  ) {}

  @Get('email-recipients')
  async findAll(@Query() query: Record<string, any>) {
    const q = (query.q || '').toLowerCase();
    const needIds = query.ids === 'true';
    const offset = Math.max(0, Number(query.offset) || 0);
    const limit = Math.min(500, Math.max(1, Number(query.limit) || 50));

    // Build customer filters
    const filters: Record<string, any> = {};
    if (query.tag) filters.tag = query.tag;
    if (query.tier) filters.tier = query.tier;
    if (query.region) filters.region = query.region;
    if (query.emailStatus) filters.emailStatus = query.emailStatus;
    if (query.ownerId) filters.ownerId = query.ownerId;

    const result = await this.customersService.findAll(filters);
    const customers = Array.isArray(result) ? result : result.customers || [];

    const rows: any[] = [];
    const seenEmails = new Set<string>();

    for (const customer of customers) {
      const customerId = (customer as any).customerId || String(customer.id);
      const customerEmail = ((customer as any).email || '').toLowerCase().trim();

      if (customerEmail && !seenEmails.has(customerEmail)) {
        seenEmails.add(customerEmail);
        const customerSuppressed = await this.suppressionService.isSuppressed(customerEmail);
        const recipientKey = `customer:${customerId}`;
        const searchText = `${customerEmail} ${(customer as any).company || ''} ${(customer as any).contact || ''}`.toLowerCase();
        if (!q || searchText.includes(q)) {
          rows.push({
            recipientKey,
            type: 'customer',
            email: customerEmail,
            name: (customer as any).company || '',
            contact: (customer as any).contact || '',
            customerId,
            customerName: (customer as any).company || '',
            region: (customer as any).region || '',
            emailStatus: (customer as any).emailStatus || 'unknown',
            suppressed: customerSuppressed,
          });
        }
      }

      // Check contacts for this customer
      const contacts = await this.customersService.findContacts(
        typeof customer.id === 'number' ? customer.id : parseInt(customer.id, 10) || 0,
      );
      for (const contact of contacts) {
        const contactEmail = (contact.email || '').toLowerCase().trim();
        if (!contactEmail || seenEmails.has(contactEmail)) continue;
        seenEmails.add(contactEmail);

        const contactSuppressed = await this.suppressionService.isSuppressed(contactEmail);
        const recipientKey = `contact:${contact.contactId || contact.id}`;
        const searchText = `${contactEmail} ${contact.name} ${(customer as any).company || ''}`.toLowerCase();
        if (!q || searchText.includes(q)) {
          rows.push({
            recipientKey,
            type: 'contact',
            email: contactEmail,
            name: contact.name,
            contact: contact.name,
            customerId,
            customerName: (customer as any).company || '',
            region: (customer as any).region || '',
            emailStatus: (customer as any).emailStatus || 'unknown',
            suppressed: contactSuppressed,
          });
        }
      }
    }

    if (needIds) {
      return {
        ids: rows.filter((r) => !r.suppressed).map((r) => r.recipientKey),
      };
    }

    return {
      recipients: rows.slice(offset, offset + limit),
      total: rows.length,
      offset,
      limit,
    };
  }
}

@Controller()
export class UnsubscribeController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly suppressionService: SuppressionService,
  ) {}

  @Get('unsubscribe')
  servePage(@Query('token') token: string, @Res() res: Response) {
    const safeToken = escapeHtml(token || '');
    const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>邮件退订</title><style>body{font-family:system-ui,sans-serif;background:#f5f7fa;margin:0;padding:40px;color:#172033}.box{max-width:520px;margin:auto;background:#fff;border:1px solid #dde3ec;padding:28px;border-radius:8px}button{width:100%;padding:12px;border:0;border-radius:6px;background:#0b65d8;color:#fff;font-weight:700}.msg{margin-top:16px}</style></head>
<body><main class="box"><h1>停止接收营销邮件</h1><p>确认后，该邮箱会加入禁止发送名单，后续邮件任务将自动跳过。</p>
<button id="unsubscribe">确认退订</button><div id="message" class="msg"></div></main>
<script>document.getElementById("unsubscribe").onclick=async()=>{const b=document.getElementById("unsubscribe"),m=document.getElementById("message");b.disabled=true;try{const r=await fetch("/api/unsubscribe",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:"${safeToken}"})});const d=await r.json();if(!r.ok)throw new Error(d.error||"退订失败");m.textContent="退订成功，后续不会再发送营销邮件。";}catch(e){m.textContent=e.message;b.disabled=false;}};</script></body></html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(html);
  }

  @Post('api/unsubscribe')
  @HttpCode(200)
  async unsubscribe(@Body() body: { token: string }) {
    if (!body.token) {
      throw new BadRequestException('退订链接无效');
    }

    const secret = await this.getUnsubscribeSecret();
    let email: string;
    try {
      const result = verifyUnsubscribeToken(body.token, secret);
      email = result.email;
    } catch (e: any) {
      throw new BadRequestException(e.message || '退订链接验证失败');
    }

    await this.suppressionService.add({ email, reason: '收件人通过邮件链接退订' });
    return { ok: true };
  }

  private async getUnsubscribeSecret(): Promise<string> {
    const setting = await this.settingsService.findOne('unsubscribe_secret');
    if (setting && typeof setting === 'object' && (setting as any).value) {
      return (setting as any).value;
    }
    if (typeof setting === 'string') {
      return setting;
    }
    // Generate a random secret if none exists
    const crypto = require('node:crypto');
    const secret = crypto.randomBytes(32).toString('hex');
    await this.settingsService.upsert('unsubscribe_secret', secret);
    return secret;
  }
}

function escapeHtml(value: any): string {
  return String(value ?? '').replace(/[&<>'"]/g, (ch: string) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[ch] || ch,
  );
}
