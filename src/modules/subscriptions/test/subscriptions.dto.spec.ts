import { validate } from 'class-validator';
import {
    CreateSubscriptionRequest,
    UpdateSubscriptionRequest,
} from '../subscriptions.dto';

/** Builds a valid creation DTO for validation tests. */
const validRequest = (): CreateSubscriptionRequest =>
    Object.assign(new CreateSubscriptionRequest(), {
        customerReference: 'CUST-1001',
        description: 'Pro Plan - Monthly',
        amount: '49.0000',
        currency: 'USD',
        startDate: '2026-08-16',
        firstBillingDate: '2026-08-31',
        billingAnchorDay: 31,
        anchorIsMonthEnd: true,
    });

describe('CreateSubscriptionRequest', () => {
    it('accepts a valid request', async () => {
        await expect(validate(validRequest())).resolves.toHaveLength(0);
    });

    it.each([
        ['amount', { amount: '0.0000' }],
        ['amount', { amount: '-1.0000' }],
        ['amount', { amount: '49.00000' }],
        ['currency', { currency: 'usd' }],
        ['startDate', { startDate: '2026-02-30' }],
        ['firstBillingDate', { firstBillingDate: '2026/08/31' }],
        ['billingAnchorDay', { billingAnchorDay: 32 }],
        ['anchorIsMonthEnd', { anchorIsMonthEnd: 'true' }],
    ] as const)('rejects invalid %s values', async (property, values) => {
        const errors = await validate(Object.assign(validRequest(), values));

        expect(errors.some((error) => error.property === property)).toBe(true);
    });
});

describe('UpdateSubscriptionRequest', () => {
    /** Builds a valid update DTO for validation tests. */
    const validUpdate = (): UpdateSubscriptionRequest =>
        Object.assign(new UpdateSubscriptionRequest(), {
            description: 'Pro Plan - Annual',
            version: 1,
        });

    it('accepts a partial update with a version precondition', async () => {
        await expect(validate(validUpdate())).resolves.toHaveLength(0);
    });

    it.each([
        ['description', { description: null }],
        ['amount', { amount: '0.0000' }],
        ['currency', { currency: 'usd' }],
        ['nextBillingDate', { nextBillingDate: '2026-02-30' }],
        ['billingAnchorDay', { billingAnchorDay: 32 }],
        ['anchorIsMonthEnd', { anchorIsMonthEnd: 'true' }],
        ['version', { version: 0 }],
    ] as const)('rejects invalid %s values', async (property, values) => {
        const errors = await validate(Object.assign(validUpdate(), values));

        expect(errors.some((error) => error.property === property)).toBe(true);
    });
});
