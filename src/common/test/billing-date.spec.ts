import { daysInMonth, isBillingDateOnAnchor } from '../billing-date';

describe('billing date utilities', () => {
    it('handles short months and leap years', () => {
        expect(daysInMonth(2026, 2)).toBe(28);
        expect(daysInMonth(2028, 2)).toBe(29);
    });

    it('matches regular, clamped, and explicit month-end anchors', () => {
        expect(isBillingDateOnAnchor('2026-01-31', 31, false)).toBe(true);
        expect(isBillingDateOnAnchor('2026-02-28', 31, false)).toBe(true);
        expect(isBillingDateOnAnchor('2028-02-29', 31, false)).toBe(true);
        expect(isBillingDateOnAnchor('2026-04-30', 30, true)).toBe(true);
        expect(isBillingDateOnAnchor('2028-02-29', 31, true)).toBe(true);
        expect(isBillingDateOnAnchor('2026-04-29', 29, true)).toBe(false);
    });
});
