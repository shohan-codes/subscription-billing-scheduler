import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
    ListBillingRunItemsRequest,
    ListBillingRunsRequest,
} from '../billing-scheduler.dto';
import { $billingScheduler } from '../billing-scheduler.constant';

describe('BillingScheduler DTOs', () => {
    it('validates scheduler run list filters', async () => {
        const request = plainToInstance(ListBillingRunsRequest, {
            triggerType: $billingScheduler.triggerType.MANUAL,
            status: $billingScheduler.runStatus.COMPLETED,
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
