import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { DatabaseModule } from '../../database/database.module';
import { BillingSchedulerAction } from './billing-scheduler.action';
import { BillingSchedulerCron } from './billing-scheduler.cron';
import { BillingSchedulerHeartbeat } from './billing-scheduler.heartbeat';
import { BillingSchedulerRepository } from './billing-scheduler.repository';
import { BillingSchedulerService } from './billing-scheduler.service';

@Module({
    imports: [CommonModule, DatabaseModule],
    providers: [
        BillingSchedulerService,
        BillingSchedulerAction,
        BillingSchedulerRepository,
        BillingSchedulerHeartbeat,
        BillingSchedulerCron,
    ],
    exports: [
        BillingSchedulerService,
        BillingSchedulerRepository,
        BillingSchedulerHeartbeat,
    ],
})
export class BillingSchedulerModule {}
