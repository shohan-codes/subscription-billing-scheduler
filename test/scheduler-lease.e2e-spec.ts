import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { BillingSchedulerRepository } from '../src/modules/billing-scheduler/billing-scheduler.repository';

const LOCK_NAME = `test.billing.scheduler.${randomUUID()}`;

describe('Scheduler coordinator lease (e2e)', () => {
    let app: INestApplication;
    let repository: BillingSchedulerRepository;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();
        app = moduleFixture.createNestApplication();
        await app.init();
        repository = app.get(BillingSchedulerRepository);
    });

    afterAll(async () => {
        await repository.releaseLease(LOCK_NAME, 'owner-a');
        await repository.releaseLease(LOCK_NAME, 'owner-b');
        await app.close();
    });

    it('allows only one active owner and prevents another owner from releasing it', async () => {
        const now = new Date();
        const leaseExpiresAt = new Date(now.getTime() + 120_000);
        const [first, second] = await Promise.all([
            repository.acquireLease({
                lockName: LOCK_NAME,
                ownerToken: 'owner-a',
                acquiredAt: now,
                leaseExpiresAt,
            }),
            repository.acquireLease({
                lockName: LOCK_NAME,
                ownerToken: 'owner-b',
                acquiredAt: now,
                leaseExpiresAt,
            }),
        ]);
        const winner = first ?? second;
        const loserToken =
            winner?.owner_token === 'owner-a' ? 'owner-b' : 'owner-a';

        expect([first, second].filter(Boolean)).toHaveLength(1);
        expect(winner).toBeDefined();
        expect(await repository.releaseLease(LOCK_NAME, loserToken)).toBe(
            false,
        );
        expect(
            await repository.releaseLease(LOCK_NAME, winner!.owner_token),
        ).toBe(true);
    });
});
