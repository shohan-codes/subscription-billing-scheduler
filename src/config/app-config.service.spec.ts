import { ConfigService } from '@nestjs/config';
import { AppConfigService } from './app-config.service';
import {
    type EnvironmentVariables,
    validateEnvironment,
} from './env.validation';

describe('AppConfigService', () => {
    it('exposes validated environment values through typed groups', () => {
        const values = validateEnvironment({
            DATABASE_URL: 'postgresql://billing:billing@localhost:5432/billing',
            PORT: '4000',
            DATABASE_POOL_MAX: '20',
            BILLING_BATCH_SIZE: '250',
            BILLING_TIMEZONE: 'Asia/Dhaka',
            OPERATOR_ID: 'operator-1',
            OPERATOR_TOKEN: '0123456789abcdef0123456789abcdef',
        });
        const appConfig = new AppConfigService(
            new ConfigService<EnvironmentVariables, true>(values),
        );

        expect(appConfig.app.PORT).toBe(4000);
        expect(appConfig.database.POOL_MAX).toBe(20);
        expect(appConfig.billing.BATCH_SIZE).toBe(250);
        expect(appConfig.billing.TIMEZONE).toBe('Asia/Dhaka');
        expect(appConfig.operator.ID).toBe('operator-1');
        expect(appConfig.operator.TOKEN).toBe(
            '0123456789abcdef0123456789abcdef',
        );
    });
});
