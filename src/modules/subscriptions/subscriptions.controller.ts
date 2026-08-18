import {
    Body,
    Controller,
    Get,
    HttpStatus,
    Param,
    Post,
    Query,
} from '@nestjs/common';
import { ApiRoute } from '../../common/decorators/api-route.decorator';
import {
    CreateSubscriptionRequest,
    CreateSubscriptionResponse,
    GetSubscriptionRequest,
    GetSubscriptionResponse,
    ListSubscriptionsRequest,
    ListSubscriptionsResponse,
} from './subscriptions.dto';
import { SubscriptionsService } from './subscriptions.service';

@Controller('subscriptions')
export class SubscriptionsController {
    constructor(private readonly service: SubscriptionsService) {}

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
