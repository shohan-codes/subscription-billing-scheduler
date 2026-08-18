import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
    ListBillingRunItemsRequest,
    ListBillingRunsRequest,
} from '../billing-scheduler.dto';

describe('BillingScheduler DTOs', () => {
    it('validates scheduler run list filters', async () => {
        const request = plainToInstance(ListBillingRunsRequest, {
            triggerType: 'manual',
            status: 'completed',
            limit: '25',
        });

        await expect(validate(request)).resolves.toHaveLength(0);
    });

    it('rejects unknown run-item filters', async () => {
        const request = plainToInstance(ListBillingRunItemsRequest, {
            result: 'unknown',
        });

        await expect(validate(request)).resolves.not.toHaveLength(0);
    });
});
