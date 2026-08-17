import type { Server } from 'node:http';
import {
    BadRequestException,
    Controller,
    Get,
    INestApplication,
    MiddlewareConsumer,
    Module,
    NestModule,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppConfigModule } from '../../config/app-config.module';
import { CommonModule } from '../common.module';
import { SkipEnvelope } from '../decorators/skip-envelope.decorator';
import { RequestIdMiddleware } from '../request-id.middleware';

process.env.DATABASE_URL ??=
    'postgresql://billing:billing@localhost:5432/subscription_billing';

@Controller()
class TestController {
    @Get('wrapped')
    wrapped() {
        return { value: 42 };
    }

    @Get('raw')
    @SkipEnvelope()
    raw() {
        return { value: 42 };
    }

    @Get('invalid')
    invalid(): never {
        throw new BadRequestException({
            code: 'INVALID_INPUT',
            message: 'Input is invalid',
            details: { field: 'value' },
        });
    }
}

@Module({
    imports: [AppConfigModule, CommonModule],
    controllers: [TestController],
})
class TestModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(RequestIdMiddleware).forRoutes('*');
    }
}

describe('common HTTP foundation', () => {
    let app: INestApplication<Server>;

    beforeAll(async () => {
        const module = await Test.createTestingModule({
            imports: [TestModule],
        }).compile();

        app = module.createNestApplication();
        await app.init();
    });

    afterAll(async () => {
        await app.close();
    });

    it('propagates request IDs and wraps successful responses', async () => {
        await request(app.getHttpServer())
            .get('/wrapped')
            .set('x-request-id', 'req-test-123')
            .expect('x-request-id', 'req-test-123')
            .expect(200)
            .expect({
                success: true,
                data: { value: 42 },
                message: '',
                errors: [],
            });
    });

    it('allows routes to skip the success envelope', () =>
        request(app.getHttpServer())
            .get('/raw')
            .expect(200)
            .expect({ value: 42 }));

    it('returns the standard error envelope without internal details', async () => {
        const response = await request(app.getHttpServer())
            .get('/invalid')
            .set('x-request-id', 'req-error-123')
            .expect(400);

        const body = response.body as Record<string, unknown>;

        expect(body).toMatchObject({
            code: 'INVALID_INPUT',
            message: 'Input is invalid',
            details: { field: 'value' },
            requestId: 'req-error-123',
        });
        expect(body.timestamp).toEqual(expect.any(String));
        expect(body).not.toHaveProperty('stack');
    });
});
