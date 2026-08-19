import { Injectable } from '@nestjs/common';
import { AppLogger } from '../../common/app-logger';
import { Clock } from '../../common/clock';
import { AppConfigService } from '../../config/app-config.service';
import { $billingScheduler } from './billing-scheduler.constant';
import { BillingSchedulerRepository } from './billing-scheduler.repository';
import type { SchedulerHeartbeatContext } from './billing-scheduler.types';

/** Renews active scheduler lease ownership and exposes lease-loss state to the coordinator. */
@Injectable()
export class BillingSchedulerHeartbeat {
    private timer?: ReturnType<typeof setInterval>;
    private leaseLost = false;

    constructor(
        private readonly config: AppConfigService,
        private readonly clock: Clock,
        private readonly repository: BillingSchedulerRepository,
        private readonly logger: AppLogger,
    ) {}

    /** Reports whether heartbeat renewal has lost coordinator ownership. */
    get isLeaseLost(): boolean {
        return this.leaseLost;
    }

    /** Starts periodic heartbeat renewal for the current lease context. */
    start(context: SchedulerHeartbeatContext): void {
        this.stop();
        this.leaseLost = false;
        this.timer = setInterval(
            () => void this.renewNow(context),
            this.config.billing.HEARTBEAT_SECONDS * 1000,
        );
    }

    /** Stops periodic heartbeat renewal for the current coordinator. */
    stop(): void {
        if (this.timer) clearInterval(this.timer);
        this.timer = undefined;
    }

    /** Renews lease and run liveness immediately for the current owner. */
    async renewNow(context: SchedulerHeartbeatContext): Promise<boolean> {
        const heartbeatAt = this.clock.now();
        const leaseExpiresAt = new Date(
            heartbeatAt.getTime() + this.config.billing.LEASE_SECONDS * 1000,
        );

        try {
            const lease = await this.repository.renewLease(
                context.lockName,
                context.ownerToken,
                heartbeatAt,
                leaseExpiresAt,
            );

            if (!lease) {
                return this.markLeaseLost(
                    context,
                    $billingScheduler.logEvent.LEASE_LOST,
                );
            }

            if (context.runId) {
                const runUpdated = await this.repository.updateRunHeartbeat(
                    context.runId,
                    context.ownerToken,
                    heartbeatAt,
                );
                if (!runUpdated) {
                    return this.markLeaseLost(
                        context,
                        $billingScheduler.logEvent.RUN_HEARTBEAT_LOST,
                    );
                }
            }
        } catch {
            return this.markLeaseLost(
                context,
                $billingScheduler.logEvent.LEASE_HEARTBEAT_FAILED,
            );
        }

        this.logger.debug($billingScheduler.logEvent.LEASE_HEARTBEAT, {
            jobName: context.lockName,
        });
        return true;
    }

    /** Marks coordinator ownership lost and stops further heartbeat renewals. */
    private markLeaseLost(
        context: SchedulerHeartbeatContext,
        event: string,
    ): false {
        this.leaseLost = true;
        this.stop();
        this.logger.warn(event, {
            jobName: context.lockName,
            ...(context.runId ? { runId: context.runId } : {}),
            errorCode: $billingScheduler.errorCode.LEASE_LOST,
        });
        return false;
    }
}
