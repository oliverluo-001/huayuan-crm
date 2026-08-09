import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  HttpCode,
} from '@nestjs/common';
import { SettingsService } from './settings.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  SearchProfileDto,
  AiProfileDto,
  SmtpProfileDto,
  ImapProfileDto,
  EmailPolicyDto,
} from './dto';

interface RequestUser { sub: number; role: 'admin' | 'sales' | 'viewer' }
const smtpOwnerId = (user: RequestUser) => user.role === 'sales' ? String(user.sub) : undefined;

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
  getImapProfile() {
    return this.settingsService.getImapProfile();
  }

  @Post('imap-profile')
  saveImapProfile(@Body() profile: ImapProfileDto) {
    return this.settingsService.saveImapProfile(profile);
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

  @Get(':key')
  findOne(@Param('key') key: string) {
    return this.settingsService.findOne(key);
  }
}
