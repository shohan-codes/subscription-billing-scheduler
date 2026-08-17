import { ApiResponseField } from '../decorators/api-response-field.decorator';
import { ResponseDto } from '../dto/response.dto';

type SubscriptionRow = {
    id: string;
    customer_reference: string;
    status: string;
    amount: string;
    currency: string;
    processing_owner: string;
};

class SubscriptionResponse extends ResponseDto<SubscriptionRow> {
    @ApiResponseField({
        format: 'uuid',
        example: '550e8400-e29b-41d4-a716-446655440000',
    })
    id!: string;

    @ApiResponseField<SubscriptionRow>({
        example: 'CUST-1001',
        transform: (source) => source.customer_reference,
    })
    customerReference!: string;

    @ApiResponseField({ example: 'active' })
    status!: string;

    @ApiResponseField<SubscriptionRow>({
        example: '49.0000 USD',
        transform: (source) => `${source.amount} ${source.currency}`,
    })
    displayAmount!: string;
}

class GetSubscriptionResponse extends SubscriptionResponse {
    @ApiResponseField<SubscriptionRow>({
        example: 'CUST-1001 · active',
        transform: (source) =>
            `${source.customer_reference} · ${source.status}`,
    })
    label!: string;
}

describe('ResponseDto', () => {
    const source: SubscriptionRow = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        customer_reference: 'CUST-1001',
        status: 'active',
        amount: '49.0000',
        currency: 'USD',
        processing_owner: 'instance-1',
    };

    it('keeps declared fields, applies transforms, and excludes internal fields', () => {
        expect(SubscriptionResponse.from(source)).toEqual({
            id: source.id,
            customerReference: 'CUST-1001',
            status: 'active',
            displayAmount: '49.0000 USD',
        });
    });

    it('includes inherited response fields', () => {
        expect(GetSubscriptionResponse.from(source)).toEqual({
            id: source.id,
            customerReference: 'CUST-1001',
            status: 'active',
            displayAmount: '49.0000 USD',
            label: 'CUST-1001 · active',
        });
    });

    it('returns an instance of the target response DTO', () => {
        expect(GetSubscriptionResponse.from(source)).toBeInstanceOf(
            GetSubscriptionResponse,
        );
    });
});
