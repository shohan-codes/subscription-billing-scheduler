import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { type DatabaseClient } from '../src/database/database.module';
import { $database } from '../src/database/database.constant';
import { $subscription } from '../src/modules/subscriptions/subscriptions.constant';
import { $invoice } from '../src/modules/invoices/invoices.constant';

const subscriptionIds = [
    '11111111-1111-4111-8111-111111111101',
    '11111111-1111-4111-8111-111111111102',
    '11111111-1111-4111-8111-111111111103',
    '11111111-1111-4111-8111-111111111104',
    '11111111-1111-4111-8111-111111111105',
    '11111111-1111-4111-8111-111111111106',
    '11111111-1111-4111-8111-111111111107',
] as const;

const invoiceIds = [
    '22222222-2222-4222-8222-222222222201',
    '22222222-2222-4222-8222-222222222202',
] as const;

/** Seeds deterministic subscription and invoice records for local testing. */
async function seed(): Promise<void> {
    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: false,
    });

    try {
        const database = app.get<DatabaseClient>($database.token.CLIENT);

        await database.transaction().execute(async (trx) => {
            await trx
                .deleteFrom('invoice_items')
                .where('invoice_id', 'in', [...invoiceIds])
                .execute();
            await trx
                .deleteFrom('invoices')
                .where('subscription_id', 'in', [...subscriptionIds])
                .execute();
            await trx
                .deleteFrom('subscriptions')
                .where('id', 'in', [...subscriptionIds])
                .execute();

            await trx
                .insertInto('subscriptions')
                .values([
                    {
                        id: subscriptionIds[0],
                        customer_reference: 'CUST-DEMO-1001',
                        description: 'Pro Plan - August Due',
                        status: $subscription.status.ACTIVE,
                        billing_state: $subscription.billingState.READY,
                        currency: 'USD',
                        amount: '49.0000',
                        start_date: '2026-08-01',
                        next_billing_date: '2026-08-31',
                        billing_anchor_day: 31,
                        anchor_is_month_end: true,
                    },
                    {
                        id: subscriptionIds[1],
                        customer_reference: 'CUST-DEMO-1001',
                        description: 'Pro Plan - Retry Wait',
                        status: $subscription.status.PAUSED,
                        billing_state: $subscription.billingState.RETRY_WAIT,
                        currency: 'USD',
                        amount: '79.0000',
                        start_date: '2026-08-01',
                        next_billing_date: '2026-09-30',
                        billing_anchor_day: 30,
                        anchor_is_month_end: true,
                        billing_failure_count: 2,
                        billing_retry_at: '2026-09-01T08:00:00.000Z',
                        last_billing_error_code: 'PAYMENT_TEMPORARY_FAILURE',
                        last_billing_error_message: 'Temporary billing failure',
                    },
                    {
                        id: subscriptionIds[2],
                        customer_reference: 'CUST-DEMO-1001',
                        description: 'Enterprise Add-on - Blocked',
                        status: $subscription.status.ACTIVE,
                        billing_state: $subscription.billingState.BLOCKED,
                        currency: 'USD',
                        amount: '129.0000',
                        start_date: '2026-08-01',
                        next_billing_date: '2026-10-31',
                        billing_anchor_day: 31,
                        anchor_is_month_end: true,
                        billing_failure_count: 5,
                        last_billing_error_code: 'PAYMENT_METHOD_INVALID',
                        last_billing_error_message:
                            'Payment method needs attention',
                    },
                    {
                        id: subscriptionIds[3],
                        customer_reference: 'CUST-DEMO-2002',
                        description: 'Canceled Legacy Plan',
                        status: $subscription.status.CANCELED,
                        billing_state: $subscription.billingState.BLOCKED,
                        currency: 'EUR',
                        amount: '25.5000',
                        start_date: '2026-06-10',
                        next_billing_date: '2026-09-10',
                        billing_anchor_day: 10,
                        anchor_is_month_end: false,
                    },
                    {
                        id: subscriptionIds[4],
                        customer_reference: 'CUST-DEMO-3003',
                        description: 'Starter Plan - August Due',
                        status: $subscription.status.ACTIVE,
                        billing_state: $subscription.billingState.READY,
                        currency: 'USD',
                        amount: '19.0000',
                        start_date: '2026-08-15',
                        next_billing_date: '2026-08-15',
                        billing_anchor_day: 15,
                        anchor_is_month_end: false,
                    },
                    {
                        id: subscriptionIds[6],
                        customer_reference: 'CUST-DEMO-4004',
                        description: 'Recovery Demo - Retry Wait',
                        status: $subscription.status.ACTIVE,
                        billing_state: $subscription.billingState.RETRY_WAIT,
                        currency: 'USD',
                        amount: '39.0000',
                        start_date: '2026-08-01',
                        next_billing_date: '2026-08-31',
                        billing_anchor_day: 31,
                        anchor_is_month_end: true,
                        billing_failure_count: 1,
                        billing_retry_at: '2099-08-18T03:05:00.000Z',
                        last_billing_error_code: 'DATABASE_DEADLOCK',
                        last_billing_error_message:
                            'Temporary database conflict',
                    },
                    {
                        id: subscriptionIds[5],
                        customer_reference: 'CUST-DEMO-3003',
                        description: 'Starter Plan - Claimed',
                        status: $subscription.status.ACTIVE,
                        billing_state: $subscription.billingState.READY,
                        currency: 'USD',
                        amount: '29.0000',
                        start_date: '2026-08-15',
                        next_billing_date: '2026-09-15',
                        billing_anchor_day: 15,
                        anchor_is_month_end: false,
                        processing_owner: 'seed-scheduler',
                        processing_started_at: '2026-08-18T03:00:00.000Z',
                        processing_expires_at: '2099-08-18T03:05:00.000Z',
                    },
                ])
                .execute();

            await trx
                .insertInto('invoices')
                .values([
                    {
                        id: invoiceIds[0],
                        invoice_number: 'INV-DEMO-1001-001',
                        subscription_id: subscriptionIds[1],
                        customer_reference: 'CUST-DEMO-1001',
                        billing_period_start: '2026-07-01',
                        billing_period_end: '2026-08-01',
                        issue_date: '2026-07-31',
                        status: $invoice.status.ISSUED,
                        currency: 'USD',
                        subtotal: '79.0000',
                        total: '79.0000',
                        idempotency_key: 'seed:invoice:demo-1001:2026-07',
                    },
                    {
                        id: invoiceIds[1],
                        invoice_number: 'INV-DEMO-1001-002',
                        subscription_id: subscriptionIds[1],
                        customer_reference: 'CUST-DEMO-1001',
                        billing_period_start: '2026-08-01',
                        billing_period_end: '2026-09-01',
                        issue_date: '2026-08-31',
                        status: $invoice.status.ISSUED,
                        currency: 'USD',
                        subtotal: '79.0000',
                        total: '79.0000',
                        idempotency_key: 'seed:invoice:demo-1001:2026-08',
                    },
                ])
                .execute();

            await trx
                .insertInto('invoice_items')
                .values([
                    {
                        id: '33333333-3333-4333-8333-333333333301',
                        invoice_id: invoiceIds[0],
                        description: 'Pro Plan - July Snapshot',
                        quantity: '1.0000',
                        unit_price: '79.0000',
                        line_total: '79.0000',
                    },
                    {
                        id: '33333333-3333-4333-8333-333333333302',
                        invoice_id: invoiceIds[1],
                        description: 'Pro Plan - August Snapshot',
                        quantity: '1.0000',
                        unit_price: '79.0000',
                        line_total: '79.0000',
                    },
                ])
                .execute();
        });

        console.log('Seeded 7 subscriptions, 2 invoices, and 2 invoice items.');
        console.log(`Get demo: /api/v1/subscriptions/${subscriptionIds[1]}`);
        console.log(
            'List demo: /api/v1/subscriptions?customerReference=CUST-DEMO-1001',
        );
        console.log(
            `Claimed update demo: /api/v1/subscriptions/${subscriptionIds[5]}`,
        );
        console.log(
            `Retry demo: /api/v1/subscriptions/${subscriptionIds[6]}/billing-retry`,
        );
        console.log(
            `Unblock demo: /api/v1/subscriptions/${subscriptionIds[2]}/billing-retry`,
        );
        console.log(`Invoice detail demo: /api/v1/invoices/${invoiceIds[1]}`);
        console.log(
            'Invoice list demo: /api/v1/invoices?customerReference=CUST-DEMO-1001',
        );
    } finally {
        await app.close();
    }
}

void seed().catch((error: unknown) => {
    console.error('Database seed failed:', error);
    process.exitCode = 1;
});
