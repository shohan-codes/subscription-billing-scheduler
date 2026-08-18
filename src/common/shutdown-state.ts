import { Injectable, type BeforeApplicationShutdown } from '@nestjs/common';

/** Exposes whether application shutdown has started so workers can stop claiming work. */
@Injectable()
export class ShutdownState implements BeforeApplicationShutdown {
    private stopping = false;

    /** Reports whether application shutdown has started. */
    get isShuttingDown(): boolean {
        return this.stopping;
    }

    /** Marks the application as shutting down before teardown begins. */
    beforeApplicationShutdown(): void {
        this.stopping = true;
    }
}
