import { Clock } from '../clock';

describe('Clock', () => {
    it('derives calendar dates from the requested timezone', () => {
        const clock = new Clock();
        const instant = new Date('2026-08-16T19:30:00.000Z');

        expect(clock.dateInTimeZone('Asia/Dhaka', instant)).toBe('2026-08-17');
        expect(clock.dateInTimeZone('America/New_York', instant)).toBe(
            '2026-08-16',
        );
    });
});
