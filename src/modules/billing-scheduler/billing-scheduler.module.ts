import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { BillingSchedulerCron } from './billing-scheduler.cron';
import { BillingSchedulerService } from './billing-scheduler.service';

@Module({
    imports: [CommonModule],
    providers: [BillingSchedulerService, BillingSchedulerCron],
    exports: [BillingSchedulerService],
})
export class BillingSchedulerModule {}
