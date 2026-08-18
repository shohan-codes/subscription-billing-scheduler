import { Body, Controller, HttpStatus, Post } from '@nestjs/common';
import { ApiRoute } from '../../common/decorators/api-route.decorator';
import {
    CreateSubscriptionRequest,
    CreateSubscriptionResponse,
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
}
