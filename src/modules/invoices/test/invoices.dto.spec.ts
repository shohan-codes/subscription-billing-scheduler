import { validate } from 'class-validator';
import { GetInvoiceRequest, ListInvoicesRequest } from '../invoices.dto';

/** Builds a valid invoice listing DTO for validation tests. */
const validListRequest = (): ListInvoicesRequest =>
    Object.assign(new ListInvoicesRequest(), {
        subscriptionId: '81849854-7497-4ea4-a097-7aebf39f97f7',
        customerReference: 'CUST-1001',
        billingPeriodStart: '2026-08-31',
        billingPeriodEnd: '2026-09-30',
        issueDate: '2026-08-31',
        limit: 50,
    });

describe('ListInvoicesRequest', () => {
    it('accepts valid invoice filters', async () => {
        await expect(validate(validListRequest())).resolves.toHaveLength(0);
    });

    it.each([
        ['subscriptionId', { subscriptionId: 'not-a-uuid' }],
        ['customerReference', { customerReference: '' }],
        ['billingPeriodStart', { billingPeriodStart: '2026-02-31' }],
        ['billingPeriodEnd', { billingPeriodEnd: '2026/09/30' }],
        ['issueDate', { issueDate: '2026-13-01' }],
        ['limit', { limit: 101 }],
    ] as const)('rejects invalid %s values', async (property, values) => {
        const errors = await validate(
            Object.assign(validListRequest(), values),
        );

        expect(errors.some((error) => error.property === property)).toBe(true);
    });
});

describe('GetInvoiceRequest', () => {
    it('accepts a UUID invoice id', async () => {
        const request = Object.assign(new GetInvoiceRequest(), {
            id: '8b4d0359-4ff4-494c-8cdd-2f42cc5a0352',
        });

        await expect(validate(request)).resolves.toHaveLength(0);
    });

    it('rejects an invalid invoice id', async () => {
        const request = Object.assign(new GetInvoiceRequest(), {
            id: 'not-a-uuid',
        });
        const errors = await validate(request);

        expect(errors.some((error) => error.property === 'id')).toBe(true);
    });
});
