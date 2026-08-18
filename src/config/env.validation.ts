import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { validateCronExpression } from 'cron';

export type NodeEnvironment = 'development' | 'test' | 'production';

export interface EnvironmentVariables {
    NODE_ENV: NodeEnvironment;
    PORT: number;
    APP_INSTANCE_ID: string;
    DATABASE_URL: string;
    DATABASE_POOL_MAX: number;
    DATABASE_IDLE_TIMEOUT_MS: number;
    DATABASE_CONNECTION_TIMEOUT_MS: number;
    SWAGGER_ENABLED: boolean;
    SWAGGER_PATH: string;
    OPERATOR_ID?: string;
    OPERATOR_TOKEN?: string;
    BILLING_CRON_ENABLED: boolean;
    BILLING_CRON_EXPRESSION: string;
    BILLING_TIMEZONE: string;
    BILLING_BATCH_SIZE: number;
    BILLING_CONCURRENCY: number;
    BILLING_LEASE_SECONDS: number;
    BILLING_HEARTBEAT_SECONDS: number;
    BILLING_CLAIM_SECONDS: number;
    BILLING_MAX_RUN_SECONDS: number;
    BILLING_MAX_ITEMS_PER_RUN: number;
    BILLING_MAX_CATCH_UP_PERIODS: number;
    BILLING_RUN_ON_STARTUP: boolean;
}

/**
 * Validates and normalizes env values before Nest builds the application graph.
 *
 * - Applies defaults and converts raw strings to required runtime types.
 * - Fails startup on invalid values, ranges, or cross-field invariants.
 */
export function validateEnvironment(
    input: Record<string, unknown>,
): EnvironmentVariables {
    const nodeEnv = enumValue(
        input,
        'NODE_ENV',
        ['development', 'test', 'production'],
        'development',
    );
    const leaseSeconds = integer(input, 'BILLING_LEASE_SECONDS', 120, 30, 3600);
    const heartbeatSeconds = integer(
        input,
        'BILLING_HEARTBEAT_SECONDS',
        30,
        1,
        1200,
    );

    if (heartbeatSeconds * 3 >= leaseSeconds) {
        throw new Error(
            'BILLING_HEARTBEAT_SECONDS must be less than one-third of BILLING_LEASE_SECONDS',
        );
    }

    return {
        NODE_ENV: nodeEnv,
        PORT: integer(input, 'PORT', 5000, 1, 65_535),
        APP_INSTANCE_ID:
            optionalString(input, 'APP_INSTANCE_ID') ??
            `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`,
        DATABASE_URL: requiredString(input, 'DATABASE_URL'),
        DATABASE_POOL_MAX: integer(input, 'DATABASE_POOL_MAX', 10, 1, 100),
        DATABASE_IDLE_TIMEOUT_MS: integer(
            input,
            'DATABASE_IDLE_TIMEOUT_MS',
            30_000,
            1_000,
            300_000,
        ),
        DATABASE_CONNECTION_TIMEOUT_MS: integer(
            input,
            'DATABASE_CONNECTION_TIMEOUT_MS',
            5_000,
            100,
            60_000,
        ),
        SWAGGER_ENABLED: booleanValue(
            input,
            'SWAGGER_ENABLED',
            nodeEnv !== 'production',
        ),
        SWAGGER_PATH: pathSegment(input, 'SWAGGER_PATH', 'docs'),
        ...operatorCredentials(input),
        BILLING_CRON_ENABLED: booleanValue(input, 'BILLING_CRON_ENABLED', true),
        BILLING_CRON_EXPRESSION: cronExpression(
            input,
            'BILLING_CRON_EXPRESSION',
            '5 0 * * *',
        ),
        BILLING_TIMEZONE: timeZone(input, 'BILLING_TIMEZONE', 'UTC'),
        BILLING_BATCH_SIZE: integer(input, 'BILLING_BATCH_SIZE', 100, 1, 1000),
        BILLING_CONCURRENCY: integer(input, 'BILLING_CONCURRENCY', 5, 1, 50),
        BILLING_LEASE_SECONDS: leaseSeconds,
        BILLING_HEARTBEAT_SECONDS: heartbeatSeconds,
        BILLING_CLAIM_SECONDS: integer(
            input,
            'BILLING_CLAIM_SECONDS',
            300,
            30,
            3600,
        ),
        BILLING_MAX_RUN_SECONDS: integer(
            input,
            'BILLING_MAX_RUN_SECONDS',
            1800,
            1,
            86_400,
        ),
        BILLING_MAX_ITEMS_PER_RUN: integer(
            input,
            'BILLING_MAX_ITEMS_PER_RUN',
            100_000,
            1,
            10_000_000,
        ),
        BILLING_MAX_CATCH_UP_PERIODS: integer(
            input,
            'BILLING_MAX_CATCH_UP_PERIODS',
            12,
            1,
            120,
        ),
        BILLING_RUN_ON_STARTUP: booleanValue(
            input,
            'BILLING_RUN_ON_STARTUP',
            false,
        ),
    };
}

function raw(input: Record<string, unknown>, key: string): string | undefined {
    const value = input[key];
    if (value === undefined || value === null || value === '') return undefined;
    if (
        typeof value !== 'string' &&
        typeof value !== 'number' &&
        typeof value !== 'boolean'
    ) {
        return undefined;
    }
    return String(value).trim();
}

function requiredString(input: Record<string, unknown>, key: string): string {
    const value = raw(input, key);
    if (!value) throw new Error(`${key} is required`);
    return value;
}

function optionalString(
    input: Record<string, unknown>,
    key: string,
): string | undefined {
    return raw(input, key);
}

function integer(
    input: Record<string, unknown>,
    key: string,
    fallback: number,
    min: number,
    max: number,
): number {
    const value = raw(input, key);
    const parsed = value === undefined ? fallback : Number(value);

    if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
        throw new Error(`${key} must be an integer between ${min} and ${max}`);
    }

    return parsed;
}

function booleanValue(
    input: Record<string, unknown>,
    key: string,
    fallback: boolean,
): boolean {
    const value = raw(input, key)?.toLowerCase();
    if (value === undefined) return fallback;
    if (value === 'true' || value === '1') return true;
    if (value === 'false' || value === '0') return false;
    throw new Error(`${key} must be true/false or 1/0`);
}

function enumValue<const T extends readonly string[]>(
    input: Record<string, unknown>,
    key: string,
    allowed: T,
    fallback: T[number],
): T[number] {
    const value = raw(input, key) ?? fallback;
    if (!(allowed as readonly string[]).includes(value)) {
        throw new Error(`${key} must be one of: ${allowed.join(', ')}`);
    }
    return value;
}

function operatorCredentials(
    input: Record<string, unknown>,
): Pick<EnvironmentVariables, 'OPERATOR_ID' | 'OPERATOR_TOKEN'> {
    const id = optionalString(input, 'OPERATOR_ID');
    const token = optionalString(input, 'OPERATOR_TOKEN');

    if ((id && !token) || (!id && token)) {
        throw new Error(
            'OPERATOR_ID and OPERATOR_TOKEN must be configured together',
        );
    }
    if (!id || !token) return {};
    if (!/^[A-Za-z0-9._:@-]{1,120}$/.test(id)) {
        throw new Error('OPERATOR_ID contains an invalid actor ID');
    }
    if (token.length < 16 || token.length > 512) {
        throw new Error(
            'OPERATOR_TOKEN must be between 16 and 512 characters',
        );
    }

    return { OPERATOR_ID: id, OPERATOR_TOKEN: token };
}

function cronExpression(
    input: Record<string, unknown>,
    key: string,
    fallback: string,
): string {
    const value = raw(input, key) ?? fallback;
    const result = validateCronExpression(value);
    if (!result.valid) throw new Error(`${key} is not a valid cron expression`);
    return value;
}

function timeZone(
    input: Record<string, unknown>,
    key: string,
    fallback: string,
): string {
    const value = raw(input, key) ?? fallback;

    try {
        new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    } catch {
        throw new Error(`${key} must be a valid IANA timezone`);
    }

    return value;
}

function pathSegment(
    input: Record<string, unknown>,
    key: string,
    fallback: string,
): string {
    const value = raw(input, key) ?? fallback;
    if (!/^[a-z0-9][a-z0-9/_-]*$/i.test(value)) {
        throw new Error(
            `${key} must be a URL-safe path without a leading slash`,
        );
    }
    return value;
}
