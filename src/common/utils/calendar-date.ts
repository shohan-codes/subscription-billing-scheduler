/** Returns the number of calendar days in a Gregorian month. */
export function daysInMonth(year: number, month: number): number {
    switch (month) {
        case 2:
            return isLeapYear(year) ? 29 : 28;

        case 4:
        case 6:
        case 9:
        case 11:
            return 30;

        default:
            return 31;
    }
}

/** Checks whether a Gregorian year contains a leap day. */
function isLeapYear(year: number): boolean {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
