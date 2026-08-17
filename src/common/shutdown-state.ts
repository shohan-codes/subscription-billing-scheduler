import { Injectable, type BeforeApplicationShutdown } from '@nestjs/common';

/** Exposes whether application shutdown has started so workers can stop claiming work. */
@Injectable()
export class ShutdownState implements BeforeApplicationShutdown {
    private stopping = false;

    get isShuttingDown(): boolean {
        return this.stopping;
    }

    beforeApplicationShutdown(): void {
        this.stopping = true;
    }
}
