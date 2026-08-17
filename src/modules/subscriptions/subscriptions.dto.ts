import { ApiProperty } from '@nestjs/swagger';
import {
    IsBoolean,
    IsInt,
    IsISO8601,
    IsNotEmpty,
    IsString,
    Matches,
    Max,
    MaxLength,
    Min,
} from 'class-validator';
import { ApiResponseField } from '../../common/decorators/api-response-field.decorator';
import { ResponseDto } from '../../common/dto/response.dto';
import {
    SubscriptionBillingState,
    SubscriptionStatus,
} from './subscriptions.constant';
import type { SubscriptionRecord } from './subscriptions.types';

const SubscriptionResponseField = ApiResponseField<SubscriptionRecord>;

const AMOUNT_PATTERN = /^(?=.*[1-9])\d{1,15}(?:\.\d{1,4})?$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// ---------- Create Subscription ----------

export class CreateSubscriptionRequest {
    @ApiProperty({ example: 'CUST-1001', maxLength: 100 })
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    customerReference!: string;

    @ApiProperty({ example: 'Pro Plan - Monthly', maxLength: 255 })
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    description!: string;

    @ApiProperty({ example: '49.0000', pattern: AMOUNT_PATTERN.source })
    @IsString()
    @Matches(AMOUNT_PATTERN, {
        message:
            'amount must be greater than zero with up to 15 integer and 4 fractional digits',
    })
    amount!: string;

    @ApiProperty({
        example: 'USD',
        minLength: 3,
        maxLength: 3,
        pattern: CURRENCY_PATTERN.source,
    })
    @IsString()
    @Matches(CURRENCY_PATTERN, {
        message: 'currency must be a three-letter uppercase code',
    })
    currency!: string;

    @ApiProperty({
        example: '2026-08-16',
        format: 'date',
        pattern: DATE_PATTERN.source,
    })
    @IsString()
    @Matches(DATE_PATTERN, { message: 'startDate must use YYYY-MM-DD format' })
    @IsISO8601({ strict: true })
    startDate!: string;

    @ApiProperty({
        example: '2026-08-31',
        format: 'date',
        pattern: DATE_PATTERN.source,
    })
    @IsString()
    @Matches(DATE_PATTERN, {
        message: 'firstBillingDate must use YYYY-MM-DD format',
    })
    @IsISO8601({ strict: true })
    firstBillingDate!: string;

    @ApiProperty({ example: 31, minimum: 1, maximum: 31 })
    @IsInt()
    @Min(1)
    @Max(31)
    billingAnchorDay!: number;

    @ApiProperty({ example: true })
    @IsBoolean()
    anchorIsMonthEnd!: boolean;
}

export class CreateSubscriptionResponse extends ResponseDto<SubscriptionRecord> {
    @SubscriptionResponseField({
        example: '81849854-7497-4ea4-a097-7aebf39f97f7',
        format: 'uuid',
    })
    id!: string;

    @SubscriptionResponseField({
        example: 'CUST-1001',
        transform: (source) => source.customer_reference,
    })
    customerReference!: string;

    @SubscriptionResponseField({ example: 'Pro Plan - Monthly' })
    description!: string;

    @SubscriptionResponseField({
        example: SubscriptionStatus.Active,
        enum: Object.values(SubscriptionStatus),
        enumName: 'SubscriptionStatus',
    })
    status!: SubscriptionStatus;

    @SubscriptionResponseField({
        example: SubscriptionBillingState.Ready,
        enum: Object.values(SubscriptionBillingState),
        enumName: 'SubscriptionBillingState',
        transform: (source) => source.billing_state,
    })
    billingState!: SubscriptionBillingState;

    @SubscriptionResponseField({ example: 'USD' })
    currency!: string;

    @SubscriptionResponseField({ example: '49.0000' })
    amount!: string;

    @SubscriptionResponseField({
        example: '2026-08-16',
        format: 'date',
        transform: (source) => source.start_date,
    })
    startDate!: string;

    @SubscriptionResponseField({
        example: '2026-08-31',
        format: 'date',
        transform: (source) => source.next_billing_date,
    })
    nextBillingDate!: string;

    @SubscriptionResponseField({
        example: 31,
        transform: (source) => source.billing_anchor_day,
    })
    billingAnchorDay!: number;

    @SubscriptionResponseField({
        example: true,
        transform: (source) => source.anchor_is_month_end,
    })
    anchorIsMonthEnd!: boolean;

    @SubscriptionResponseField({
        example: 0,
        transform: (source) => source.billing_failure_count,
    })
    billingFailureCount!: number;

    @SubscriptionResponseField({
        example: null,
        nullable: true,
        type: String,
        format: 'date-time',
        transform: (source) => source.billing_retry_at?.toISOString() ?? null,
    })
    billingRetryAt!: string | null;

    @SubscriptionResponseField({
        example: null,
        nullable: true,
        type: String,
        transform: (source) => source.last_billing_error_code,
    })
    lastBillingErrorCode!: string | null;

    @SubscriptionResponseField({
        example: null,
        nullable: true,
        type: String,
        transform: (source) => source.last_billing_error_message,
    })
    lastBillingErrorMessage!: string | null;

    @SubscriptionResponseField({ example: 1 })
    version!: number;

    @SubscriptionResponseField({
        example: '2026-08-17T08:00:00.000Z',
        format: 'date-time',
        transform: (source) => source.created_at.toISOString(),
    })
    createdAt!: string;

    @SubscriptionResponseField({
        example: '2026-08-17T08:00:00.000Z',
        format: 'date-time',
        transform: (source) => source.updated_at.toISOString(),
    })
    updatedAt!: string;
}
