import {
    ConflictException,
    NotFoundException,
    ServiceUnavailableException,
} from '@nestjs/common';
import { $billingScheduler } from './billing-scheduler.constant';

export class SchedulerLeaseUnavailableException extends ConflictException {
    constructor() {
        super({
            code: $billingScheduler.errorCode.LEASE_UNAVAILABLE,
            message:
                'Another billing coordinator owns the active scheduler lease',
        });
    }
}

export class SchedulerRunNotFoundException extends NotFoundException {
    constructor() {
        super({
            code: $billingScheduler.errorCode.RUN_NOT_FOUND,
            message: 'Scheduler run was not found',
        });
    }
}

export class SchedulerRunStateConflictException extends ConflictException {
    constructor() {
        super({
            code: $billingScheduler.errorCode.RUN_STATE_CONFLICT,
            message: 'Scheduler run state changed before it could be updated',
        });
    }
}

export class SchedulerShuttingDownException extends ServiceUnavailableException {
    constructor() {
        super({
            code: $billingScheduler.errorCode.SHUTTING_DOWN,
            message: 'Billing scheduler is shutting down',
        });
    }
}
