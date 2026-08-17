import { Injectable } from '@nestjs/common';
import { SubscriptionsAction } from './subscriptions.action';
import {
    CreateSubscriptionRequest,
    CreateSubscriptionResponse,
} from './subscriptions.dto';
import { SubscriptionsRepository } from './subscriptions.repository';

@Injectable()
export class SubscriptionsService {
    constructor(
        private readonly action: SubscriptionsAction,
        private readonly repository: SubscriptionsRepository,
    ) {}

    async create(
        request: CreateSubscriptionRequest,
    ): Promise<CreateSubscriptionResponse> {
        this.action.validateCreateOrThrow(request);
        const subscription = await this.repository.createOrThrow(request);

        return CreateSubscriptionResponse.from(subscription);
    }
}
