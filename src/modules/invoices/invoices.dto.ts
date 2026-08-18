import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsISO8601,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUUID,
    Matches,
    MaxLength,
} from 'class-validator';
import { ApiResponseField } from '../../common/decorators/api-response-field.decorator';
import {
    CursorPaginationMetaResponse,
    CursorPaginationRequest,
} from '../../common/dto/cursor-pagination.dto';
import { ResponseDto } from '../../common/dto/response.dto';
import { INVOICE_DATE_PATTERN, InvoiceStatus } from './invoices.constant';
import type {
    InvoiceDetailRecord,
    InvoiceItemRecord,
    InvoiceListResult,
    InvoiceRecord,
} from './invoices.types';

const InvoiceResponseField = ApiResponseField<InvoiceRecord>;
const InvoiceItemResponseField = ApiResponseField<InvoiceItemRecord>;
const InvoiceDetailResponseField = ApiResponseField<InvoiceDetailRecord>;
const ListInvoicesResponseField = ApiResponseField<InvoiceListResult>;

// ---------- Shared Invoice Response ----------

class InvoiceResponse<
    TSource extends InvoiceRecord = InvoiceRecord,
> extends ResponseDto<TSource> {
    @InvoiceResponseField({
        example: '8b4d0359-4ff4-494c-8cdd-2f42cc5a0352',
        format: 'uuid',
    })
    id!: string;

    @InvoiceResponseField({
        example: 'INV-20260831-0001',
        transform: (source) => source.invoice_number,
    })
    invoiceNumber!: string;

    @InvoiceResponseField({
        example: '81849854-7497-4ea4-a097-7aebf39f97f7',
        format: 'uuid',
        transform: (source) => source.subscription_id,
    })
    subscriptionId!: string;

    @InvoiceResponseField({
        example: 'CUST-1001',
        transform: (source) => source.customer_reference,
    })
    customerReference!: string;

    @InvoiceResponseField({
        example: '2026-08-31',
        format: 'date',
        transform: (source) => source.billing_period_start,
    })
    billingPeriodStart!: string;

    @InvoiceResponseField({
        example: '2026-09-30',
        format: 'date',
        transform: (source) => source.billing_period_end,
    })
    billingPeriodEnd!: string;

    @InvoiceResponseField({
        example: '2026-08-31',
        format: 'date',
        transform: (source) => source.issue_date,
    })
    issueDate!: string;

    @InvoiceResponseField({
        example: InvoiceStatus.Issued,
        enum: Object.values(InvoiceStatus),
        enumName: 'InvoiceStatus',
    })
    status!: InvoiceStatus;

    @InvoiceResponseField({ example: 'USD' })
    currency!: string;

    @InvoiceResponseField({ example: '49.0000' })
    subtotal!: string;

    @InvoiceResponseField({
        example: '0.0000',
        transform: (source) => source.tax_total,
    })
    taxTotal!: string;

    @InvoiceResponseField({
        example: '0.0000',
        transform: (source) => source.discount_total,
    })
    discountTotal!: string;

    @InvoiceResponseField({ example: '49.0000' })
    total!: string;

    @InvoiceResponseField({
        example: '2026-08-31T00:05:00.000Z',
        format: 'date-time',
        transform: (source) => source.created_at.toISOString(),
    })
    createdAt!: string;
}

class InvoiceItemResponse extends ResponseDto<InvoiceItemRecord> {
    @InvoiceItemResponseField({
        example: '57ed469a-cee2-4e8f-b373-84179cfb9a72',
        format: 'uuid',
    })
    id!: string;

    @InvoiceItemResponseField({ example: 'Pro Plan - Monthly' })
    description!: string;

    @InvoiceItemResponseField({ example: '1.0000' })
    quantity!: string;

    @InvoiceItemResponseField({
        example: '49.0000',
        transform: (source) => source.unit_price,
    })
    unitPrice!: string;

    @InvoiceItemResponseField({
        example: '49.0000',
        transform: (source) => source.line_total,
    })
    lineTotal!: string;
}

// ---------- Get Invoice ----------

export class GetInvoiceRequest {
    @ApiProperty({
        example: '8b4d0359-4ff4-494c-8cdd-2f42cc5a0352',
        format: 'uuid',
    })
    @IsUUID()
    id!: string;
}

export class GetInvoiceResponse extends InvoiceResponse<InvoiceDetailRecord> {
    @InvoiceDetailResponseField({
        example: null,
        nullable: true,
        type: String,
        format: 'uuid',
        transform: (source) => source.generated_by_run_id,
    })
    generatedByRunId!: string | null;

    @InvoiceDetailResponseField({
        example: [],
        type: () => InvoiceItemResponse,
        isArray: true,
        transform: (source) =>
            source.items.map((item) => InvoiceItemResponse.from(item)),
    })
    items!: InvoiceItemResponse[];
}

// ---------- List Invoices ----------

export class ListInvoicesRequest extends CursorPaginationRequest {
    @ApiPropertyOptional({
        example: '81849854-7497-4ea4-a097-7aebf39f97f7',
        format: 'uuid',
    })
    @IsOptional()
    @IsUUID()
    subscriptionId?: string;

    @ApiPropertyOptional({ example: 'CUST-1001', maxLength: 100 })
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    customerReference?: string;

    @ApiPropertyOptional({
        example: '2026-08-31',
        format: 'date',
        pattern: INVOICE_DATE_PATTERN.source,
    })
    @IsOptional()
    @IsString()
    @Matches(INVOICE_DATE_PATTERN, {
        message: 'billingPeriodStart must use YYYY-MM-DD format',
    })
    @IsISO8601({ strict: true })
    billingPeriodStart?: string;

    @ApiPropertyOptional({
        example: '2026-09-30',
        format: 'date',
        pattern: INVOICE_DATE_PATTERN.source,
    })
    @IsOptional()
    @IsString()
    @Matches(INVOICE_DATE_PATTERN, {
        message: 'billingPeriodEnd must use YYYY-MM-DD format',
    })
    @IsISO8601({ strict: true })
    billingPeriodEnd?: string;

    @ApiPropertyOptional({
        example: '2026-08-31',
        format: 'date',
        pattern: INVOICE_DATE_PATTERN.source,
    })
    @IsOptional()
    @IsString()
    @Matches(INVOICE_DATE_PATTERN, {
        message: 'issueDate must use YYYY-MM-DD format',
    })
    @IsISO8601({ strict: true })
    issueDate?: string;
}

export class ListInvoiceItemResponse extends InvoiceResponse {}

export class ListInvoicesResponse extends ResponseDto<InvoiceListResult> {
    @ListInvoicesResponseField({
        example: [],
        type: () => ListInvoiceItemResponse,
        isArray: true,
        transform: (source) =>
            source.items.map((item) => ListInvoiceItemResponse.from(item)),
    })
    items!: ListInvoiceItemResponse[];

    @ListInvoicesResponseField({
        type: () => CursorPaginationMetaResponse,
        transform: (source) =>
            CursorPaginationMetaResponse.from(source.pagination),
    })
    pagination!: CursorPaginationMetaResponse;
}
