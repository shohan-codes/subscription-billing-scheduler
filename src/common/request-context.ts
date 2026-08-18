import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';

type RequestContextStore = {
    requestId: string;
    actorId?: string;
};

/** Keeps HTTP correlation data available throughout the current async call chain. */
@Injectable()
export class RequestContext {
    private readonly storage = new AsyncLocalStorage<RequestContextStore>();

    /** Runs a callback inside a request-scoped correlation context. */
    run<T>(requestId: string, callback: () => T): T {
        return this.storage.run({ requestId }, callback);
    }

    /** Returns the current request correlation ID. */
    get requestId(): string | undefined {
        return this.storage.getStore()?.requestId;
    }

    /** Records the authenticated actor for the current request context. */
    setActorId(actorId: string): void {
        const store = this.storage.getStore();
        if (store) store.actorId = actorId;
    }

    /** Returns the authenticated actor for the current request context. */
    get actorId(): string | undefined {
        return this.storage.getStore()?.actorId;
    }
}
