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

    run<T>(requestId: string, callback: () => T): T {
        return this.storage.run({ requestId }, callback);
    }

    get requestId(): string | undefined {
        return this.storage.getStore()?.requestId;
    }

    setActorId(actorId: string): void {
        const store = this.storage.getStore();
        if (store) store.actorId = actorId;
    }

    get actorId(): string | undefined {
        return this.storage.getStore()?.actorId;
    }
}
