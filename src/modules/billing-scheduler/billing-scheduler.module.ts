import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { DatabaseModule } from '../../database/database.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { BillingSchedulerAction } from './billing-scheduler.action';
import { BillingSchedulerController } from './billing-scheduler.controller';
import { BillingSchedulerCron } from './billing-scheduler.cron';
import { BillingSchedulerHeartbeat } from './billing-scheduler.heartbeat';
import { BillingSchedulerRepository } from './billing-scheduler.repository';
import { BillingSchedulerService } from './billing-scheduler.service';

@Module({
    imports: [CommonModule, DatabaseModule, InvoicesModule],
    controllers: [BillingSchedulerController],
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
