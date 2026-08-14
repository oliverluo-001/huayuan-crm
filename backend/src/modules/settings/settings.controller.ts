import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  HttpCode,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { SettingsService } from './settings.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  SearchProfileDto,
  AiProfileDto,
  SmtpProfileDto,
  ImapProfileDto,
  EmailPolicyDto,
  QuoteOutputProfileDto,
} from './dto';

interface RequestUser { sub: number; role: 'admin' | 'sales' | 'viewer' }
const smtpOwnerId = (user: RequestUser) => user.role === 'sales' ? String(user.sub) : undefined;
const mailboxOwnerId = smtpOwnerId;

@Controller('settings')
@Roles('admin')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  findAll() {
    return this.settingsService.findAll();
  }

  // ==================== Search Profiles ====================

  @Get('search-profiles')
  getSearchProfiles() {
    return this.settingsService.getSearchProfiles();
  }

  @Post('search-profiles')
  saveSearchProfile(@Body() profile: SearchProfileDto) {
    return this.settingsService.saveSearchProfile(profile);
  }

  @Delete('search-profiles/:id')
  deleteSearchProfile(@Param('id') id: string) {
    return this.settingsService.deleteSearchProfile(id);
  }

  @Post('search-profiles/:id/test')
  @HttpCode(200)
  async testSearchProfile(@Param('id') id: string) {
    const profile = await this.settingsService.testSearchProfile(id);
    return profile;
  }

  // ==================== AI Profile ====================

  @Get('ai-profile')
  getAiProfile() {
    return this.settingsService.getAiProfile();
  }

  @Post('ai-profile')
  saveAiProfile(@Body() profile: AiProfileDto) {
    return this.settingsService.saveAiProfile(profile);
  }

  @Post('ai-profile/test')
  @HttpCode(200)
  async testAiProfile() {
    return this.settingsService.testAiProfile();
  }

  // ==================== SMTP Profile ====================

  @Get('smtp-profile')
  @Roles('admin', 'sales')
  getSmtpProfile(@CurrentUser() user: RequestUser) {
    return this.settingsService.getSmtpProfile(smtpOwnerId(user));
  }

  @Post('smtp-profile')
  @Roles('admin', 'sales')
  saveSmtpProfile(@Body() profile: SmtpProfileDto, @CurrentUser() user: RequestUser) {
    return this.settingsService.saveSmtpProfile(profile, smtpOwnerId(user));
  }

  @Post('smtp-profile/test')
  @Roles('admin', 'sales')
  @HttpCode(200)
  testSmtpProfile(@CurrentUser() user: RequestUser) {
    return this.settingsService.testSmtpProfile(smtpOwnerId(user));
  }

  // ==================== IMAP Profile ====================

  @Get('imap-profile')
  @Roles('admin', 'sales')
  getImapProfile(@CurrentUser() user: RequestUser) {
    return this.settingsService.getImapProfile(mailboxOwnerId(user));
  }

  @Post('imap-profile')
  @Roles('admin', 'sales')
  saveImapProfile(@Body() profile: ImapProfileDto, @CurrentUser() user: RequestUser) {
    return this.settingsService.saveImapProfile(profile, mailboxOwnerId(user));
  }

  @Post('imap-profile/test')
  @Roles('admin', 'sales')
  @HttpCode(200)
  testImapProfile(@CurrentUser() user: RequestUser) {
    return this.settingsService.testImapProfile(mailboxOwnerId(user));
  }

  // ==================== Email Policy ====================

  @Get('email-policy')
  getEmailPolicy() {
    return this.settingsService.getEmailPolicy();
  }

  @Post('email-policy')
  saveEmailPolicy(@Body() policy: EmailPolicyDto) {
    return this.settingsService.saveEmailPolicy(policy);
  }

  // ==================== Quote Output Profile ====================

  @Get('quote-output-profile')
  @Roles('admin', 'sales')
  getQuoteOutputProfile() {
    return this.settingsService.getQuoteOutputProfile();
  }

  @Post('quote-output-profile')
  saveQuoteOutputProfile(@Body() profile: QuoteOutputProfileDto) {
    return this.settingsService.saveQuoteOutputProfile(profile);
  }

  @Post('quote-output-profile/assets/:kind')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  saveQuoteOutputAsset(@Param('kind') kind: 'logo' | 'signature', @UploadedFile() file: any) {
    return this.settingsService.saveQuoteOutputAsset(kind, file);
  }

  @Get('quote-output-profile/assets/:kind')
  @Roles('admin', 'sales')
  async getQuoteOutputAsset(
    @Param('kind') kind: 'logo' | 'signature',
    @Res() response: Response,
  ) {
    const { asset, filePath } = await this.settingsService.getQuoteOutputAsset(kind);
    response.type(asset.mimeType || 'application/octet-stream');
    response.setHeader('Cache-Control', 'private, max-age=60');
    return response.sendFile(filePath);
  }

  @Get(':key')
  findOne(@Param('key') key: string) {
    return this.settingsService.findOne(key);
  }
}
