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
        expect(env.OPERATOR_CREDENTIALS).toEqual({});
    });

    it('parses operator credentials and rejects weak tokens', () => {
        expect(
            validateEnvironment({
                ...valid,
                OPERATOR_CREDENTIALS:
                    '{"operator-1":"0123456789abcdef0123456789abcdef"}',
            }).OPERATOR_CREDENTIALS,
        ).toEqual({
            'operator-1': '0123456789abcdef0123456789abcdef',
        });

        expect(() =>
            validateEnvironment({
                ...valid,
                OPERATOR_CREDENTIALS: '{"operator-1":"short"}',
            }),
        ).toThrow('tokens must be between 16 and 512 characters');
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

    it('rejects an invalid timezone', () => {
        expect(() =>
            validateEnvironment({
                ...valid,
                BILLING_TIMEZONE: 'Not/A_Timezone',
            }),
        ).toThrow('valid IANA timezone');
    });
});
