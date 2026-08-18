import { Injectable } from '@nestjs/common';
import { AppLogger } from '../../common/app-logger';

@Injectable()
export class BillingSchedulerService {
    constructor(private readonly logger: AppLogger) {}

    /** Starts the scheduler coordinator path for a scheduled trigger. */
    triggerScheduled(): void {
        this.logger.info('billing.trigger.scheduled');
    }
}
