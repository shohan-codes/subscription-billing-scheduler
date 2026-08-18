import { validateEnvironment } from './env.validation';

const valid = {
    DATABASE_URL:
        'postgresql://billing:billing@localhost:5432/subscription_billing',
};

describe('validateEnvironment', () => {
    it('applies safe defaults', () => {
        const env = validateEnvironment(valid);

        expect(env.PORT).toBe(5000);
        expect(env.BILLING_CRON_EXPRESSION).toBe('5 0 * * *');
        expect(env.BILLING_TIMEZONE).toBe('UTC');
        expect(env.BILLING_RUN_ON_STARTUP).toBe(false);
        expect(env.OPERATOR_ID).toBeUndefined();
        expect(env.OPERATOR_TOKEN).toBeUndefined();
    });

    it('validates the optional operator credential pair', () => {
        const env = validateEnvironment({
            ...valid,
            OPERATOR_ID: 'operator-1',
            OPERATOR_TOKEN: '0123456789abcdef0123456789abcdef',
        });

        expect(env.OPERATOR_ID).toBe('operator-1');
        expect(env.OPERATOR_TOKEN).toBe('0123456789abcdef0123456789abcdef');

        expect(() =>
            validateEnvironment({
                ...valid,
                OPERATOR_ID: 'operator-1',
                OPERATOR_TOKEN: 'short',
            }),
        ).toThrow('between 16 and 512 characters');

        expect(() =>
            validateEnvironment({
                ...valid,
                OPERATOR_ID: 'operator-1',
            }),
        ).toThrow('must be configured together');
    });

    it('rejects unsafe heartbeat configuration', () => {
        expect(() =>
            validateEnvironment({
                ...valid,
                BILLING_LEASE_SECONDS: '120',
                BILLING_HEARTBEAT_SECONDS: '40',
            }),
        ).toThrow('less than one-third');
    });

    it('rejects an invalid cron expression', () => {
        expect(() =>
            validateEnvironment({
                ...valid,
                BILLING_CRON_EXPRESSION: 'not-a-cron',
            }),
        ).toThrow('not a valid cron expression');
    });

    it('rejects an invalid timezone', () => {
        expect(() =>
            validateEnvironment({
                ...valid,
                BILLING_TIMEZONE: 'Not/A_Timezone',
            }),
        ).toThrow('valid IANA timezone');
    });
});
