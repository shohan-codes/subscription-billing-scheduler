import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { DatabaseModule } from '../../database/database.module';
import { SubscriptionsAction } from './subscriptions.action';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsRepository } from './subscriptions.repository';
import { SubscriptionsService } from './subscriptions.service';

@Module({
    imports: [CommonModule, DatabaseModule],
    controllers: [SubscriptionsController],
    providers: [
        SubscriptionsService,
        SubscriptionsAction,
        SubscriptionsRepository,
    ],
    exports: [SubscriptionsAction],
})
export class SubscriptionsModule {}
