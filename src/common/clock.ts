import { Injectable } from '@nestjs/common';

@Injectable()
export class Clock {
    now(): Date {
        return new Date();
    }

    /** Returns the calendar date for an instant in the requested IANA timezone. */
    dateInTimeZone(timeZone: string, instant = this.now()): string {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).formatToParts(instant);
        const values = new Map(parts.map((part) => [part.type, part.value]));
        const year = values.get('year');
        const month = values.get('month');
        const day = values.get('day');

        if (!year || !month || !day) {
            throw new Error('Unable to resolve calendar date');
        }

        return `${year}-${month}-${day}`;
    }
}
