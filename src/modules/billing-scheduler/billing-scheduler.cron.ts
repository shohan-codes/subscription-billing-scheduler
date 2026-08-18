import { Injectable, type OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { AppLogger } from '../../common/app-logger';
import { AppConfigService } from '../../config/app-config.service';
import { BILLING_SCHEDULER_JOB_NAME } from './billing-scheduler.constant';
import { BillingSchedulerService } from './billing-scheduler.service';

/** Registers the configured billing cron trigger and delegates execution to the coordinator service. */
@Injectable()
export class BillingSchedulerCron implements OnModuleInit {
    constructor(
        private readonly config: AppConfigService,
        private readonly registry: SchedulerRegistry,
        private readonly service: BillingSchedulerService,
        private readonly logger: AppLogger,
    ) {}

    /** Registers and starts the configured billing cron task when scheduling is enabled. */
    onModuleInit(): void {
        if (!this.config.billing.cronEnabled) {
            this.logger.info('billing.cron.disabled', {
                jobName: BILLING_SCHEDULER_JOB_NAME,
            });
            return;
        }

        const job = CronJob.from({
            cronTime: this.config.billing.cronExpression,
            onTick: () => void this.service.triggerScheduled(),
            start: false,
            timeZone: this.config.billing.timezone,
        });

        this.registry.addCronJob(BILLING_SCHEDULER_JOB_NAME, job);
        job.start();
        this.logger.info('billing.cron.registered', {
            jobName: BILLING_SCHEDULER_JOB_NAME,
            cronExpression: this.config.billing.cronExpression,
            timezone: this.config.billing.timezone,
        });
    }
}
