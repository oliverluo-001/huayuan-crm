import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailTemplate, EmailTask, EmailLog } from './entities';
import { EmailService, TemplatesController, EmailTasksController, EmailLogsController, SendLogsController, EmailBouncesController } from './';

@Module({
  imports: [TypeOrmModule.forFeature([EmailTemplate, EmailTask, EmailLog])],
  controllers: [TemplatesController, EmailTasksController, EmailLogsController, SendLogsController, EmailBouncesController],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}