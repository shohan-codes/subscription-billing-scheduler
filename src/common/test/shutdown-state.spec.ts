import { ShutdownState } from '../shutdown-state';

describe('ShutdownState', () => {
    it('marks shutdown before providers are torn down', () => {
        const state = new ShutdownState();

        expect(state.isShuttingDown).toBe(false);
        state.beforeApplicationShutdown();
        expect(state.isShuttingDown).toBe(true);
    });
});
