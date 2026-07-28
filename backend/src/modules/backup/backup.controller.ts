import { Controller, Get, Post, Delete, Body, Param, ParseIntPipe } from '@nestjs/common';
import { BackupService } from './backup.service';
import { SaveBackupSettingsDto } from './dto/backup.dto';

@Controller('backup')
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
    return this.backupService.create('', '');
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.backupService.remove(id);
  }
}
