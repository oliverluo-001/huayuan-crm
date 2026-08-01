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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

interface RequestUser { sub: number; role: 'admin' | 'sales' | 'viewer' }
const ownerScope = (user: RequestUser) => user.role === 'sales' ? String(user.sub) : undefined;

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
  @Roles('admin', 'sales')
  create(@Body() createDto: CreateTemplateDto) {
    return this.emailService.createTemplate(createDto);
  }

  @Put(':id')
  @Roles('admin', 'sales')
  update(@Param('id') id: string, @Body() updateDto: UpdateTemplateDto) {
    return this.emailService.updateTemplate(+id, updateDto);
  }

  @Delete(':id')
  @Roles('admin', 'sales')
  remove(@Param('id') id: string) {
    return this.emailService.removeTemplate(+id);
  }
}

@Controller('email-tasks')
export class EmailTasksController {
  constructor(private readonly emailService: EmailService) {}

  @Get()
  async findAll(@Query() query: Record<string, any>, @CurrentUser() user: RequestUser) {
    const tasks = await this.emailService.findAllTasks({ ...query, ownerId: ownerScope(user) });
    return { tasks };
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.emailService.findOneTask(id, ownerScope(user));
  }

  @Post()
  @Roles('admin', 'sales')
  create(@Body() createDto: CreateEmailTaskDto, @CurrentUser() user: RequestUser) {
    return this.emailService.createTask(createDto, ownerScope(user) || '');
  }

  @Put(':id')
  @Roles('admin', 'sales')
  update(@Param('id') id: string, @Body() updateDto: UpdateEmailTaskDto, @CurrentUser() user: RequestUser) {
    return this.emailService.updateTask(id, updateDto, ownerScope(user));
  }

  @Delete(':id')
  @Roles('admin', 'sales')
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.emailService.removeTask(id, ownerScope(user));
  }

  @Post(':id/run')
  @Roles('admin', 'sales')
  @HttpCode(200)
  async run(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.emailService.runTask(id, ownerScope(user));
  }

  @Post(':id/cancel')
  @Roles('admin', 'sales')
  @HttpCode(200)
  async cancel(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.emailService.cancelTask(id, ownerScope(user));
  }
}

@Controller('email-logs')
export class EmailLogsController {
  constructor(private readonly emailService: EmailService) {}

  @Get()
  findAll(@Query() query: Record<string, any>, @CurrentUser() user: RequestUser) {
    return this.emailService.findAllLogs({ ...query, ownerId: ownerScope(user) });
  }

  @Delete(':id')
  @Roles('admin', 'sales')
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.emailService.removeLog(id, ownerScope(user));
  }
}

@Controller('email-bounces')
export class EmailBouncesController {
  constructor(private readonly emailService: EmailService) {}

  @Post('check')
  @Roles('admin')
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
  @Roles('admin', 'sales')
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.emailService.removeLog(id, ownerScope(user));
  }
}
