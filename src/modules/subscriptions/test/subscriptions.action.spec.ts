import { SubscriptionsAction } from '../subscriptions.action';
import type { CreateSubscriptionRequest } from '../subscriptions.dto';
import {
    InvalidBillingAnchorException,
    InvalidSubscriptionDatesException,
} from '../subscriptions.errors';

const validRequest = (): CreateSubscriptionRequest => ({
    customerReference: 'CUST-1001',
    description: 'Pro Plan - Monthly',
    amount: '49.0000',
    currency: 'USD',
    startDate: '2026-08-16',
    firstBillingDate: '2026-08-31',
    billingAnchorDay: 31,
    anchorIsMonthEnd: true,
});

describe('SubscriptionsAction', () => {
    const action = new SubscriptionsAction();

    it('accepts valid cross-field creation rules', () => {
        expect(() => action.validateCreateOrThrow(validRequest())).not.toThrow();
    });

    it('rejects a first billing date before the start date', () => {
        expect(() =>
            action.validateCreateOrThrow({
                ...validRequest(),
                firstBillingDate: '2026-08-15',
                anchorIsMonthEnd: false,
            }),
        ).toThrow(InvalidSubscriptionDatesException);
    });

    it('rejects inconsistent month-end settings', () => {
        expect(() =>
            action.validateCreateOrThrow({
                ...validRequest(),
                firstBillingDate: '2026-08-30',
                billingAnchorDay: 30,
            }),
        ).toThrow(InvalidBillingAnchorException);
    });

    it('rejects an inconsistent non-month-end anchor', () => {
        expect(() =>
            action.validateCreateOrThrow({
                ...validRequest(),
                firstBillingDate: '2026-08-30',
                billingAnchorDay: 31,
                anchorIsMonthEnd: false,
            }),
        ).toThrow(InvalidBillingAnchorException);
    });

    it('allows a short-month clamp for a non-month-end anchor', () => {
        expect(() =>
            action.validateCreateOrThrow({
                ...validRequest(),
                startDate: '2026-02-01',
                firstBillingDate: '2026-02-28',
                billingAnchorDay: 31,
                anchorIsMonthEnd: false,
            }),
        ).not.toThrow();
    });

    it('accepts an explicit month-end anchor in a short month', () => {
        expect(() =>
            action.validateCreateOrThrow({
                ...validRequest(),
                startDate: '2028-02-01',
                firstBillingDate: '2028-02-29',
                billingAnchorDay: 31,
            }),
        ).not.toThrow();
    });
});
