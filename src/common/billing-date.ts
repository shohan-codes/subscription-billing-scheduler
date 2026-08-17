/** Checks whether a calendar date matches the preserved monthly billing anchor. */
export function isBillingDateOnAnchor(
    date: string,
    anchorDay: number,
    isMonthEnd: boolean,
): boolean {
    const [year, month, day] = date.split('-').map(Number);
    const monthEnd = daysInMonth(year, month);

    return isMonthEnd
        ? day === monthEnd
        : day === Math.min(anchorDay, monthEnd);
}

/** Returns the number of calendar days in a Gregorian month. */
export function daysInMonth(year: number, month: number): number {
    if (month === 2) return isLeapYear(year) ? 29 : 28;
    if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
    return 31;
}

function isLeapYear(year: number): boolean {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
