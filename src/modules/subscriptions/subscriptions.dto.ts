import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsBoolean,
    IsIn,
    IsInt,
    IsISO8601,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUUID,
    Matches,
    Max,
    MaxLength,
    Min,
    ValidateIf,
} from 'class-validator';
import { ApiResponseField } from '../../common/decorators/api-response-field.decorator';
import {
    CursorPaginationMetaResponse,
    CursorPaginationRequest,
} from '../../common/dto/cursor-pagination.dto';
import { ResponseDto } from '../../common/dto/response.dto';
import {
    SUBSCRIPTION_AMOUNT_PATTERN,
    SUBSCRIPTION_CURRENCY_PATTERN,
    SUBSCRIPTION_DATE_PATTERN,
    SubscriptionBillingState,
    SubscriptionStatus,
} from './subscriptions.constant';
import type {
    InvoiceRecord,
    SubscriptionListResult,
    SubscriptionRecord,
    SubscriptionWithLatestInvoice,
} from './subscriptions.types';

const SubscriptionResponseField = ApiResponseField<SubscriptionRecord>;
const LatestInvoiceResponseField = ApiResponseField<InvoiceRecord>;
const GetSubscriptionResponseField =
    ApiResponseField<SubscriptionWithLatestInvoice>;
const ListSubscriptionsResponseField = ApiResponseField<SubscriptionListResult>;

// ---------- Shared Subscription Response ----------

class SubscriptionResponse<
    TSource extends SubscriptionRecord = SubscriptionRecord,
> extends ResponseDto<TSource> {
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

export class LatestInvoiceSummaryResponse extends ResponseDto<InvoiceRecord> {
    @LatestInvoiceResponseField({
        example: '8b4d0359-4ff4-494c-8cdd-2f42cc5a0352',
        format: 'uuid',
    })
    id!: string;

    @LatestInvoiceResponseField({
        example: 'INV-20260831-0001',
        transform: (source) => source.invoice_number,
    })
    invoiceNumber!: string;

    @LatestInvoiceResponseField({
        example: '2026-08-01',
        format: 'date',
        transform: (source) => source.billing_period_start,
    })
    billingPeriodStart!: string;

    @LatestInvoiceResponseField({
        example: '2026-09-01',
        format: 'date',
        transform: (source) => source.billing_period_end,
    })
    billingPeriodEnd!: string;

    @LatestInvoiceResponseField({
        example: '2026-08-31',
        format: 'date',
        transform: (source) => source.issue_date,
    })
    issueDate!: string;

    @LatestInvoiceResponseField({ example: 'issued' })
    status!: 'issued';

    @LatestInvoiceResponseField({ example: 'USD' })
    currency!: string;

    @LatestInvoiceResponseField({ example: '49.0000' })
    total!: string;
}

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

    @ApiProperty({
        example: '49.0000',
        pattern: SUBSCRIPTION_AMOUNT_PATTERN.source,
    })
    @IsString()
    @Matches(SUBSCRIPTION_AMOUNT_PATTERN, {
        message:
            'amount must be greater than zero with up to 15 integer and 4 fractional digits',
    })
    amount!: string;

    @ApiProperty({
        example: 'USD',
        minLength: 3,
        maxLength: 3,
        pattern: SUBSCRIPTION_CURRENCY_PATTERN.source,
    })
    @IsString()
    @Matches(SUBSCRIPTION_CURRENCY_PATTERN, {
        message: 'currency must be a three-letter uppercase code',
    })
    currency!: string;

    @ApiProperty({
        example: '2026-08-16',
        format: 'date',
        pattern: SUBSCRIPTION_DATE_PATTERN.source,
    })
    @IsString()
    @Matches(SUBSCRIPTION_DATE_PATTERN, {
        message: 'startDate must use YYYY-MM-DD format',
    })
    @IsISO8601({ strict: true })
    startDate!: string;

    @ApiProperty({
        example: '2026-08-31',
        format: 'date',
        pattern: SUBSCRIPTION_DATE_PATTERN.source,
    })
    @IsString()
    @Matches(SUBSCRIPTION_DATE_PATTERN, {
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

export class CreateSubscriptionResponse extends SubscriptionResponse {}

// ---------- Update Subscription ----------

export class UpdateSubscriptionRequest {
    @ApiPropertyOptional({ example: 'Pro Plan - Annual', maxLength: 255 })
    @ValidateIf((_object, value: unknown) => value !== undefined)
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    description?: string;

    @ApiPropertyOptional({
        example: '99.0000',
        pattern: SUBSCRIPTION_AMOUNT_PATTERN.source,
    })
    @ValidateIf((_object, value: unknown) => value !== undefined)
    @IsString()
    @Matches(SUBSCRIPTION_AMOUNT_PATTERN, {
        message:
            'amount must be greater than zero with up to 15 integer and 4 fractional digits',
    })
    amount?: string;

    @ApiPropertyOptional({
        example: 'EUR',
        minLength: 3,
        maxLength: 3,
        pattern: SUBSCRIPTION_CURRENCY_PATTERN.source,
    })
    @ValidateIf((_object, value: unknown) => value !== undefined)
    @IsString()
    @Matches(SUBSCRIPTION_CURRENCY_PATTERN, {
        message: 'currency must be a three-letter uppercase code',
    })
    currency?: string;

    @ApiPropertyOptional({
        example: '2026-09-30',
        format: 'date',
        pattern: SUBSCRIPTION_DATE_PATTERN.source,
    })
    @ValidateIf((_object, value: unknown) => value !== undefined)
    @IsString()
    @Matches(SUBSCRIPTION_DATE_PATTERN, {
        message: 'nextBillingDate must use YYYY-MM-DD format',
    })
    @IsISO8601({ strict: true })
    nextBillingDate?: string;

    @ApiPropertyOptional({ example: 30, minimum: 1, maximum: 31 })
    @ValidateIf((_object, value: unknown) => value !== undefined)
    @IsInt()
    @Min(1)
    @Max(31)
    billingAnchorDay?: number;

    @ApiPropertyOptional({ example: true })
    @ValidateIf((_object, value: unknown) => value !== undefined)
    @IsBoolean()
    anchorIsMonthEnd?: boolean;

    @ApiProperty({ example: 1, minimum: 1 })
    @IsInt()
    @Min(1)
    version!: number;
}

export class UpdateSubscriptionResponse extends SubscriptionResponse {}

// ---------- Pause Subscription ----------

export class PauseSubscriptionResponse extends SubscriptionResponse {}

// ---------- Resume Subscription ----------

export class ResumeSubscriptionResponse extends SubscriptionResponse {}

// ---------- Cancel Subscription ----------

export class CancelSubscriptionResponse extends SubscriptionResponse {}

// ---------- Get Subscription ----------

export class GetSubscriptionRequest {
    @ApiProperty({
        example: '81849854-7497-4ea4-a097-7aebf39f97f7',
        format: 'uuid',
    })
    @IsUUID()
    id!: string;
}

export class GetSubscriptionResponse extends SubscriptionResponse<SubscriptionWithLatestInvoice> {
    @GetSubscriptionResponseField({
        example: null,
        nullable: true,
        type: () => LatestInvoiceSummaryResponse,
        transform: (source) =>
            source.latestInvoice
                ? LatestInvoiceSummaryResponse.from(source.latestInvoice)
                : null,
    })
    latestInvoice!: LatestInvoiceSummaryResponse | null;
}

// ---------- List Subscriptions ----------

export class ListSubscriptionsRequest extends CursorPaginationRequest {
    @ApiPropertyOptional({
        example: SubscriptionStatus.Active,
        enum: Object.values(SubscriptionStatus),
        enumName: 'SubscriptionStatus',
    })
    @IsOptional()
    @IsIn(Object.values(SubscriptionStatus))
    status?: SubscriptionStatus;

    @ApiPropertyOptional({
        example: SubscriptionBillingState.Ready,
        enum: Object.values(SubscriptionBillingState),
        enumName: 'SubscriptionBillingState',
    })
    @IsOptional()
    @IsIn(Object.values(SubscriptionBillingState))
    billingState?: SubscriptionBillingState;

    @ApiPropertyOptional({ example: 'CUST-1001', maxLength: 100 })
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    customerReference?: string;

    @ApiPropertyOptional({
        description: 'Include subscriptions due on or before this date',
        example: '2026-08-31',
        format: 'date',
        pattern: SUBSCRIPTION_DATE_PATTERN.source,
    })
    @IsOptional()
    @IsString()
    @Matches(SUBSCRIPTION_DATE_PATTERN, {
        message: 'dueBefore must use YYYY-MM-DD format',
    })
    @IsISO8601({ strict: true })
    dueBefore?: string;
}

export class ListSubscriptionItemResponse extends SubscriptionResponse {}

export class ListSubscriptionsResponse extends ResponseDto<SubscriptionListResult> {
    @ListSubscriptionsResponseField({
        example: [],
        type: () => ListSubscriptionItemResponse,
        isArray: true,
        transform: (source) =>
            source.items.map((item) => ListSubscriptionItemResponse.from(item)),
    })
    items!: ListSubscriptionItemResponse[];

    @ListSubscriptionsResponseField({
        type: () => CursorPaginationMetaResponse,
        transform: (source) =>
            CursorPaginationMetaResponse.from(source.pagination),
    })
    pagination!: CursorPaginationMetaResponse;
}
