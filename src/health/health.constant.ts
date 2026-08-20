export const $health = {
    status: {
        OK: 'ok',
    },
    checkStatus: {
        UP: 'up',
        DOWN: 'down',
    },
    errorCode: {
        DATABASE_UNAVAILABLE: 'DATABASE_UNAVAILABLE',
        SCHEDULER_UNAVAILABLE: 'SCHEDULER_UNAVAILABLE',
    },
} as const;
