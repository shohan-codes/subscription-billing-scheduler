import {
    Injectable,
    type BeforeApplicationShutdown,
    type OnModuleInit,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { AppLogger } from '../../common/app-logger';
import { AppConfigService } from '../../config/app-config.service';
import { $billingScheduler } from './billing-scheduler.constant';
import { BillingSchedulerService } from './billing-scheduler.service';

/** Registers the configured billing cron trigger and delegates execution to the coordinator service. */
@Injectable()
export class BillingSchedulerCron
    implements OnModuleInit, BeforeApplicationShutdown
{
    private job?: CronJob;
    private ready = false;

    constructor(
        private readonly config: AppConfigService,
        private readonly registry: SchedulerRegistry,
        private readonly service: BillingSchedulerService,
        private readonly logger: AppLogger,
    ) {}

    /** Registers and starts the configured billing cron task when scheduling is enabled. */
    onModuleInit(): void {
        if (!this.config.billing.CRON_ENABLED) {
            this.logger.info($billingScheduler.logEvent.CRON_DISABLED, {
                jobName: $billingScheduler.job.NAME,
            });
            this.ready = true;
            return;
        }

        this.job = CronJob.from({
            cronTime: this.config.billing.CRON_EXPRESSION,
            onTick: () => void this.service.triggerScheduled(),
            start: false,
            timeZone: this.config.billing.TIMEZONE,
        });

        this.registry.addCronJob($billingScheduler.job.NAME, this.job);
        this.job.start();
        this.ready = true;
        this.logger.info($billingScheduler.logEvent.CRON_REGISTERED, {
            jobName: $billingScheduler.job.NAME,
            cronExpression: this.config.billing.CRON_EXPRESSION,
            timezone: this.config.billing.TIMEZONE,
        });
    }

    /** Reports whether scheduler initialization completed and shutdown has not begun. */
    get isReady(): boolean {
        return this.ready;
    }

    /** Stops the registered cron task before application teardown begins. */
    beforeApplicationShutdown(): void {
        this.ready = false;
        void this.job?.stop();
        this.logger.info($billingScheduler.logEvent.CRON_STOPPED, {
            jobName: $billingScheduler.job.NAME,
        });
    }
}
