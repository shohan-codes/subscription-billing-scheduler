import {
    ConsoleLogger,
    Logger,
    RequestMethod,
    ValidationPipe,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';

/** Starts the HTTP application with shared runtime policies. */
async function bootstrap(): Promise<void> {
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
        bufferLogs: true,
    });
    const config = app.get(AppConfigService);

    app.useLogger(
        new ConsoleLogger({ json: config.app.NODE_ENV === 'production' }),
    );
    app.use(helmet());
    app.useBodyParser('json', { limit: '100kb' });
    app.useBodyParser('urlencoded', { limit: '100kb' });
    app.useGlobalPipes(
        new ValidationPipe({
            transform: true,
            whitelist: true,
            forbidNonWhitelisted: true,
        }),
    );
    app.setGlobalPrefix('api/v1', {
        exclude: [
            { path: 'health/live', method: RequestMethod.GET },
            { path: 'health/ready', method: RequestMethod.GET },
        ],
    });
    app.enableShutdownHooks();

    if (config.swagger.ENABLED) {
        const document = SwaggerModule.createDocument(
            app,
            new DocumentBuilder()
                .setTitle('Subscription Billing Scheduler API')
                .setDescription('Subscription billing scheduler HTTP API')
                .setVersion('1.0')
                .build(),
        );

        SwaggerModule.setup(config.swagger.PATH, app, document, {
            swaggerOptions: {
                displayRequestDuration: true,
                persistAuthorization: true,
            },
        });
    }

    await app.listen(config.app.PORT, '0.0.0.0');

    new Logger('Bootstrap').log({
        event: 'app.started',
        instanceId: config.app.INSTANCE_ID,
        port: config.app.PORT,
    });
}

void bootstrap();
