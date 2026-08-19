import { daysInMonth } from '../utils/calendar-date';

describe('billing date utilities', () => {
    it('handles short months and leap years', () => {
        expect(daysInMonth(2026, 2)).toBe(28);
        expect(daysInMonth(2028, 2)).toBe(29);
    });
});
