import { ServiceUnavailableException } from '@nestjs/common';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { DatabaseClient } from '../../database/database.module';
import type { DatabaseSchema } from '../../database/database.types';
import type { BillingSchedulerCron } from '../../modules/billing-scheduler/billing-scheduler.cron';
import { HealthController } from '../health.controller';

describe('HealthController', () => {
    it('reports scheduler unavailability before querying the database', async () => {
        const controller = new HealthController(
            {} as DatabaseClient,
            { isReady: false } as unknown as BillingSchedulerCron,
        );

        await expect(controller.ready()).rejects.toBeInstanceOf(
            ServiceUnavailableException,
        );
    });

    it('reports database unavailability without exposing database details', async () => {
        const database = new Kysely<DatabaseSchema>({
            dialect: new PostgresDialect({
                pool: new Pool({
                    connectionString:
                        'postgresql://billing:secret@127.0.0.1:1/unavailable',
                    connectionTimeoutMillis: 50,
                }),
            }),
        });
        const controller = new HealthController(database, {
            isReady: true,
        } as unknown as BillingSchedulerCron);

        try {
            const promise = controller.ready();
            await expect(promise).rejects.toMatchObject({
                response: {
                    code: 'DATABASE_UNAVAILABLE',
                    message: 'Database readiness check failed',
                },
            });
        } finally {
            await database.destroy();
        }
    });
});
