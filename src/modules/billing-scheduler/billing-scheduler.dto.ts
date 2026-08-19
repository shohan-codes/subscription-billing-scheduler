import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ApiResponseField } from '../../common/decorators/api-response-field.decorator';
import {
    CursorPaginationMetaResponse,
    CursorPaginationRequest,
} from '../../common/dto/cursor-pagination.dto';
import { ResponseDto } from '../../common/dto/response.dto';
import {
    $billingScheduler,
    type SchedulerRunItemResult,
    type SchedulerRunStatus,
    type SchedulerTriggerType,
} from './billing-scheduler.constant';
import type {
    SchedulerRunItemListResult,
    SchedulerRunItemRecord,
    SchedulerRunListResult,
    SchedulerRunRecord,
} from './billing-scheduler.types';

const RunResponseField = ApiResponseField<SchedulerRunRecord>;
const RunItemResponseField = ApiResponseField<SchedulerRunItemRecord>;
const RunListResponseField = ApiResponseField<SchedulerRunListResult>;
const RunItemListResponseField = ApiResponseField<SchedulerRunItemListResult>;

class BillingRunResponse extends ResponseDto<SchedulerRunRecord> {
    @RunResponseField({
        example: '8b4d0359-4ff4-494c-8cdd-2f42cc5a0352',
        format: 'uuid',
    })
    id!: string;

    @RunResponseField({
        example: $billingScheduler.job.NAME,
        transform: (source) => source.job_name,
    })
    jobName!: string;

    @RunResponseField({
        example: $billingScheduler.triggerType.MANUAL,
        enum: Object.values($billingScheduler.triggerType),
        enumName: 'SchedulerTriggerType',
        transform: (source) => source.trigger_type,
    })
    triggerType!: SchedulerTriggerType;

    @RunResponseField({
        example: $billingScheduler.runStatus.COMPLETED,
        enum: Object.values($billingScheduler.runStatus),
        enumName: 'SchedulerRunStatus',
    })
    status!: SchedulerRunStatus;

    @RunResponseField({
        example: '2026-08-18T00:05:00.000Z',
        format: 'date-time',
        transform: (source) => source.triggered_at.toISOString(),
    })
    triggeredAt!: string;

    @RunResponseField({
        example: '2026-08-18',
        format: 'date',
        transform: (source) => source.cutoff_date,
    })
    cutoffDate!: string;

    @RunResponseField({
        example: 'billing-api-1',
        transform: (source) => source.instance_id,
    })
    instanceId!: string;

    @RunResponseField({
        example: '2026-08-18T00:05:00.000Z',
        nullable: true,
        format: 'date-time',
        transform: (source) => source.started_at?.toISOString() ?? null,
    })
    startedAt!: string | null;

    @RunResponseField({
        example: '2026-08-18T00:05:01.000Z',
        nullable: true,
        format: 'date-time',
        transform: (source) => source.completed_at?.toISOString() ?? null,
    })
    completedAt!: string | null;

    @RunResponseField({
        example: '2026-08-18T00:05:00.000Z',
        nullable: true,
        format: 'date-time',
        transform: (source) => source.last_heartbeat_at?.toISOString() ?? null,
    })
    lastHeartbeatAt!: string | null;

    @RunResponseField({
        example: 0,
        transform: (source) => source.eligible_count,
    })
    eligibleCount!: number;

    @RunResponseField({
        example: 0,
        transform: (source) => source.claimed_count,
    })
    claimedCount!: number;

    @RunResponseField({
        example: 0,
        transform: (source) => source.succeeded_count,
    })
    succeededCount!: number;

    @RunResponseField({
        example: 0,
        transform: (source) => source.failed_count,
    })
    failedCount!: number;

    @RunResponseField({
        example: 0,
        transform: (source) => source.skipped_count,
    })
    skippedCount!: number;

    @RunResponseField({
        example: 0,
        transform: (source) => source.invoices_created_count,
    })
    invoicesCreatedCount!: number;

    @RunResponseField({
        example: null,
        nullable: true,
        transform: (source) => source.error_code,
    })
    errorCode!: string | null;

    @RunResponseField({
        example: null,
        nullable: true,
        transform: (source) => source.error_message,
    })
    errorMessage!: string | null;
}

class BillingRunItemResponse extends ResponseDto<SchedulerRunItemRecord> {
    @RunItemResponseField({
        example: '60be78b2-f464-42df-af04-965b1667810c',
        format: 'uuid',
    })
    id!: string;

    @RunItemResponseField({
        example: '81849854-7497-4ea4-a097-7aebf39f97f7',
        format: 'uuid',
        transform: (source) => source.subscription_id,
    })
    subscriptionId!: string;

    @RunItemResponseField({
        example: $billingScheduler.runItemResult.SUCCESS,
        enum: Object.values($billingScheduler.runItemResult),
        enumName: 'SchedulerRunItemResult',
    })
    result!: SchedulerRunItemResult;

    @RunItemResponseField({
        example: '2026-08-18',
        format: 'date',
        transform: (source) => source.before_billing_date,
    })
    beforeBillingDate!: string;

    @RunItemResponseField({
        example: '2026-09-18',
        nullable: true,
        format: 'date',
        transform: (source) => source.after_billing_date,
    })
    afterBillingDate!: string | null;

    @RunItemResponseField({
        example: 1,
        transform: (source) => source.invoices_created,
    })
    invoicesCreated!: number;

    @RunItemResponseField({
        example: null,
        nullable: true,
        transform: (source) => source.error_type,
    })
    errorType!: string | null;

    @RunItemResponseField({
        example: null,
        nullable: true,
        transform: (source) => source.error_code,
    })
    errorCode!: string | null;

    @RunItemResponseField({
        example: null,
        nullable: true,
        transform: (source) => source.error_message,
    })
    errorMessage!: string | null;

    @RunItemResponseField({
        example: '2026-08-18T00:05:00.000Z',
        format: 'date-time',
        transform: (source) => source.started_at.toISOString(),
    })
    startedAt!: string;

    @RunItemResponseField({
        example: '2026-08-18T00:05:01.000Z',
        format: 'date-time',
        transform: (source) => source.completed_at.toISOString(),
    })
    completedAt!: string;
}

// ---------- Manual Billing Run ----------

export class TriggerBillingRunResponse extends BillingRunResponse {}

// ---------- Get Billing Run ----------

export class GetBillingRunRequest {
    @ApiProperty({
        example: '8b4d0359-4ff4-494c-8cdd-2f42cc5a0352',
        format: 'uuid',
    })
    @IsUUID()
    id!: string;
}

export class GetBillingRunResponse extends BillingRunResponse {}

// ---------- List Billing Runs ----------

export class ListBillingRunsRequest extends CursorPaginationRequest {
    @ApiPropertyOptional({
        example: $billingScheduler.triggerType.MANUAL,
        enum: Object.values($billingScheduler.triggerType),
        enumName: 'SchedulerTriggerType',
    })
    @IsOptional()
    @IsIn(Object.values($billingScheduler.triggerType))
    triggerType?: SchedulerTriggerType;

    @ApiPropertyOptional({
        example: $billingScheduler.runStatus.COMPLETED,
        enum: Object.values($billingScheduler.runStatus),
        enumName: 'SchedulerRunStatus',
    })
    @IsOptional()
    @IsIn(Object.values($billingScheduler.runStatus))
    status?: SchedulerRunStatus;
}

export class ListBillingRunItemResponse extends BillingRunResponse {}

export class ListBillingRunsResponse extends ResponseDto<SchedulerRunListResult> {
    @RunListResponseField({
        example: [],
        type: () => ListBillingRunItemResponse,
        isArray: true,
        transform: (source) =>
            source.items.map((item) => ListBillingRunItemResponse.from(item)),
    })
    items!: ListBillingRunItemResponse[];

    @RunListResponseField({
        type: () => CursorPaginationMetaResponse,
        transform: (source) =>
            CursorPaginationMetaResponse.from(source.pagination),
    })
    pagination!: CursorPaginationMetaResponse;
}

// ---------- List Billing Run Items ----------

export class ListBillingRunItemsRequest extends CursorPaginationRequest {
    @ApiPropertyOptional({
        example: $billingScheduler.runItemResult.FAILED,
        enum: Object.values($billingScheduler.runItemResult),
        enumName: 'SchedulerRunItemResult',
    })
    @IsOptional()
    @IsIn(Object.values($billingScheduler.runItemResult))
    result?: SchedulerRunItemResult;

    @ApiPropertyOptional({ example: 'DATABASE_DEADLOCK', maxLength: 80 })
    @IsOptional()
    @IsString()
    @MaxLength(80)
    errorCode?: string;
}

export class ListBillingRunItemDetailResponse extends BillingRunItemResponse {}

export class ListBillingRunItemsResponse extends ResponseDto<SchedulerRunItemListResult> {
    @RunItemListResponseField({
        example: [],
        type: () => ListBillingRunItemDetailResponse,
        isArray: true,
        transform: (source) =>
            source.items.map((item) =>
                ListBillingRunItemDetailResponse.from(item),
            ),
    })
    items!: ListBillingRunItemDetailResponse[];

    @RunItemListResponseField({
        type: () => CursorPaginationMetaResponse,
        transform: (source) =>
            CursorPaginationMetaResponse.from(source.pagination),
    })
    pagination!: CursorPaginationMetaResponse;
}
