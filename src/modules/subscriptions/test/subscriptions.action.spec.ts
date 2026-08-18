import { SubscriptionsAction } from '../subscriptions.action';
import type {
    CreateSubscriptionRequest,
    UpdateSubscriptionRequest,
} from '../subscriptions.dto';
import {
    EmptySubscriptionUpdateException,
    InvalidBillingAnchorException,
    InvalidSubscriptionDatesException,
    InvalidSubscriptionStateException,
    SubscriptionProcessingClaimActiveException,
    SubscriptionStateConflictException,
    SubscriptionVersionConflictException,
} from '../subscriptions.errors';
import type { SubscriptionRecord } from '../subscriptions.types';

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

const currentSubscription = (): SubscriptionRecord => ({
    id: '81849854-7497-4ea4-a097-7aebf39f97f7',
    customer_reference: 'CUST-1001',
    description: 'Pro Plan - Monthly',
    status: 'active',
    billing_state: 'ready',
    currency: 'USD',
    amount: '49.0000',
    start_date: '2026-08-16',
    next_billing_date: '2026-08-31',
    billing_anchor_day: 31,
    anchor_is_month_end: true,
    billing_failure_count: 0,
    billing_retry_at: null,
    last_billing_error_code: null,
    last_billing_error_message: null,
    processing_run_id: null,
    processing_owner: null,
    processing_started_at: null,
    processing_expires_at: null,
    version: 1,
    created_at: new Date('2026-08-16T00:00:00.000Z'),
    updated_at: new Date('2026-08-16T00:00:00.000Z'),
});

const updateRequest = (): UpdateSubscriptionRequest => ({
    description: 'Pro Plan - Annual',
    version: 1,
});

describe('SubscriptionsAction', () => {
    const action = new SubscriptionsAction();

    it('accepts valid cross-field creation rules', () => {
        expect(() =>
            action.validateCreateOrThrow(validRequest()),
        ).not.toThrow();
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

    it('resolves valid lifecycle transitions', () => {
        expect(action.resolvePauseStatusOrThrow(currentSubscription())).toBe(
            'paused',
        );
        expect(
            action.resolveResumeStatusOrThrow({
                ...currentSubscription(),
                status: 'paused',
            }),
        ).toBe('active');
        expect(action.resolveCancelStatusOrThrow(currentSubscription())).toBe(
            'canceled',
        );
        expect(
            action.resolveCancelStatusOrThrow({
                ...currentSubscription(),
                status: 'paused',
            }),
        ).toBe('canceled');
    });

    it('rejects invalid lifecycle transitions', () => {
        expect(() =>
            action.resolvePauseStatusOrThrow({
                ...currentSubscription(),
                status: 'paused',
            }),
        ).toThrow(SubscriptionStateConflictException);
        expect(() =>
            action.resolveResumeStatusOrThrow(currentSubscription()),
        ).toThrow(SubscriptionStateConflictException);
        expect(() =>
            action.resolveCancelStatusOrThrow({
                ...currentSubscription(),
                status: 'canceled',
            }),
        ).toThrow(SubscriptionStateConflictException);
    });

    it('accepts a commercial-only update without treating it as a schedule change', () => {
        expect(
            action.validateUpdateOrThrow(
                currentSubscription(),
                updateRequest(),
                new Date('2026-08-18T00:00:00.000Z'),
            ),
        ).toBe(false);
    });

    it('accepts a valid schedule update', () => {
        expect(
            action.validateUpdateOrThrow(
                currentSubscription(),
                {
                    nextBillingDate: '2026-09-30',
                    billingAnchorDay: 30,
                    version: 1,
                },
                new Date('2026-08-18T00:00:00.000Z'),
            ),
        ).toBe(true);
    });

    it('rejects an empty update', () => {
        expect(() =>
            action.validateUpdateOrThrow(
                currentSubscription(),
                { version: 1 },
                new Date('2026-08-18T00:00:00.000Z'),
            ),
        ).toThrow(EmptySubscriptionUpdateException);
    });

    it('rejects a stale update', () => {
        expect(() =>
            action.validateUpdateOrThrow(
                { ...currentSubscription(), version: 2 },
                updateRequest(),
                new Date('2026-08-18T00:00:00.000Z'),
            ),
        ).toThrow(SubscriptionVersionConflictException);
    });

    it('rejects a schedule update while a processing claim is active', () => {
        expect(() =>
            action.validateUpdateOrThrow(
                {
                    ...currentSubscription(),
                    processing_expires_at: new Date('2026-08-18T01:00:00.000Z'),
                },
                { nextBillingDate: '2026-09-30', version: 1 },
                new Date('2026-08-18T00:00:00.000Z'),
            ),
        ).toThrow(SubscriptionProcessingClaimActiveException);
    });

    it('rejects a schedule update for a canceled subscription', () => {
        expect(() =>
            action.validateUpdateOrThrow(
                { ...currentSubscription(), status: 'canceled' },
                { nextBillingDate: '2026-09-30', version: 1 },
                new Date('2026-08-18T00:00:00.000Z'),
            ),
        ).toThrow(InvalidSubscriptionStateException);
    });

    it('rejects an invalid effective schedule', () => {
        expect(() =>
            action.validateUpdateOrThrow(
                currentSubscription(),
                { nextBillingDate: '2026-09-29', version: 1 },
                new Date('2026-08-18T00:00:00.000Z'),
            ),
        ).toThrow(InvalidBillingAnchorException);
    });
});
