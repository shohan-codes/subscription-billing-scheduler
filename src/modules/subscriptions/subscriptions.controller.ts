import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    Patch,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import { ApiRoute } from '../../common/decorators/api-route.decorator';
import { OperatorGuard } from '../../common/guards/operator.guard';
import {
    BillingRetrySubscriptionRequest,
    BillingRetrySubscriptionResponse,
    CreateSubscriptionRequest,
    CreateSubscriptionResponse,
    GetSubscriptionRequest,
    GetSubscriptionResponse,
    CancelSubscriptionResponse,
    ListSubscriptionsRequest,
    ListSubscriptionsResponse,
    PauseSubscriptionResponse,
    ResumeSubscriptionResponse,
    UpdateSubscriptionRequest,
    UpdateSubscriptionResponse,
} from './subscriptions.dto';
import { SubscriptionsService } from './subscriptions.service';

@Controller('subscriptions')
export class SubscriptionsController {
    constructor(private readonly service: SubscriptionsService) {}

    /** Creates a subscription from a validated request. */
    @Post()
    @ApiRoute({
        summary: 'Create a subscription',
        status: HttpStatus.CREATED,
        auth: false,
        unprocessable: true,
        responseType: CreateSubscriptionResponse,
    })
    create(
        @Body() request: CreateSubscriptionRequest,
    ): Promise<CreateSubscriptionResponse> {
        return this.service.create(request);
    }

    /** Updates allowed subscription fields with optimistic concurrency. */
    @Patch(':id')
    @ApiRoute({
        summary: 'Update a subscription',
        auth: false,
        notFound: true,
        conflict: true,
        unprocessable: true,
        responseType: UpdateSubscriptionResponse,
    })
    update(
        @Param() params: GetSubscriptionRequest,
        @Body() request: UpdateSubscriptionRequest,
    ): Promise<UpdateSubscriptionResponse> {
        return this.service.update(params.id, request);
    }

    /** Recovers retryable or explicitly unblocked subscription billing state. */
    @Post(':id/billing-retry')
    @HttpCode(HttpStatus.ACCEPTED)
    @UseGuards(OperatorGuard)
    @ApiRoute({
        summary: 'Request subscription billing retry',
        status: HttpStatus.ACCEPTED,
        notFound: true,
        conflict: true,
        responseType: BillingRetrySubscriptionResponse,
    })
    billingRetry(
        @Param() params: GetSubscriptionRequest,
        @Body() request: BillingRetrySubscriptionRequest,
    ): Promise<BillingRetrySubscriptionResponse> {
        return this.service.billingRetry(params.id, request);
    }

    /** Pauses an active subscription. */
    @Post(':id/pause')
    @HttpCode(HttpStatus.OK)
    @ApiRoute({
        summary: 'Pause a subscription',
        auth: false,
        notFound: true,
        conflict: true,
        responseType: PauseSubscriptionResponse,
    })
    pause(
        @Param() params: GetSubscriptionRequest,
    ): Promise<PauseSubscriptionResponse> {
        return this.service.pause(params.id);
    }

    /** Resumes a paused subscription. */
    @Post(':id/resume')
    @HttpCode(HttpStatus.OK)
    @ApiRoute({
        summary: 'Resume a subscription',
        auth: false,
        notFound: true,
        conflict: true,
        responseType: ResumeSubscriptionResponse,
    })
    resume(
        @Param() params: GetSubscriptionRequest,
    ): Promise<ResumeSubscriptionResponse> {
        return this.service.resume(params.id);
    }

    /** Cancels an active or paused subscription terminally. */
    @Post(':id/cancel')
    @HttpCode(HttpStatus.OK)
    @ApiRoute({
        summary: 'Cancel a subscription',
        auth: false,
        notFound: true,
        conflict: true,
        responseType: CancelSubscriptionResponse,
    })
    cancel(
        @Param() params: GetSubscriptionRequest,
    ): Promise<CancelSubscriptionResponse> {
        return this.service.cancel(params.id);
    }

    /** Lists subscriptions with filters and cursor pagination. */
    @Get()
    @ApiRoute({
        summary: 'List subscriptions',
        auth: false,
        responseType: ListSubscriptionsResponse,
    })
    list(
        @Query() request: ListSubscriptionsRequest,
    ): Promise<ListSubscriptionsResponse> {
        return this.service.list(request);
    }

    /** Retrieves a subscription with its latest invoice summary. */
    @Get(':id')
    @ApiRoute({
        summary: 'Get a subscription',
        auth: false,
        notFound: true,
        responseType: GetSubscriptionResponse,
    })
    get(
        @Param() request: GetSubscriptionRequest,
    ): Promise<GetSubscriptionResponse> {
        return this.service.get(request);
    }
}
