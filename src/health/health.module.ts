import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { BillingSchedulerModule } from '../modules/billing-scheduler/billing-scheduler.module';
import { HealthController } from './health.controller';

@Module({
    imports: [DatabaseModule, BillingSchedulerModule],
    controllers: [HealthController],
})
export class HealthModule {}
