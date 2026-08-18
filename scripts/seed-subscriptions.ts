import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DATABASE, type DatabaseClient } from '../src/database/database.module';

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

async function seed(): Promise<void> {
    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: false,
    });

    try {
        const database = app.get<DatabaseClient>(DATABASE);

        await database.transaction().execute(async (trx) => {
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
                        status: 'active',
                        billing_state: 'ready',
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
                        status: 'paused',
                        billing_state: 'retry_wait',
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
                        status: 'active',
                        billing_state: 'blocked',
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
                        status: 'canceled',
                        billing_state: 'blocked',
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
                        status: 'active',
                        billing_state: 'ready',
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
                        status: 'active',
                        billing_state: 'retry_wait',
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
                        status: 'active',
                        billing_state: 'ready',
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
                        status: 'issued',
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
                        status: 'issued',
                        currency: 'USD',
                        subtotal: '79.0000',
                        total: '79.0000',
                        idempotency_key: 'seed:invoice:demo-1001:2026-08',
                    },
                ])
                .execute();
        });

        console.log('Seeded 7 subscriptions and 2 invoices.');
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
    } finally {
        await app.close();
    }
}

void seed().catch((error: unknown) => {
    console.error('Database seed failed:', error);
    process.exitCode = 1;
});
