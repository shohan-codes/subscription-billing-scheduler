import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { Clock } from './clock';
import { $common, type CommonLogLevel } from './common.constant';
import { RequestContext } from './request-context';
type LogValue = string | number | boolean | null | undefined;
export type LogFields = Record<string, LogValue>;

const SENSITIVE_LOG_KEY =
    /authorization|cookie|password|secret|token|database[_-]?url|connection[_-]?string/i;

/** Emits structured logs with stable application and request correlation fields. */
@Injectable()
export class AppLogger {
    private readonly logger = new Logger('Application');

    constructor(
        private readonly config: AppConfigService,
        private readonly clock: Clock,
        private readonly context: RequestContext,
    ) {}

    /** Emits a structured debug event. */
    debug(event: string, fields: LogFields = {}): void {
        this.logger.debug(this.entry($common.log.level.DEBUG, event, fields));
    }

    /** Emits a structured informational event. */
    info(event: string, fields: LogFields = {}): void {
        this.logger.log(this.entry($common.log.level.INFO, event, fields));
    }

    /** Emits a structured warning event. */
    warn(event: string, fields: LogFields = {}): void {
        this.logger.warn(this.entry($common.log.level.WARN, event, fields));
    }

    /** Emits a structured error event. */
    error(event: string, fields: LogFields = {}): void {
        this.logger.error(this.entry($common.log.level.ERROR, event, fields));
    }

    /** Builds a structured log entry with correlation fields. */
    private entry(level: CommonLogLevel, event: string, fields: LogFields) {
        return {
            ...redact(fields),
            timestamp: this.clock.now().toISOString(),
            level,
            event,
            ...(this.context.requestId
                ? { requestId: this.context.requestId }
                : {}),
            ...(this.context.actorId ? { actorId: this.context.actorId } : {}),
            instanceId: this.config.app.INSTANCE_ID,
        };
    }
}

/** Redacts sensitive structured-log fields. */
function redact(fields: LogFields): LogFields {
    return Object.fromEntries(
        Object.entries(fields).map(([key, value]) => [
            key,
            SENSITIVE_LOG_KEY.test(key) ? '[REDACTED]' : value,
        ]),
    );
}
