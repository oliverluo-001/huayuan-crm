import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { QuoteOutputTemplate } from "./entities";
import {
  DEFAULT_QUOTE_OUTPUT_LAYOUT,
  normalizeQuoteOutputLayout,
  type QuoteOutputLayout,
} from "./quote-output-layout";

export interface SaveQuoteOutputTemplateInput {
  name: string;
  description?: string;
  layout: QuoteOutputLayout;
  isDefault?: boolean;
  active?: boolean;
}

@Injectable()
export class QuoteOutputTemplatesService {
  constructor(
    @InjectRepository(QuoteOutputTemplate)
    private readonly repository: Repository<QuoteOutputTemplate>,
  ) {}

  async findAll(includeInactive = false) {
    const templates = await this.repository.find({ order: { isDefault: "DESC", name: "ASC" } });
    return templates
      .filter((template) => includeInactive || template.active)
      .map((template) => ({
        ...template,
        layout: normalizeQuoteOutputLayout(template.layout),
      }));
  }

  async create(input: SaveQuoteOutputTemplateInput, actorId: string) {
    await this.assertUniqueName(input.name);
    if (input.isDefault) await this.clearDefault();
    const template = this.repository.create({
      name: this.cleanName(input.name),
      description: String(input.description || "").trim().slice(0, 500),
      layout: normalizeQuoteOutputLayout(input.layout),
      isDefault: Boolean(input.isDefault),
      active: input.active !== false,
      createdBy: actorId,
    });
    return this.repository.save(template);
  }

  async update(id: number, input: Partial<SaveQuoteOutputTemplateInput>) {
    const template = await this.requireOne(id);
    if (template.isDefault && (input.active === false || input.isDefault === false)) {
      throw new BadRequestException("请先将其他报价模板设为默认，再停用当前模板");
    }
    if (input.name !== undefined && this.cleanName(input.name) !== template.name) {
      await this.assertUniqueName(input.name, id);
      template.name = this.cleanName(input.name);
    }
    if (input.description !== undefined) {
      template.description = String(input.description || "").trim().slice(0, 500);
    }
    if (input.layout !== undefined) template.layout = normalizeQuoteOutputLayout(input.layout);
    if (input.active !== undefined) template.active = Boolean(input.active);
    if (input.isDefault === true) {
      await this.clearDefault();
      template.isDefault = true;
      template.active = true;
    } else if (input.isDefault === false) {
      template.isDefault = false;
    }
    return this.repository.save(template);
  }

  async remove(id: number) {
    const template = await this.requireOne(id);
    if (template.isDefault) throw new BadRequestException("默认报价模板不能删除，请先设置其他默认模板");
    await this.repository.delete(id);
    return { deleted: true };
  }

  async resolveLayout(
    layout?: QuoteOutputLayout | null,
    templateId?: number | null,
  ): Promise<{ outputTemplateId: number | null; outputLayout: QuoteOutputLayout }> {
    if (templateId) {
      const template = await this.requireOne(Number(templateId));
      if (!template.active) throw new BadRequestException("所选报价模板已停用");
    }
    if (layout) {
      return {
        outputTemplateId: templateId ? Number(templateId) : null,
        outputLayout: normalizeQuoteOutputLayout(layout),
      };
    }
    if (templateId) {
      const template = await this.requireOne(Number(templateId));
      if (!template.active) throw new BadRequestException("所选报价模板已停用");
      return { outputTemplateId: template.id, outputLayout: normalizeQuoteOutputLayout(template.layout) };
    }
    const defaultTemplate = await this.repository.findOne({
      where: { isDefault: true, active: true },
    });
    return {
      outputTemplateId: defaultTemplate?.id || null,
      outputLayout: normalizeQuoteOutputLayout(defaultTemplate?.layout || DEFAULT_QUOTE_OUTPUT_LAYOUT),
    };
  }

  private async requireOne(id: number) {
    const template = await this.repository.findOne({ where: { id } });
    if (!template) throw new NotFoundException("报价输出模板不存在");
    return template;
  }

  private async assertUniqueName(name: string, excludeId?: number) {
    const cleaned = this.cleanName(name);
    const existing = await this.repository
      .createQueryBuilder("template")
      .where("LOWER(template.name) = LOWER(:name)", { name: cleaned })
      .getOne();
    if (existing && existing.id !== excludeId) throw new BadRequestException("报价模板名称已存在");
  }

  private cleanName(name: string) {
    const cleaned = String(name || "").trim().slice(0, 120);
    if (!cleaned) throw new BadRequestException("请输入报价模板名称");
    return cleaned;
  }

  private async clearDefault() {
    await this.repository
      .createQueryBuilder()
      .update(QuoteOutputTemplate)
      .set({ isDefault: false })
      .where("is_default = :isDefault", { isDefault: true })
      .execute();
  }
}
