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
import {
  SearchProfileDto,
  AiProfileDto,
  SmtpProfileDto,
  ImapProfileDto,
} from './dto';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  findAll() {
    return this.settingsService.findAll();
  }

  @Get(':key')
  findOne(@Param('key') key: string) {
    return this.settingsService.findOne(key);
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
  getSmtpProfile() {
    return this.settingsService.getSmtpProfile();
  }

  @Post('smtp-profile')
  saveSmtpProfile(@Body() profile: SmtpProfileDto) {
    return this.settingsService.saveSmtpProfile(profile);
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
}