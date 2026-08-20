import { BadRequestException, Injectable } from '@nestjs/common';
import { $common } from '../common.constant';

export type CursorPayload = Record<string, string | number | boolean | null>;
export type CursorPayloadGuard<TPayload extends CursorPayload> = (
    payload: Record<string, unknown>,
) => payload is TPayload;

/** Encodes and validates opaque pagination cursors. */
@Injectable()
export class CursorCodec {
    /** Encodes a payload as an opaque base64url cursor. */
    encode(payload: CursorPayload): string {
        const cursor = Buffer.from(JSON.stringify(payload)).toString(
            $common.cursor.ENCODING,
        );

        if (cursor.length > $common.cursor.MAX_LENGTH) {
            throw new Error('Cursor payload is too large');
        }

        return cursor;
    }

    /** Decodes a cursor or throws when its encoding or payload is invalid. */
    decodeOrThrow(cursor: string): Record<string, unknown>;
    decodeOrThrow<TPayload extends CursorPayload>(
        cursor: string,
        guard: CursorPayloadGuard<TPayload>,
    ): TPayload;
    decodeOrThrow<TPayload extends CursorPayload>(
        cursor: string,
        guard?: CursorPayloadGuard<TPayload>,
    ): Record<string, unknown> | TPayload {
        try {
            if (
                cursor.length > $common.cursor.MAX_LENGTH ||
                !$common.cursor.BASE64_URL_PATTERN.test(cursor)
            ) {
                throw new Error('Malformed cursor');
            }

            const json = Buffer.from(cursor, $common.cursor.ENCODING).toString(
                'utf8',
            );

            if (
                Buffer.from(json).toString($common.cursor.ENCODING) !== cursor
            ) {
                throw new Error('Malformed cursor');
            }

            const payload: unknown = JSON.parse(json);

            if (!isRecord(payload) || (guard && !guard(payload))) {
                throw new Error('Malformed cursor');
            }

            return payload;
        } catch {
            throw new BadRequestException({
                code: $common.cursor.errorCode.INVALID,
                message: 'Pagination cursor is invalid',
            });
        }
    }
}

/** Checks whether a cursor payload is a non-null plain record. */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
