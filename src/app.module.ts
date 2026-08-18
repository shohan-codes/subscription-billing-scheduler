import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CommonModule } from './common/common.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { AppConfigModule } from './config/app-config.module';
import { HealthModule } from './health/health.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';

@Module({
    imports: [
        AppConfigModule,
        ScheduleModule.forRoot(),
        CommonModule,
        HealthModule,
        SubscriptionsModule,
        InvoicesModule,
    ],
})
export class AppModule implements NestModule {
    /** Registers request correlation middleware for all routes. */
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(RequestIdMiddleware).forRoutes('*');
    }
}
