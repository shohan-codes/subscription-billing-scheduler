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

export const SUBSCRIPTION_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const SUBSCRIPTION_AMOUNT_PATTERN = /^(?=.*[1-9])\d{1,15}(?:\.\d{1,4})?$/;
export const SUBSCRIPTION_CURRENCY_PATTERN = /^[A-Z]{3}$/;
