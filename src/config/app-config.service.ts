import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from './env.validation';

interface AppConfiguration {
    readonly nodeEnv: EnvironmentVariables['NODE_ENV'];
    readonly port: number;
    readonly instanceId: string;
}

interface DatabaseConfiguration {
    readonly url: string;
    readonly poolMax: number;
    readonly idleTimeoutMs: number;
    readonly connectionTimeoutMs: number;
}

interface SwaggerConfiguration {
    readonly enabled: boolean;
    readonly path: string;
}

interface BillingConfiguration {
    readonly cronEnabled: boolean;
    readonly cronExpression: string;
    readonly timezone: string;
    readonly batchSize: number;
    readonly concurrency: number;
    readonly leaseSeconds: number;
    readonly heartbeatSeconds: number;
    readonly claimSeconds: number;
    readonly maxRunSeconds: number;
    readonly maxItemsPerRun: number;
    readonly maxCatchUpPeriods: number;
    readonly runOnStartup: boolean;
}

/**
 * Exposes validated environment config through typed groups.
 *
 * - Application code reads config through this service.
 * - Env-key mapping stays at this boundary.
 */
@Injectable()
export class AppConfigService {
    readonly app: AppConfiguration;
    readonly database: DatabaseConfiguration;
    readonly swagger: SwaggerConfiguration;
    readonly billing: BillingConfiguration;

    constructor(config: ConfigService<EnvironmentVariables, true>) {
        this.app = {
            nodeEnv: config.get('NODE_ENV', { infer: true }),
            port: config.get('PORT', { infer: true }),
            instanceId: config.get('APP_INSTANCE_ID', { infer: true }),
        };

        this.database = {
            url: config.get('DATABASE_URL', { infer: true }),
            poolMax: config.get('DATABASE_POOL_MAX', { infer: true }),
            idleTimeoutMs: config.get('DATABASE_IDLE_TIMEOUT_MS', {
                infer: true,
            }),
            connectionTimeoutMs: config.get('DATABASE_CONNECTION_TIMEOUT_MS', {
                infer: true,
            }),
        };

        this.swagger = {
            enabled: config.get('SWAGGER_ENABLED', { infer: true }),
            path: config.get('SWAGGER_PATH', { infer: true }),
        };

        this.billing = {
            cronEnabled: config.get('BILLING_CRON_ENABLED', { infer: true }),
            cronExpression: config.get('BILLING_CRON_EXPRESSION', {
                infer: true,
            }),
            timezone: config.get('BILLING_TIMEZONE', { infer: true }),
            batchSize: config.get('BILLING_BATCH_SIZE', { infer: true }),
            concurrency: config.get('BILLING_CONCURRENCY', { infer: true }),
            leaseSeconds: config.get('BILLING_LEASE_SECONDS', { infer: true }),
            heartbeatSeconds: config.get('BILLING_HEARTBEAT_SECONDS', {
                infer: true,
            }),
            claimSeconds: config.get('BILLING_CLAIM_SECONDS', { infer: true }),
            maxRunSeconds: config.get('BILLING_MAX_RUN_SECONDS', {
                infer: true,
            }),
            maxItemsPerRun: config.get('BILLING_MAX_ITEMS_PER_RUN', {
                infer: true,
            }),
            maxCatchUpPeriods: config.get('BILLING_MAX_CATCH_UP_PERIODS', {
                infer: true,
            }),
            runOnStartup: config.get('BILLING_RUN_ON_STARTUP', { infer: true }),
        };
    }
}
