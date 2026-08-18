import { BadRequestException, Injectable } from '@nestjs/common';

const MAX_CURSOR_LENGTH = 512;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

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
            'base64url',
        );

        if (cursor.length > MAX_CURSOR_LENGTH) {
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
            if (cursor.length > MAX_CURSOR_LENGTH || !BASE64URL.test(cursor)) {
                throw new Error('Malformed cursor');
            }

            const json = Buffer.from(cursor, 'base64url').toString('utf8');

            if (Buffer.from(json).toString('base64url') !== cursor) {
                throw new Error('Malformed cursor');
            }

            const payload: unknown = JSON.parse(json);

            if (!isRecord(payload) || (guard && !guard(payload))) {
                throw new Error('Malformed cursor');
            }

            return payload;
        } catch {
            throw new BadRequestException({
                code: 'INVALID_CURSOR',
                message: 'Pagination cursor is invalid',
            });
        }
    }
}

/** Checks whether a cursor payload is a non-null plain record. */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
