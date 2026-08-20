import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from './env.validation';

interface AppConfiguration {
    readonly NODE_ENV: EnvironmentVariables['NODE_ENV'];
    readonly PORT: number;
    readonly INSTANCE_ID: string;
}

interface DatabaseConfiguration {
    readonly URL: string;
    readonly POOL_MAX: number;
    readonly IDLE_TIMEOUT_MS: number;
    readonly CONNECTION_TIMEOUT_MS: number;
}

interface SwaggerConfiguration {
    readonly ENABLED: boolean;
    readonly PATH: string;
}

interface OperatorConfiguration {
    readonly ID: EnvironmentVariables['OPERATOR_ID'];
    readonly TOKEN: EnvironmentVariables['OPERATOR_TOKEN'];
}

interface BillingConfiguration {
    readonly CRON_ENABLED: boolean;
    readonly CRON_EXPRESSION: string;
    readonly TIMEZONE: string;
    readonly BATCH_SIZE: number;
    readonly CONCURRENCY: number;
    readonly LEASE_SECONDS: number;
    readonly HEARTBEAT_SECONDS: number;
    readonly CLAIM_SECONDS: number;
    readonly MAX_RUN_SECONDS: number;
    readonly MAX_ITEMS_PER_RUN: number;
    readonly MAX_CATCH_UP_PERIODS: number;
    readonly RUN_ON_STARTUP: boolean;
}

/** Exposes validated environment configuration through typed groups. */
@Injectable()
export class AppConfigService {
    readonly app: AppConfiguration;
    readonly database: DatabaseConfiguration;
    readonly swagger: SwaggerConfiguration;
    readonly operator: OperatorConfiguration;
    readonly billing: BillingConfiguration;

    constructor(config: ConfigService<EnvironmentVariables, true>) {
        this.app = {
            NODE_ENV: config.get('NODE_ENV', { infer: true }),
            PORT: config.get('PORT', { infer: true }),
            INSTANCE_ID: config.get('APP_INSTANCE_ID', { infer: true }),
        };

        this.database = {
            URL: config.get('DATABASE_URL', { infer: true }),
            POOL_MAX: config.get('DATABASE_POOL_MAX', { infer: true }),
            IDLE_TIMEOUT_MS: config.get('DATABASE_IDLE_TIMEOUT_MS', {
                infer: true,
            }),
            CONNECTION_TIMEOUT_MS: config.get(
                'DATABASE_CONNECTION_TIMEOUT_MS',
                {
                    infer: true,
                },
            ),
        };

        this.swagger = {
            ENABLED: config.get('SWAGGER_ENABLED', { infer: true }),
            PATH: config.get('SWAGGER_PATH', { infer: true }),
        };

        this.operator = {
            ID: config.get('OPERATOR_ID', { infer: true }),
            TOKEN: config.get('OPERATOR_TOKEN', { infer: true }),
        };

        this.billing = {
            CRON_ENABLED: config.get('BILLING_CRON_ENABLED', { infer: true }),
            CRON_EXPRESSION: config.get('BILLING_CRON_EXPRESSION', {
                infer: true,
            }),
            TIMEZONE: config.get('BILLING_TIMEZONE', { infer: true }),
            BATCH_SIZE: config.get('BILLING_BATCH_SIZE', { infer: true }),
            CONCURRENCY: config.get('BILLING_CONCURRENCY', { infer: true }),
            LEASE_SECONDS: config.get('BILLING_LEASE_SECONDS', { infer: true }),
            HEARTBEAT_SECONDS: config.get('BILLING_HEARTBEAT_SECONDS', {
                infer: true,
            }),
            CLAIM_SECONDS: config.get('BILLING_CLAIM_SECONDS', { infer: true }),
            MAX_RUN_SECONDS: config.get('BILLING_MAX_RUN_SECONDS', {
                infer: true,
            }),
            MAX_ITEMS_PER_RUN: config.get('BILLING_MAX_ITEMS_PER_RUN', {
                infer: true,
            }),
            MAX_CATCH_UP_PERIODS: config.get('BILLING_MAX_CATCH_UP_PERIODS', {
                infer: true,
            }),
            RUN_ON_STARTUP: config.get('BILLING_RUN_ON_STARTUP', {
                infer: true,
            }),
        };
    }
}
