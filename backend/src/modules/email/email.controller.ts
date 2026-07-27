import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
} from '@nestjs/common';
import { EmailService } from './email.service';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
  CreateEmailTaskDto,
  UpdateEmailTaskDto,
} from './dto';

@Controller('templates')
export class TemplatesController {
  constructor(private readonly emailService: EmailService) {}

  @Get()
  async findAll() {
    const templates = await this.emailService.findAllTemplates();
    return { templates };
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.emailService.findOneTemplate(+id);
  }

  @Post()
  create(@Body() createDto: CreateTemplateDto) {
    return this.emailService.createTemplate(createDto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() updateDto: UpdateTemplateDto) {
    return this.emailService.updateTemplate(+id, updateDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.emailService.removeTemplate(+id);
  }
}

@Controller('email-tasks')
export class EmailTasksController {
  constructor(private readonly emailService: EmailService) {}

  @Get()
  async findAll(@Query() query: Record<string, any>) {
    const tasks = await this.emailService.findAllTasks(query);
    return { tasks };
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.emailService.findOneTask(id);
  }

  @Post()
  create(@Body() createDto: CreateEmailTaskDto) {
    return this.emailService.createTask(createDto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() updateDto: UpdateEmailTaskDto) {
    return this.emailService.updateTask(id, updateDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.emailService.removeTask(id);
  }

  @Post(':id/run')
  @HttpCode(200)
  async run(@Param('id') id: string) {
    return this.emailService.runTask(id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  async cancel(@Param('id') id: string) {
    return this.emailService.cancelTask(id);
  }
}

@Controller('email-logs')
export class EmailLogsController {
  constructor(private readonly emailService: EmailService) {}

  @Get()
  findAll(@Query() query: Record<string, any>) {
    return this.emailService.findAllLogs(query);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.emailService.removeLog(id);
  }
}

@Controller('email-bounces')
export class EmailBouncesController {
  constructor(private readonly emailService: EmailService) {}

  @Post('check')
  @HttpCode(200)
  async check() {
    return this.emailService.checkBounces();
  }
}

// Send logs (frontend: /api/send-logs)
@Controller('send-logs')
export class SendLogsController {
  constructor(private readonly emailService: EmailService) {}

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.emailService.removeLog(id);
  }
}