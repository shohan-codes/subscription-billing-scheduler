import {
    Controller,
    Get,
    Inject,
    ServiceUnavailableException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { sql } from 'kysely';
import { ApiRoute } from '../common/decorators/api-route.decorator';
import { DATABASE, type DatabaseClient } from '../database/database.module';

@ApiTags('health')
@Controller('health')
export class HealthController {
    constructor(@Inject(DATABASE) private readonly database: DatabaseClient) {}

    @Get('live')
    @ApiRoute({
        summary: 'Process liveness',
        auth: false,
        envelope: false,
        dataSchema: {
            type: 'object',
            required: ['status'],
            properties: { status: { type: 'string', example: 'ok' } },
        },
    })
    live() {
        return { status: 'ok' } as const;
    }

    @Get('ready')
    @ApiRoute({
        summary: 'Database readiness',
        auth: false,
        envelope: false,
        dataSchema: {
            type: 'object',
            required: ['status', 'checks'],
            properties: {
                status: { type: 'string', example: 'ok' },
                checks: {
                    type: 'object',
                    properties: {
                        database: { type: 'string', example: 'up' },
                    },
                },
            },
        },
    })
    async ready() {
        try {
            await sql`select 1`.execute(this.database);
            return { status: 'ok', checks: { database: 'up' } } as const;
        } catch {
            throw new ServiceUnavailableException({
                code: 'DATABASE_UNAVAILABLE',
                message: 'Database readiness check failed',
            });
        }
    }
}
