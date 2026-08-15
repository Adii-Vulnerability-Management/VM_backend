import { Module } from '@nestjs/common';
import { InternalTaskAutomationService } from './internal-task-automation.service';

@Module({
  providers: [InternalTaskAutomationService],
  exports: [InternalTaskAutomationService],
})
export class TasksModule {}
