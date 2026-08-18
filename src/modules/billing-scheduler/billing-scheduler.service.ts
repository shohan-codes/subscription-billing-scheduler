import { Injectable } from '@nestjs/common';
import { AppLogger } from '../../common/app-logger';
import { Clock } from '../../common/clock';
import { AppConfigService } from '../../config/app-config.service';
import { BillingSchedulerAction } from './billing-scheduler.action';
import { BillingSchedulerRepository } from './billing-scheduler.repository';

@Injectable()
export class BillingSchedulerService {
    constructor(
        private readonly config: AppConfigService,
        private readonly clock: Clock,
        private readonly action: BillingSchedulerAction,
        private readonly repository: BillingSchedulerRepository,
        private readonly logger: AppLogger,
    ) {}

    /** Starts the scheduler coordinator path for a scheduled trigger. */
    async triggerScheduled(): Promise<void> {
        const leaseRequest = this.action.createLeaseRequest(
            this.clock.now(),
            this.config.app.instanceId,
            this.config.billing.leaseSeconds,
        );
        const lease = await this.repository.acquireLease(leaseRequest);

        if (!lease) {
            this.logger.info('billing.run.skipped', {
                jobName: leaseRequest.lockName,
                result: 'skipped_lock_unavailable',
            });
            return;
        }

        this.logger.info('billing.lease.acquired', {
            jobName: lease.lock_name,
        });

        const released = await this.repository.releaseLease(
            lease.lock_name,
            lease.owner_token,
        );
        this.logger.info('billing.lease.released', {
            jobName: lease.lock_name,
            released,
        });
    }
}
