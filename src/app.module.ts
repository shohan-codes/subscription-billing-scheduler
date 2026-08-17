import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CommonModule } from './common/common.module';
import { RequestIdMiddleware } from './common/request-id.middleware';
import { AppConfigModule } from './config/app-config.module';
import { HealthModule } from './health/health.module';

@Module({
    imports: [
        AppConfigModule,
        ScheduleModule.forRoot(),
        CommonModule,
        HealthModule,
    ],
})
export class AppModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(RequestIdMiddleware).forRoutes('*');
    }
}
