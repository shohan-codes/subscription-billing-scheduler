import {
    Inject,
    Injectable,
    Module,
    OnApplicationShutdown,
} from '@nestjs/common';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool, types } from 'pg';
import { AppConfigService } from '../config/app-config.service';
import { $database } from './database.constant';
import type { DatabaseSchema } from './database.types';

// Preserve PostgreSQL date values as timezone-free YYYY-MM-DD strings.
types.setTypeParser(types.builtins.DATE, (value) => value);

export type DatabaseClient = Kysely<DatabaseSchema>;

@Injectable()
class DatabaseShutdown implements OnApplicationShutdown {
    constructor(
        @Inject($database.token.CLIENT)
        private readonly database: DatabaseClient,
    ) {}

    /** Closes the shared database client during application shutdown. */
    async onApplicationShutdown(): Promise<void> {
        await this.database.destroy();
    }
}

@Module({
    providers: [
        {
            provide: $database.token.CLIENT,
            inject: [AppConfigService],
            useFactory: (config: AppConfigService): DatabaseClient => {
                const pool = new Pool({
                    connectionString: config.database.URL,
                    max: config.database.POOL_MAX,
                    idleTimeoutMillis: config.database.IDLE_TIMEOUT_MS,
                    connectionTimeoutMillis:
                        config.database.CONNECTION_TIMEOUT_MS,
                    application_name: config.app.INSTANCE_ID,
                    keepAlive: true,
                });

                return new Kysely<DatabaseSchema>({
                    dialect: new PostgresDialect({ pool }),
                });
            },
        },
        DatabaseShutdown,
    ],
    exports: [$database.token.CLIENT],
})
export class DatabaseModule {}
