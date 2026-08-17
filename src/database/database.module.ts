import {
    Inject,
    Injectable,
    Module,
    OnApplicationShutdown,
} from '@nestjs/common';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { AppConfigService } from '../config/app-config.service';

export const DATABASE = Symbol('DATABASE');
export type DatabaseSchema = Record<never, never>;
export type DatabaseClient = Kysely<DatabaseSchema>;

@Injectable()
class DatabaseShutdown implements OnApplicationShutdown {
    constructor(@Inject(DATABASE) private readonly database: DatabaseClient) {}

    async onApplicationShutdown(): Promise<void> {
        await this.database.destroy();
    }
}

@Module({
    providers: [
        {
            provide: DATABASE,
            inject: [AppConfigService],
            useFactory: (config: AppConfigService): DatabaseClient => {
                const pool = new Pool({
                    connectionString: config.database.url,
                    max: config.database.poolMax,
                    idleTimeoutMillis: config.database.idleTimeoutMs,
                    connectionTimeoutMillis:
                        config.database.connectionTimeoutMs,
                    application_name: config.app.instanceId,
                    keepAlive: true,
                });

                return new Kysely<DatabaseSchema>({
                    dialect: new PostgresDialect({ pool }),
                });
            },
        },
        DatabaseShutdown,
    ],
    exports: [DATABASE],
})
export class DatabaseModule {}
