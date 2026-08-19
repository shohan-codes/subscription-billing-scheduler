import type { SchedulerRegistry } from '@nestjs/schedule';
import type { AppLogger } from '../../../common/app-logger';
import type { AppConfigService } from '../../../config/app-config.service';
import { $billingScheduler } from '../billing-scheduler.constant';
import { BillingSchedulerCron } from '../billing-scheduler.cron';
import type { BillingSchedulerService } from '../billing-scheduler.service';

interface CronJobMock {
    fireOnTick: () => Promise<void> | void;
    stop: () => void;
}

/** Builds the minimal scheduler configuration needed by cron registration tests. */
function config(enabled: boolean): AppConfigService {
    return {
        billing: {
            CRON_ENABLED: enabled,
            CRON_EXPRESSION: '5 0 * * *',
            TIMEZONE: 'UTC',
        },
    } as unknown as AppConfigService;
}

describe('BillingSchedulerCron', () => {
    it('does not register the cron task when scheduling is disabled', () => {
        const addCronJob = jest.fn();
        const cron = new BillingSchedulerCron(
            config(false),
            { addCronJob } as unknown as SchedulerRegistry,
            {
                triggerScheduled: jest.fn(),
            } as unknown as BillingSchedulerService,
            { info: jest.fn() } as unknown as AppLogger,
        );

        cron.onModuleInit();

        expect(addCronJob).not.toHaveBeenCalled();
    });

    it('registers one named cron task and delegates its tick to the scheduler service', async () => {
        const addCronJob = jest.fn();
        const triggerScheduled = jest.fn().mockResolvedValue(undefined);
        const cron = new BillingSchedulerCron(
            config(true),
            { addCronJob } as unknown as SchedulerRegistry,
            { triggerScheduled } as unknown as BillingSchedulerService,
            { info: jest.fn() } as unknown as AppLogger,
        );

        cron.onModuleInit();

        expect(addCronJob).toHaveBeenCalledTimes(1);
        expect(addCronJob).toHaveBeenCalledWith(
            $billingScheduler.job.NAME,
            expect.any(Object),
        );
        const call = addCronJob.mock.calls[0] as
            [string, CronJobMock] | undefined;
        const job = call?.[1] as CronJobMock;
        await job.fireOnTick();
        const stop = jest.spyOn(job, 'stop');
        cron.beforeApplicationShutdown();

        expect(triggerScheduled).toHaveBeenCalledTimes(1);
        expect(stop).toHaveBeenCalled();
    });
});
