import type { Server } from 'node:http';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

process.env.DATABASE_URL ??=
    'postgresql://billing:billing@localhost:5432/subscription_billing';

describe('App (e2e)', () => {
    let app: INestApplication<Server>;

    beforeEach(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        await app.init();
    });

    afterEach(async () => {
        await app.close();
    });

    it('/health/live (GET)', () =>
        request(app.getHttpServer())
            .get('/health/live')
            .expect(200)
            .expect({ status: 'ok' }));
});
