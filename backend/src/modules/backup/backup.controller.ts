import { Controller, Get, Post, Delete, Body, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { BackupService } from './backup.service';
import { RestoreBackupDto, SaveBackupSettingsDto } from './dto/backup.dto';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('backup')
@Roles('admin')
export class BackupController {
  constructor(private backupService: BackupService) {}

  @Get('settings')
  getSettings() {
    return this.backupService.getSettings();
  }

  @Post('settings')
  saveSettings(@Body() dto: SaveBackupSettingsDto) {
    return this.backupService.saveSettings(dto);
  }

  @Get('list')
  getList() {
    return this.backupService.findAll();
  }

  @Post('create')
  async create() {
    return this.backupService.create();
  }

  @Post(':id/verify')
  verify(@Param('id') id: string) {
    return this.backupService.verify(id);
  }

  @Post(':id/drill')
  drill(@Param('id') id: string) {
    return this.backupService.drill(id);
  }

  @Post(':id/restore')
  restore(@Param('id') id: string, @Body() dto: RestoreBackupDto) {
    return this.backupService.restore(id, dto.confirmation);
  }

  @Get(':id/download')
  async download(@Param('id') id: string, @Res() response: Response) {
    const backup = await this.backupService.getDownload(id);
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${backup.filename.replace(/[^a-zA-Z0-9_.-]/g, '_')}"`);
    response.send(backup.data);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.backupService.remove(id);
  }
}
