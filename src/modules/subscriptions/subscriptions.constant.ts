import { $database } from '../../database/database.constant';

export const $subscription = {
    status: $database.subscription.status,
    billingState: $database.subscription.billingState,
    errorCode: {
        NOT_FOUND: 'SUBSCRIPTION_NOT_FOUND',
        EMPTY_UPDATE: 'EMPTY_SUBSCRIPTION_UPDATE',
        VERSION_CONFLICT: 'SUBSCRIPTION_VERSION_CONFLICT',
        PROCESSING_CLAIM_ACTIVE: 'SUBSCRIPTION_PROCESSING_CLAIM_ACTIVE',
        STATE_CONFLICT: 'SUBSCRIPTION_STATE_CONFLICT',
        BILLING_RECOVERY_CONFLICT: 'SUBSCRIPTION_BILLING_RECOVERY_CONFLICT',
        EXPLICIT_UNBLOCK_REQUIRED: 'SUBSCRIPTION_UNBLOCK_REQUIRED',
        INVALID_STATE: 'INVALID_SUBSCRIPTION_STATE',
        INVALID_DATES: 'INVALID_SUBSCRIPTION_DATES',
        INVALID_BILLING_ANCHOR: 'INVALID_BILLING_ANCHOR',
    },
    pattern: {
        DATE: /^\d{4}-\d{2}-\d{2}$/,
        AMOUNT: /^(?=.*[1-9])\d{1,15}(?:\.\d{1,4})?$/,
        CURRENCY: /^[A-Z]{3}$/,
    },
} as const;

export type SubscriptionStatus =
    (typeof $subscription.status)[keyof typeof $subscription.status];
export type SubscriptionBillingState =
    (typeof $subscription.billingState)[keyof typeof $subscription.billingState];
