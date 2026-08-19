import {
    Controller,
    Get,
    Header,
    HttpCode,
    HttpStatus,
    Param,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import { ApiRoute } from '../../common/decorators/api-route.decorator';
import { OperatorGuard } from '../../common/guards/operator.guard';
import {
    GetBillingRunRequest,
    GetBillingRunResponse,
    ListBillingRunItemsRequest,
    ListBillingRunItemsResponse,
    ListBillingRunsRequest,
    ListBillingRunsResponse,
    TriggerBillingRunResponse,
} from './billing-scheduler.dto';
import { BillingSchedulerMetrics } from './billing-scheduler.metrics';
import { BillingSchedulerService } from './billing-scheduler.service';

@Controller('operations/billing-runs')
export class BillingSchedulerController {
    constructor(private readonly service: BillingSchedulerService) {}

    /** Starts an operator-authorized manual billing run through normal lease coordination. */
    @Post()
    @UseGuards(OperatorGuard)
    @HttpCode(HttpStatus.ACCEPTED)
    @ApiRoute({
        summary: 'Start a manual billing run',
        status: HttpStatus.ACCEPTED,
        conflict: true,
        serviceUnavailable: true,
        responseType: TriggerBillingRunResponse,
    })
    trigger(): Promise<TriggerBillingRunResponse> {
        return this.service.triggerManual();
    }

    /** Lists recent scheduler run attempts. */
    @Get()
    @ApiRoute({
        summary: 'List billing runs',
        auth: false,
        responseType: ListBillingRunsResponse,
    })
    list(
        @Query() request: ListBillingRunsRequest,
    ): Promise<ListBillingRunsResponse> {
        return this.service.listRuns(request);
    }

    /** Retrieves one scheduler run with counters and timing. */
    @Get(':id')
    @ApiRoute({
        summary: 'Get a billing run',
        auth: false,
        notFound: true,
        responseType: GetBillingRunResponse,
    })
    get(
        @Param() request: GetBillingRunRequest,
    ): Promise<GetBillingRunResponse> {
        return this.service.getRun(request);
    }

    /** Lists per-subscription outcomes recorded for one scheduler run. */
    @Get(':id/items')
    @ApiRoute({
        summary: 'List billing run items',
        auth: false,
        notFound: true,
        responseType: ListBillingRunItemsResponse,
    })
    items(
        @Param() path: GetBillingRunRequest,
        @Query() request: ListBillingRunItemsRequest,
    ): Promise<ListBillingRunItemsResponse> {
        return this.service.listRunItems(path.id, request);
    }
}

@Controller()
export class BillingMetricsController {
    constructor(private readonly metrics: BillingSchedulerMetrics) {}

    /** Exposes bounded billing metrics in Prometheus text format. */
    @Get('metrics')
    @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
    @ApiRoute({
        summary: 'Get billing metrics',
        auth: false,
        envelope: false,
        dataSchema: {
            type: 'string',
            example: '# TYPE billing_run_total counter',
        },
    })
    metricsText(): string {
        return this.metrics.render();
    }
}
