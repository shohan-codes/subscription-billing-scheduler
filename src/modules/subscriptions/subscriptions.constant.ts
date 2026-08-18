import type { SubscriptionsTable } from '../../database/database.types';

export const SubscriptionStatus = {
    Active: 'active',
    Paused: 'paused',
    Canceled: 'canceled',
} as const satisfies Record<string, SubscriptionsTable['status']>;

export type SubscriptionStatus =
    (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

export const SubscriptionBillingState = {
    Ready: 'ready',
    RetryWait: 'retry_wait',
    Blocked: 'blocked',
} as const satisfies Record<string, SubscriptionsTable['billing_state']>;

export type SubscriptionBillingState =
    (typeof SubscriptionBillingState)[keyof typeof SubscriptionBillingState];
