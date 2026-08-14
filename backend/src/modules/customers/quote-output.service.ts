import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import type { Archiver } from "archiver";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Brackets, In, Repository } from "typeorm";
import { CustomerAttachment } from "../attachments/customer-attachment.entity";
import { Product } from "../products/entities";
import { SettingsService } from "../settings/settings.service";
import {
  QuoteOutputLanguage,
  QuoteOutputProfile,
  normalizeQuoteOutputLanguage,
} from "../settings/quote-output-profile";
import { Customer, Quote } from "./entities";

type QuoteWithItems = Quote & { items?: any[] };
const createArchiver = require("archiver") as (
  format: "zip",
  options: Record<string, unknown>,
) => Archiver;

interface BrandImage {
  dataUri: string;
  filePath: string;
  extension: "png" | "jpeg";
}

interface ExportContext {
  quote: QuoteWithItems;
  customer: Customer;
  profile: QuoteOutputProfile;
  language: QuoteOutputLanguage;
  logo?: BrandImage;
  signature?: BrandImage;
}

@Injectable()
export class QuoteOutputService {
  private readonly productAssetRoot: string;
  private readonly customerAttachmentRoot: string;

  constructor(
    private readonly settingsService: SettingsService,
    configService: ConfigService,
    @InjectRepository(CustomerAttachment)
    private readonly attachmentRepository: Repository<CustomerAttachment>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {
    this.productAssetRoot = path.resolve(
      configService.get<string>("PRODUCT_ASSET_DIR") ||
        path.join(process.cwd(), "storage", "product-assets"),
    );
    this.customerAttachmentRoot = path.resolve(
      configService.get<string>("CUSTOMER_ATTACHMENT_DIR") ||
        path.join(process.cwd(), "storage", "customer-attachments"),
    );
  }

  normalizeLanguage(value: unknown, fallback?: QuoteOutputLanguage) {
    return value === "zh" || value === "en" || value === "bilingual"
      ? value
      : fallback || "bilingual";
  }

  async renderHtml(
    quote: QuoteWithItems,
    customer: Customer,
    language?: unknown,
    mode: "preview" | "download" = "download",
  ) {
    const context = await this.buildContext(quote, customer, language);
    const rows = this.quoteItems(context.quote)
      .map(
        (item, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>
              <strong>${escapeHtml(item.productName || "-")}</strong>
              ${this.itemDescription(item) ? `<br><span class="muted">${escapeHtml(this.itemDescription(item))}</span>` : ""}
            </td>
            <td>${escapeHtml(item.unit || "pcs")}</td>
            <td class="number">${formatNumber(item.quantity)}</td>
            <td class="number">${this.money(item.unitPrice, context.quote.currency)}</td>
            <td class="number">${formatNumber(item.discount)}%</td>
            <td class="number">${this.money(item.subtotal, context.quote.currency)}</td>
          </tr>`,
      )
      .join("");
    const charges = this.additionalCharges(context.quote)
      .map(
        (charge) => `
          <div><span>${escapeHtml(charge.label || "附加费用")}</span><strong>${this.money(charge.amount, context.quote.currency)}</strong></div>`,
      )
      .join("");
    const route = [context.quote.originPort, context.quote.destinationPort]
      .filter(Boolean)
      .map(escapeHtml)
      .join(" - ");
    const title = this.pick(context, "报价单", "QUOTATION");
    const toolbar =
      mode === "preview"
        ? `<div class="toolbar"><button onclick="window.print()">打印 / Print</button></div>`
        : "";

    return `<!doctype html>
<html lang="${context.language === "en" ? "en" : "zh-CN"}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)} ${escapeHtml(context.quote.quoteNo || "")}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #eef2f7; color: #172033; font: 14px/1.55 Arial, "Microsoft YaHei", sans-serif; }
    .toolbar { position: sticky; top: 0; z-index: 5; display: flex; justify-content: flex-end; gap: 8px; padding: 12px 24px; background: rgba(255,255,255,.92); border-bottom: 1px solid #d8e0ea; }
    .toolbar button { border: 1px solid #cbd5e1; background: #111827; color: white; border-radius: 6px; padding: 8px 14px; cursor: pointer; }
    main { width: 920px; min-height: 1180px; margin: 24px auto; padding: 50px 54px; background: white; box-shadow: 0 18px 45px rgba(15, 23, 42, .12); }
    header { display: grid; grid-template-columns: 1fr auto; gap: 24px; padding-bottom: 22px; border-bottom: 3px solid #0f5db8; }
    .brand { display: flex; gap: 18px; align-items: center; min-width: 0; }
    .brand img { max-width: 156px; max-height: 64px; object-fit: contain; }
    h1 { margin: 0; color: #0f3473; font-size: 30px; letter-spacing: .02em; }
    h2 { margin: 4px 0 0; color: #64748b; font-size: 14px; font-weight: 500; }
    .quote-no { text-align: right; color: #64748b; }
    .quote-no strong { display: block; color: #0f5db8; font-size: 20px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 36px; margin: 28px 0; }
    .meta strong, .commercial strong { display: block; color: #667085; font-size: 12px; }
    .meta span { display: block; min-height: 22px; font-size: 15px; }
    table { width: 100%; border-collapse: collapse; margin-top: 22px; }
    th { background: #eef5ff; color: #173967; text-align: left; font-size: 12px; }
    th, td { border: 1px solid #dce3ee; padding: 10px; vertical-align: top; }
    .number { text-align: right; white-space: nowrap; }
    .muted { color: #68748b; font-size: 12px; }
    .totals { width: 370px; margin: 22px 0 0 auto; }
    .totals div { display: flex; justify-content: space-between; gap: 18px; padding: 7px 0; border-bottom: 1px solid #e5e9f0; }
    .totals .grand { border-bottom: 0; color: #0f5db8; font-size: 18px; font-weight: 700; }
    .commercial { margin-top: 30px; display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #dce3ee; }
    .commercial div { padding: 10px 12px; border-bottom: 1px solid #e5e9f0; min-height: 58px; }
    .commercial div:nth-child(odd) { border-right: 1px solid #e5e9f0; }
    .commercial span, .notes { white-space: pre-wrap; }
    .notes { margin-top: 24px; padding-top: 12px; border-top: 1px solid #dce3ee; }
    .notes h3 { margin: 0 0 8px; color: #173967; font-size: 14px; }
    .bank { margin-top: 24px; padding: 14px 16px; border: 1px solid #dce3ee; background: #f8fafc; }
    .bank h3 { margin: 0 0 10px; font-size: 14px; color: #173967; }
    .bank dl { display: grid; grid-template-columns: 140px 1fr; gap: 6px 18px; margin: 0; }
    .bank dt { color: #667085; }
    .bank dd { margin: 0; font-weight: 600; }
    .sign { margin-top: 38px; display: flex; justify-content: space-between; align-items: end; gap: 24px; }
    .sign img { max-width: 180px; max-height: 72px; object-fit: contain; }
    footer { margin-top: 34px; color: #7b8495; font-size: 12px; }
    @media print { body { background: white; } .toolbar { display: none; } main { width: auto; min-height: auto; margin: 0; padding: 16mm; box-shadow: none; } }
  </style>
</head>
<body>${toolbar}<main>
  <header>
    <div class="brand">
      ${context.logo ? `<img src="${context.logo.dataUri}" alt="Logo" />` : ""}
      <div>
        <h1>${escapeHtml(title)}</h1>
        <h2>${escapeHtml(this.companyName(context))}${this.tagline(context) ? ` · ${escapeHtml(this.tagline(context))}` : ""}</h2>
      </div>
    </div>
    <div class="quote-no"><span>${escapeHtml(this.pick(context, "报价编号", "Quote No."))}</span><strong>${escapeHtml(context.quote.quoteNo || "-")}</strong></div>
  </header>
  <section class="meta">
    <div><strong>${escapeHtml(this.pick(context, "客户", "Customer"))}</strong><span>${escapeHtml(customer.company || "-")}</span></div>
    <div><strong>${escapeHtml(this.pick(context, "地区", "Region"))}</strong><span>${escapeHtml(customer.region || customer.country || "-")}</span></div>
    <div><strong>${escapeHtml(this.pick(context, "联系人", "Contact"))}</strong><span>${escapeHtml(customer.contact || "-")}</span></div>
    <div><strong>${escapeHtml(this.pick(context, "邮箱", "Email"))}</strong><span>${escapeHtml(customer.email || "-")}</span></div>
    <div><strong>${escapeHtml(this.pick(context, "报价日期", "Date"))}</strong><span>${formatDate(context.quote.createdAt)}</span></div>
    <div><strong>${escapeHtml(this.pick(context, "有效期至", "Valid Until"))}</strong><span>${formatDate(context.quote.validUntil)}</span></div>
    <div><strong>Incoterms</strong><span>${escapeHtml(context.quote.incoterm || "-")}</span></div>
    <div><strong>${escapeHtml(this.pick(context, "运输路线", "Route"))}</strong><span>${route || "-"}</span></div>
  </section>
  <table>
    <thead><tr><th>#</th><th>${escapeHtml(this.pick(context, "产品描述", "Description"))}</th><th>${escapeHtml(this.pick(context, "单位", "Unit"))}</th><th class="number">${escapeHtml(this.pick(context, "数量", "Qty"))}</th><th class="number">${escapeHtml(this.pick(context, "单价", "Unit Price"))}</th><th class="number">${escapeHtml(this.pick(context, "折扣", "Discount"))}</th><th class="number">${escapeHtml(this.pick(context, "金额", "Amount"))}</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="7">${escapeHtml(this.pick(context, "暂无产品行", "No items"))}</td></tr>`}</tbody>
  </table>
  <section class="totals">
    <div><span>${escapeHtml(this.pick(context, "商品小计", "Subtotal"))}</span><strong>${this.money(context.quote.subtotal, context.quote.currency)}</strong></div>
    <div><span>${escapeHtml(this.pick(context, "运费", "Freight"))}</span><strong>${this.money(context.quote.freight, context.quote.currency)}</strong></div>
    ${charges}
    <div><span>${escapeHtml(this.pick(context, "税费", "Tax"))} (${formatNumber(context.quote.taxRate)}%)</span><strong>${this.money(context.quote.taxAmount, context.quote.currency)}</strong></div>
    <div class="grand"><span>${escapeHtml(this.pick(context, "报价总额", "Total"))}</span><strong>${this.money(context.quote.total, context.quote.currency)}</strong></div>
  </section>
  <section class="commercial">
    <div><strong>${escapeHtml(this.pick(context, "交期", "Delivery"))}</strong><span>${escapeHtml(context.quote.deliveryTime || "-")}</span></div>
    <div><strong>${escapeHtml(this.pick(context, "付款条件", "Payment Terms"))}</strong><span>${escapeHtml(context.quote.paymentTerms || "-")}</span></div>
    <div><strong>${escapeHtml(this.pick(context, "包装", "Packaging"))}</strong><span>${escapeHtml(context.quote.packagingTerms || "-")}</span></div>
    <div><strong>${escapeHtml(this.pick(context, "质保", "Warranty"))}</strong><span>${escapeHtml(context.quote.warrantyTerms || "-")}</span></div>
  </section>
  ${this.notesHtml(context)}
  ${this.bankHtml(context)}
  <section class="sign"><div>${this.contactBlock(context)}</div>${context.signature ? `<img src="${context.signature.dataUri}" alt="Signature" />` : ""}</section>
  <footer>${escapeHtml(this.footer(context))}</footer>
</main></body></html>`;
  }

  async createPdfBuffer(quote: QuoteWithItems, customer: Customer, language?: unknown) {
    const context = await this.buildContext(quote, customer, language);
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: "A4",
        margin: 36,
        bufferPages: true,
        info: {
          Title: `${this.pick(context, "报价单", "Quotation")} ${quote.quoteNo || ""}`,
          Author: this.companyName(context),
        },
      });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      doc.on("error", reject);
      doc.on("end", () => resolve(Buffer.concat(chunks)));

      this.registerFonts(doc);
      this.drawPdf(context, doc);
      doc.end();
    });
  }

  async createExcelBuffer(quote: QuoteWithItems, customer: Customer, language?: unknown) {
    const context = await this.buildContext(quote, customer, language);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = this.companyName(context);
    workbook.created = new Date();
    workbook.modified = new Date();
    const sheet = workbook.addWorksheet("Quotation", {
      views: [{ showGridLines: false, state: "frozen", ySplit: 11 }],
      pageSetup: {
        paperSize: 9,
        orientation: "portrait",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.35, right: 0.35, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 },
      },
    });

    sheet.columns = [
      { key: "no", width: 6 },
      { key: "description", width: 38 },
      { key: "unit", width: 10 },
      { key: "qty", width: 12 },
      { key: "price", width: 14 },
      { key: "discount", width: 12 },
      { key: "amount", width: 16 },
    ];

    sheet.mergeCells("A1:E1");
    sheet.getCell("A1").value = this.pick(context, "报价单", "QUOTATION");
    sheet.getCell("A1").font = { bold: true, size: 20, color: { argb: "FF0F3473" } };
    sheet.getCell("A2").value = `${this.companyName(context)}${this.tagline(context) ? ` - ${this.tagline(context)}` : ""}`;
    sheet.getCell("A2").font = { color: { argb: "FF64748B" } };
    sheet.getCell("F1").value = this.pick(context, "报价编号", "Quote No.");
    sheet.getCell("G1").value = quote.quoteNo || "-";
    sheet.getCell("G1").font = { bold: true, color: { argb: "FF0F5DB8" } };

    await this.addExcelImage(workbook, sheet, context.logo, "F2:G5", 150, 56);

    const metaRows = [
      [this.pick(context, "客户", "Customer"), customer.company || "-", this.pick(context, "联系人", "Contact"), customer.contact || "-"],
      [this.pick(context, "地区", "Region"), customer.region || customer.country || "-", this.pick(context, "邮箱", "Email"), customer.email || "-"],
      [this.pick(context, "报价日期", "Date"), formatDate(quote.createdAt), this.pick(context, "有效期至", "Valid Until"), formatDate(quote.validUntil)],
      ["Incoterms", quote.incoterm || "-", this.pick(context, "运输路线", "Route"), [quote.originPort, quote.destinationPort].filter(Boolean).join(" - ") || "-"],
    ];
    let row = 4;
    for (const meta of metaRows) {
      sheet.getRow(row).values = [meta[0], meta[1], "", meta[2], meta[3]];
      sheet.mergeCells(`B${row}:C${row}`);
      sheet.mergeCells(`E${row}:G${row}`);
      [1, 4].forEach((col) => {
        sheet.getCell(row, col).font = { bold: true, color: { argb: "FF667085" } };
        sheet.getCell(row, col).fill = lightFill;
      });
      row++;
    }

    row += 1;
    const headerRow = row;
    sheet.getRow(headerRow).values = [
      "#",
      this.pick(context, "产品描述", "Description"),
      this.pick(context, "单位", "Unit"),
      this.pick(context, "数量", "Qty"),
      this.pick(context, "单价", "Unit Price"),
      this.pick(context, "折扣", "Discount"),
      this.pick(context, "金额", "Amount"),
    ];
    styleHeader(sheet.getRow(headerRow));

    const firstItemRow = headerRow + 1;
    for (const [index, item] of this.quoteItems(quote).entries()) {
      const itemRow = sheet.getRow(firstItemRow + index);
      itemRow.values = [
        index + 1,
        [item.productName, this.itemDescription(item)].filter(Boolean).join("\n"),
        item.unit || "pcs",
        Number(item.quantity || 0),
        Number(item.unitPrice || 0),
        Number(item.discount || 0) / 100,
        {
          formula: `D${itemRow.number}*E${itemRow.number}*(1-F${itemRow.number})`,
          result: Number(item.subtotal || 0),
        },
      ];
      itemRow.height = this.itemDescription(item) ? 42 : 24;
      itemRow.eachCell((cell) => {
        cell.border = thinBorder;
        cell.alignment = { vertical: "top", wrapText: true };
      });
      sheet.getCell(itemRow.number, 4).numFmt = "#,##0.00";
      sheet.getCell(itemRow.number, 5).numFmt = `"${quote.currency || "USD"}" #,##0.00`;
      sheet.getCell(itemRow.number, 6).numFmt = "0.00%";
      sheet.getCell(itemRow.number, 7).numFmt = `"${quote.currency || "USD"}" #,##0.00`;
    }
    const lastItemRow = Math.max(firstItemRow, firstItemRow + this.quoteItems(quote).length - 1);
    row = lastItemRow + 2;

    const totalRows = [
      [this.pick(context, "商品小计", "Subtotal"), { formula: `SUM(G${firstItemRow}:G${lastItemRow})`, result: Number(quote.subtotal || 0) }],
      [this.pick(context, "运费", "Freight"), Number(quote.freight || 0)],
      ...this.additionalCharges(quote).map((charge) => [charge.label, Number(charge.amount || 0)]),
      [this.pick(context, "税费", "Tax"), { formula: `G${row}*${Number(quote.taxRate || 0) / 100}`, result: Number(quote.taxAmount || 0) }],
      [this.pick(context, "报价总额", "Total"), Number(quote.total || 0)],
      [
        `${this.pick(context, "参考折算", "Reference Conversion")} (${quote.baseCurrency || "CNY"})`,
        {
          formula: `G${row + this.additionalCharges(quote).length + 3}*${Number(quote.exchangeRate || 1)}`,
          result: roundMoney(Number(quote.total || 0) * Number(quote.exchangeRate || 1)),
        },
      ],
    ];
    const summaryStart = row;
    for (const total of totalRows) {
      sheet.getCell(row, 5).value = total[0] as any;
      sheet.getCell(row, 6).value = "";
      sheet.getCell(row, 7).value = total[1] as any;
      sheet.getCell(row, 5).font = { bold: row >= summaryStart + totalRows.length - 2 };
      sheet.getCell(row, 7).font = { bold: row >= summaryStart + totalRows.length - 2 };
      sheet.getCell(row, 7).numFmt = `"${row === summaryStart + totalRows.length - 1 ? quote.baseCurrency || "CNY" : quote.currency || "USD"}" #,##0.00`;
      row++;
    }

    row += 1;
    row = this.writeExcelSection(sheet, row, this.pick(context, "贸易、交付与保障条款", "Commercial Terms"), [
      [this.pick(context, "交期", "Delivery"), quote.deliveryTime || "-"],
      [this.pick(context, "付款条件", "Payment Terms"), quote.paymentTerms || "-"],
      [this.pick(context, "包装", "Packaging"), quote.packagingTerms || "-"],
      [this.pick(context, "质保", "Warranty"), quote.warrantyTerms || "-"],
    ]);
    row = this.writeExcelSection(sheet, row + 1, this.pick(context, "备注和公司条款", "Notes and Terms"), this.excelNotes(context));
    if (this.hasBankInfo(context.profile)) {
      row = this.writeExcelSection(sheet, row + 1, this.pick(context, "银行信息", "Bank Details"), this.bankRows(context));
    }
    row = this.writeExcelSection(sheet, row + 1, this.pick(context, "联系方式", "Contact"), this.contactRows(context));
    await this.addExcelImage(workbook, sheet, context.signature, `F${row}:G${row + 3}`, 150, 54);

    sheet.eachRow((excelRow) => {
      excelRow.eachCell((cell) => {
        cell.alignment = { vertical: "top", wrapText: true, ...cell.alignment };
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer as ArrayBuffer);
  }

  async createQuotePackage(quote: QuoteWithItems, customer: Customer, language?: unknown) {
    const selectedLanguage = await this.resolveLanguage(language);
    const [pdf, excel, html, files] = await Promise.all([
      this.createPdfBuffer(quote, customer, selectedLanguage),
      this.createExcelBuffer(quote, customer, selectedLanguage),
      this.renderHtml(quote, customer, selectedLanguage, "download"),
      this.collectPackageFiles(quote),
    ]);
    const baseName = this.quoteFileBase(quote);
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const archive = createArchiver("zip", { zlib: { level: 9 } });
      const chunks: Buffer[] = [];
      archive.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      archive.on("error", reject);
      archive.on("end", () => resolve(Buffer.concat(chunks)));
      archive.append(pdf, { name: `${baseName}/${baseName}.pdf` });
      archive.append(excel, { name: `${baseName}/${baseName}.xlsx` });
      archive.append(html, { name: `${baseName}/${baseName}-print.html` });
      archive.append(JSON.stringify(this.manifest(quote, customer, files), null, 2), {
        name: `${baseName}/manifest.json`,
      });
      for (const file of files) {
        archive.file(file.filePath, { name: `${baseName}/${file.folder}/${file.name}` });
      }
      archive.finalize();
    });
    return { buffer, fileName: `${baseName}.zip` };
  }

  quoteFileBase(quote: QuoteWithItems, extension?: string) {
    const base = `quotation-${sanitizeFilename(quote.quoteNo || String(quote.id || "quote"))}`;
    return extension ? `${base}.${extension}` : base;
  }

  private async buildContext(
    quote: QuoteWithItems,
    customer: Customer,
    language?: unknown,
  ): Promise<ExportContext> {
    const profile = await this.settingsService.getQuoteOutputProfile();
    const selectedLanguage = this.normalizeLanguage(language, profile.defaultLanguage);
    const [logo, signature] = await Promise.all([
      this.loadBrandImage("logo"),
      this.loadBrandImage("signature"),
    ]);
    return {
      quote,
      customer,
      profile,
      language: selectedLanguage,
      logo,
      signature,
    };
  }

  private async resolveLanguage(language?: unknown) {
    if (language === "zh" || language === "en" || language === "bilingual") return language;
    return normalizeQuoteOutputLanguage((await this.settingsService.getQuoteOutputProfile()).defaultLanguage);
  }

  private async loadBrandImage(kind: "logo" | "signature"): Promise<BrandImage | undefined> {
    try {
      const { asset, filePath } = await this.settingsService.getQuoteOutputAsset(kind);
      const ext = path.extname(asset.originalName).toLowerCase();
      if (![".png", ".jpg", ".jpeg"].includes(ext)) return undefined;
      const buffer = await fs.readFile(filePath);
      const mimeType = ext === ".png" ? "image/png" : "image/jpeg";
      return {
        dataUri: `data:${mimeType};base64,${buffer.toString("base64")}`,
        filePath,
        extension: ext === ".png" ? "png" : "jpeg",
      };
    } catch {
      return undefined;
    }
  }

  private drawPdf(context: ExportContext, doc: PDFKit.PDFDocument) {
    const quote = context.quote;
    const customer = context.customer;
    const margin = doc.page.margins.left;
    const pageWidth = doc.page.width - margin * 2;

    if (context.logo) {
      doc.image(context.logo.filePath, margin, 35, { fit: [135, 52] });
    }
    doc
      .font("NotoBold")
      .fontSize(22)
      .fillColor("#0f3473")
      .text(this.pick(context, "报价单", "QUOTATION"), context.logo ? margin + 150 : margin, 40, {
        width: pageWidth - 220,
      });
    doc
      .font("Noto")
      .fontSize(9)
      .fillColor("#64748b")
      .text(`${this.companyName(context)}${this.tagline(context) ? ` - ${this.tagline(context)}` : ""}`, {
        width: pageWidth - 220,
      });
    doc
      .font("Noto")
      .fontSize(9)
      .fillColor("#64748b")
      .text(this.pick(context, "报价编号", "Quote No."), margin + pageWidth - 150, 43, { width: 150, align: "right" });
    doc
      .font("NotoBold")
      .fontSize(13)
      .fillColor("#0f5db8")
      .text(quote.quoteNo || "-", margin + pageWidth - 150, 58, { width: 150, align: "right" });
    doc.moveTo(margin, 98).lineTo(margin + pageWidth, 98).lineWidth(2).strokeColor("#0f5db8").stroke();
    doc.y = 116;

    const meta = [
      [this.pick(context, "客户", "Customer"), customer.company || "-"],
      [this.pick(context, "地区", "Region"), customer.region || customer.country || "-"],
      [this.pick(context, "联系人", "Contact"), customer.contact || "-"],
      [this.pick(context, "邮箱", "Email"), customer.email || "-"],
      [this.pick(context, "报价日期", "Date"), formatDate(quote.createdAt)],
      [this.pick(context, "有效期至", "Valid Until"), formatDate(quote.validUntil)],
      ["Incoterms", quote.incoterm || "-"],
      [this.pick(context, "运输路线", "Route"), [quote.originPort, quote.destinationPort].filter(Boolean).join(" - ") || "-"],
    ];
    for (let index = 0; index < meta.length; index += 2) {
      const y = doc.y;
      this.pdfMeta(doc, margin, y, meta[index][0], meta[index][1], pageWidth / 2 - 18);
      this.pdfMeta(doc, margin + pageWidth / 2 + 18, y, meta[index + 1][0], meta[index + 1][1], pageWidth / 2 - 18);
      doc.y = y + 38;
    }

    doc.y += 10;
    this.drawPdfTable(context, doc);
    this.drawPdfTotals(context, doc);
    this.drawPdfSections(context, doc);
    this.drawPdfFooter(context, doc);
  }

  private drawPdfTable(context: ExportContext, doc: PDFKit.PDFDocument) {
    const margin = doc.page.margins.left;
    const widths = [26, 222, 42, 50, 72, 52, 80];
    const headerHeight = 42;
    const headers = ["#", this.pick(context, "产品描述", "Description"), this.pick(context, "单位", "Unit"), this.pick(context, "数量", "Qty"), this.pick(context, "单价", "Unit Price"), this.pick(context, "折扣", "Discount"), this.pick(context, "金额", "Amount")];
    const drawHeader = () => {
      this.ensurePdfSpace(doc, headerHeight + 12);
      let x = margin;
      const startY = doc.y;
      doc.rect(margin, startY, widths.reduce((sum, value) => sum + value, 0), headerHeight).fill("#eef5ff").stroke("#dce3ee");
      doc.font("NotoBold").fontSize(7.5).fillColor("#173967");
      headers.forEach((header, index) => {
        doc.text(header, x + 4, startY + 8, {
          width: widths[index] - 8,
          align: index >= 3 ? "right" : "left",
          lineGap: 1,
        });
        x += widths[index];
      });
      doc.y = startY + headerHeight;
    };
    drawHeader();
    for (const [index, item] of this.quoteItems(context.quote).entries()) {
      const description = [item.productName || "-", this.itemDescription(item)].filter(Boolean).join("\n");
      const descriptionHeight = doc.heightOfString(description, { width: widths[1] - 8 });
      const rowHeight = Math.max(38, descriptionHeight + 14);
      this.ensurePdfSpace(doc, rowHeight + 12, drawHeader);
      const startY = doc.y;
      let x = margin;
      const cells = [
        String(index + 1),
        description,
        item.unit || "pcs",
        formatNumber(item.quantity),
        this.money(item.unitPrice, context.quote.currency),
        `${formatNumber(item.discount)}%`,
        this.money(item.subtotal, context.quote.currency),
      ];
      doc.font("Noto").fontSize(8).fillColor("#172033");
      cells.forEach((cell, cellIndex) => {
        doc.rect(x, startY, widths[cellIndex], rowHeight).strokeColor("#dce3ee").stroke();
        doc.text(cell, x + 4, startY + 7, {
          width: widths[cellIndex] - 8,
          align: cellIndex >= 3 ? "right" : "left",
        });
        x += widths[cellIndex];
      });
      doc.y = startY + rowHeight;
    }
  }

  private drawPdfTotals(context: ExportContext, doc: PDFKit.PDFDocument) {
    this.ensurePdfSpace(doc, 110);
    const x = doc.page.width - doc.page.margins.right - 230;
    let y = doc.y + 14;
    const rows = [
      [this.pick(context, "商品小计", "Subtotal"), this.money(context.quote.subtotal, context.quote.currency)],
      [this.pick(context, "运费", "Freight"), this.money(context.quote.freight, context.quote.currency)],
      ...this.additionalCharges(context.quote).map((charge) => [charge.label, this.money(charge.amount, context.quote.currency)]),
      [`${this.pick(context, "税费", "Tax")} (${formatNumber(context.quote.taxRate)}%)`, this.money(context.quote.taxAmount, context.quote.currency)],
      [this.pick(context, "报价总额", "Total"), this.money(context.quote.total, context.quote.currency)],
    ];
    for (const [index, row] of rows.entries()) {
      const isGrand = index === rows.length - 1;
      doc
        .font(isGrand ? "NotoBold" : "Noto")
        .fontSize(isGrand ? 11 : 9)
        .fillColor(isGrand ? "#0f5db8" : "#172033")
        .text(row[0], x, y, { width: 112 })
        .text(row[1], x + 116, y, { width: 114, align: "right" });
      y += isGrand ? 20 : 17;
    }
    doc.y = y + 6;
  }

  private drawPdfSections(context: ExportContext, doc: PDFKit.PDFDocument) {
    const sections: Array<[string, Array<[string, string]>]> = [
      [
        this.pick(context, "贸易、交付与保障条款", "Commercial Terms"),
        [
          [this.pick(context, "交期", "Delivery"), String(context.quote.deliveryTime || "-")],
          [this.pick(context, "付款条件", "Payment Terms"), String(context.quote.paymentTerms || "-")],
          [this.pick(context, "包装", "Packaging"), String(context.quote.packagingTerms || "-")],
          [this.pick(context, "质保", "Warranty"), String(context.quote.warrantyTerms || "-")],
        ],
      ],
      [this.pick(context, "备注和公司条款", "Notes and Terms"), this.excelNotes(context).map(([a, b]) => [a, String(b)])],
    ];
    if (this.hasBankInfo(context.profile)) {
      sections.push([this.pick(context, "银行信息", "Bank Details"), this.bankRows(context)]);
    }
    sections.push([this.pick(context, "联系方式", "Contact"), this.contactRows(context)]);

    for (const [title, rows] of sections) {
      this.ensurePdfSpace(doc, 70);
      doc.font("NotoBold").fontSize(11).fillColor("#173967").text(title, doc.page.margins.left, doc.y + 6);
      doc.y += 22;
      for (const [label, value] of rows) {
        this.ensurePdfSpace(doc, 28);
        const startY = doc.y;
        const text = value || "-";
        const height = Math.max(22, doc.heightOfString(text, { width: 360 }) + 8);
        doc
          .font("NotoBold")
          .fontSize(8)
          .fillColor("#667085")
          .text(label, doc.page.margins.left, startY + 4, { width: 120 });
        doc
          .font("Noto")
          .fontSize(8)
          .fillColor("#172033")
          .text(text, doc.page.margins.left + 130, startY + 4, { width: 380 });
        doc.y = startY + height;
      }
    }

    if (context.signature) {
      this.ensurePdfSpace(doc, 78);
      doc.image(context.signature.filePath, doc.page.width - doc.page.margins.right - 160, doc.y, {
        fit: [150, 60],
      });
      doc.y += 68;
    }
  }

  private drawPdfFooter(context: ExportContext, doc: PDFKit.PDFDocument) {
    const range = doc.bufferedPageRange();
    for (let pageIndex = range.start; pageIndex < range.start + range.count; pageIndex++) {
      doc.switchToPage(pageIndex);
      const footerY = doc.page.height - 45;
      doc
        .font("Noto")
        .fontSize(7)
        .fillColor("#7b8495")
        .text(this.footer(context), doc.page.margins.left, footerY, {
          width: doc.page.width - doc.page.margins.left - doc.page.margins.right - 60,
        })
        .text(`${pageIndex + 1} / ${range.count}`, doc.page.width - doc.page.margins.right - 42, footerY, {
          width: 42,
          align: "right",
        });
    }
  }

  private pdfMeta(doc: PDFKit.PDFDocument, x: number, y: number, label: string, value: string, width: number) {
    doc.font("NotoBold").fontSize(8).fillColor("#667085").text(label, x, y, { width });
    doc.font("Noto").fontSize(9).fillColor("#172033").text(value || "-", x, y + 13, { width });
  }

  private ensurePdfSpace(doc: PDFKit.PDFDocument, height: number, afterAdd?: () => void) {
    const bottom = doc.page.height - doc.page.margins.bottom - 46;
    if (doc.y + height <= bottom) return;
    doc.addPage();
    doc.y = doc.page.margins.top;
    if (afterAdd) afterAdd();
  }

  private registerFonts(doc: PDFKit.PDFDocument) {
    const packageRoot = path.dirname(require.resolve("source-han-sans-cn/package.json"));
    doc.registerFont("Noto", path.join(packageRoot, "SourceHanSansCN-Regular.otf"));
    doc.registerFont("NotoBold", path.join(packageRoot, "SourceHanSansCN-Bold.otf"));
    doc.font("Noto");
  }

  private async addExcelImage(
    workbook: ExcelJS.Workbook,
    sheet: ExcelJS.Worksheet,
    image: BrandImage | undefined,
    range: string,
    width: number,
    height: number,
  ) {
    if (!image) return;
    const buffer = await fs.readFile(image.filePath);
    const imageId = workbook.addImage({
      buffer: buffer as any,
      extension: image.extension,
    });
    sheet.addImage(imageId, range);
    const [start] = range.split(":");
    const cell = sheet.getCell(start);
    const rowNumber = Number(cell.row);
    sheet.getColumn(cell.col).width = Math.max(sheet.getColumn(cell.col).width || 0, Math.ceil(width / 7));
    sheet.getRow(rowNumber).height = Math.max(sheet.getRow(rowNumber).height || 0, height * 0.75);
  }

  private writeExcelSection(sheet: ExcelJS.Worksheet, row: number, title: string, rows: Array<[string, string]>) {
    sheet.mergeCells(`A${row}:G${row}`);
    sheet.getCell(row, 1).value = title;
    sheet.getCell(row, 1).font = { bold: true, color: { argb: "FF173967" } };
    sheet.getCell(row, 1).fill = lightFill;
    row++;
    for (const [label, value] of rows) {
      sheet.getCell(row, 1).value = label;
      sheet.getCell(row, 1).font = { bold: true, color: { argb: "FF667085" } };
      sheet.mergeCells(`B${row}:G${row}`);
      sheet.getCell(row, 2).value = value || "-";
      sheet.getCell(row, 2).alignment = { wrapText: true, vertical: "top" };
      sheet.getRow(row).height = Math.max(22, Math.min(64, Math.ceil(String(value || "-").length / 72) * 16));
      for (let col = 1; col <= 7; col++) sheet.getCell(row, col).border = thinBorder;
      row++;
    }
    return row;
  }

  private async collectPackageFiles(quote: QuoteWithItems) {
    const files: Array<{ filePath: string; folder: string; name: string; source: string }> = [];
    const used = new Map<string, number>();

    const customerAttachments = await this.attachmentRepository.find({
      where: { customerId: quote.customerId },
      order: { createdAt: "DESC" },
    });
    for (const attachment of customerAttachments) {
      const filePath = this.resolveStoredPath(this.customerAttachmentRoot, attachment.storedName);
      if (!(await fileExists(filePath))) continue;
      files.push({
        filePath,
        folder: "customer-attachments",
        name: this.uniquePackageName(used, attachment.originalName),
        source: `customer:${attachment.category}`,
      });
    }

    const productIds = Array.from(new Set(this.quoteItems(quote).map((item) => String(item.productId || "").trim()).filter(Boolean)));
    if (productIds.length) {
      const numericIds = productIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
      const products = await this.productRepository
        .createQueryBuilder("product")
        .leftJoinAndSelect("product.assets", "asset")
        .where(
          new Brackets((qb) => {
            qb.where("product.productId IN (:...productIds)", { productIds });
            if (numericIds.length) qb.orWhere("product.id IN (:...numericIds)", { numericIds });
          }),
        )
        .getMany();
      for (const product of products) {
        for (const asset of (product.assets || []).filter((item) => item.assetType === "technical")) {
          const filePath = this.resolveStoredPath(this.productAssetRoot, asset.storedName);
          if (!(await fileExists(filePath))) continue;
          files.push({
            filePath,
            folder: "product-technical-files",
            name: this.uniquePackageName(used, `${product.sku || product.name}-${asset.originalName}`),
            source: `product:${product.sku || product.productId}`,
          });
        }
      }
    }
    return files;
  }

  private uniquePackageName(used: Map<string, number>, value: string) {
    const safe = sanitizeFilename(value || "attachment");
    const count = used.get(safe) || 0;
    used.set(safe, count + 1);
    if (!count) return safe;
    const extension = path.extname(safe);
    const base = extension ? safe.slice(0, -extension.length) : safe;
    return `${base}-${count + 1}${extension}`;
  }

  private manifest(
    quote: QuoteWithItems,
    customer: Customer,
    files: Array<{ folder: string; name: string; source: string }>,
  ) {
    return {
      quoteNo: quote.quoteNo,
      customer: customer.company,
      generatedAt: new Date().toISOString(),
      includedOutputs: ["pdf", "xlsx", "print-html"],
      includedAttachments: files.map((file) => ({
        path: `${file.folder}/${file.name}`,
        source: file.source,
      })),
    };
  }

  private quoteItems(quote: QuoteWithItems) {
    return [...(quote.items || [])].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
  }

  private additionalCharges(quote: QuoteWithItems) {
    return Array.isArray(quote.additionalCharges) ? quote.additionalCharges : [];
  }

  private itemDescription(item: any) {
    if (item.description) return String(item.description);
    const details = [
      item.sku,
      item.standard,
      item.material,
      item.pressureRating,
      item.nominalSize,
      item.facing,
      item.surfaceTreatment,
      item.packaging,
      item.inspectionRequirements && `Inspection: ${item.inspectionRequirements}`,
      item.certificateRequirements && `Certificates: ${item.certificateRequirements}`,
    ].filter(Boolean);
    return details.join(", ");
  }

  private pick(context: ExportContext, zh: string, en: string) {
    if (context.language === "zh") return zh;
    if (context.language === "en") return en;
    return `${zh} / ${en}`;
  }

  private companyName(context: ExportContext) {
    if (context.language === "zh") return context.profile.companyNameZh || context.profile.companyNameEn;
    if (context.language === "en") return context.profile.companyNameEn || context.profile.companyNameZh;
    return [context.profile.companyNameZh, context.profile.companyNameEn].filter(Boolean).join(" / ");
  }

  private tagline(context: ExportContext) {
    if (context.language === "zh") return context.profile.taglineZh;
    if (context.language === "en") return context.profile.taglineEn;
    return [context.profile.taglineZh, context.profile.taglineEn].filter(Boolean).join(" / ");
  }

  private footer(context: ExportContext) {
    if (context.language === "zh") return context.profile.footerZh;
    if (context.language === "en") return context.profile.footerEn;
    return [context.profile.footerZh, context.profile.footerEn].filter(Boolean).join("\n");
  }

  private notesHtml(context: ExportContext) {
    const notes = this.excelNotes(context)
      .filter(([, value]) => value && value !== "-")
      .map(([label, value]) => `<section class="notes"><h3>${escapeHtml(label)}</h3>${escapeHtml(value)}</section>`)
      .join("");
    return notes;
  }

  private excelNotes(context: ExportContext): Array<[string, string]> {
    const rows: Array<[string, string]> = [];
    if (context.language !== "en") {
      if (context.quote.notes) rows.push(["中文备注", String(context.quote.notes)]);
      if (context.quote.terms) rows.push(["公司条款", String(context.quote.terms)]);
    }
    if (context.language !== "zh") {
      if (context.quote.notesEn) rows.push(["English Notes", String(context.quote.notesEn)]);
      if (context.quote.termsEn) rows.push(["Company Terms", String(context.quote.termsEn)]);
    }
    return rows.length ? rows : [[this.pick(context, "备注", "Notes"), "-"]];
  }

  private bankHtml(context: ExportContext) {
    if (!this.hasBankInfo(context.profile)) return "";
    return `<section class="bank"><h3>${escapeHtml(this.pick(context, "银行信息", "Bank Details"))}</h3><dl>${this.bankRows(context)
      .map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || "-")}</dd>`)
      .join("")}</dl></section>`;
  }

  private bankRows(context: ExportContext): Array<[string, string]> {
    return ([
      [this.pick(context, "开户行", "Bank"), context.profile.bankName],
      [this.pick(context, "银行地址", "Bank Address"), context.profile.bankAddress],
      [this.pick(context, "收款人", "Beneficiary"), context.profile.accountName],
      [this.pick(context, "账号", "Account No."), context.profile.accountNumber],
      ["SWIFT", context.profile.swiftCode],
      [this.pick(context, "收款人地址", "Beneficiary Address"), context.profile.beneficiaryAddress],
    ] as Array<[string, string]>).filter(([, value]) => value);
  }

  private contactBlock(context: ExportContext) {
    return this.contactRows(context)
      .map(([label, value]) => `<div><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value || "-")}</div>`)
      .join("");
  }

  private contactRows(context: ExportContext): Array<[string, string]> {
    return ([
      [this.pick(context, "公司", "Company"), this.companyName(context)],
      [this.pick(context, "地址", "Address"), context.language === "en" ? context.profile.addressEn : context.profile.addressZh || context.profile.addressEn],
      [this.pick(context, "联系人", "Contact"), [context.profile.contactName, context.profile.contactTitle].filter(Boolean).join(" - ")],
      [this.pick(context, "电话", "Phone"), context.profile.contactPhone || context.profile.phone],
      [this.pick(context, "邮箱", "Email"), context.profile.contactEmail || context.profile.email],
      [this.pick(context, "网站", "Website"), context.profile.website],
    ] as Array<[string, string]>).filter(([, value]) => value);
  }

  private hasBankInfo(profile: QuoteOutputProfile) {
    return Boolean(
      profile.bankName ||
        profile.bankAddress ||
        profile.accountName ||
        profile.accountNumber ||
        profile.swiftCode ||
        profile.beneficiaryAddress,
    );
  }

  private money(value: unknown, currency = "USD") {
    return `${currency || "USD"} ${formatMoney(value)}`;
  }

  private resolveStoredPath(root: string, storedName: string) {
    if (path.basename(storedName) !== storedName) throw new BadRequestException("附件路径无效");
    const resolved = path.resolve(root, storedName);
    if (!resolved.startsWith(`${root}${path.sep}`)) throw new BadRequestException("附件路径无效");
    return resolved;
  }
}

const lightFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF5FF" } };
const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFDCE3EE" } },
  left: { style: "thin", color: { argb: "FFDCE3EE" } },
  bottom: { style: "thin", color: { argb: "FFDCE3EE" } },
  right: { style: "thin", color: { argb: "FFDCE3EE" } },
};

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = lightFill;
    cell.font = { bold: true, color: { argb: "FF173967" } };
    cell.border = thinBorder;
    cell.alignment = { vertical: "middle", wrapText: true };
  });
}

function formatNumber(value: unknown) {
  return Number(value || 0).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
}

function formatMoney(value: unknown) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatDate(value: unknown) {
  if (!value) return "-";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return text.slice(0, 10);
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(
    /[&<>'"]/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        ch
      ] || ch,
  );
}

function sanitizeFilename(value: string) {
  const base = path.basename(String(value || "file")).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
  return (base || "file").slice(0, 180);
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
