import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { SubscriptionsAction } from './subscriptions.action';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsRepository } from './subscriptions.repository';
import { SubscriptionsService } from './subscriptions.service';

@Module({
    imports: [DatabaseModule],
    controllers: [SubscriptionsController],
    providers: [
        SubscriptionsService,
        SubscriptionsAction,
        SubscriptionsRepository,
    ],
})
export class SubscriptionsModule {}
