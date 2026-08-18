import { BadRequestException } from '@nestjs/common';
import { CursorCodec } from '../utils/cursor-codec';

describe('CursorCodec', () => {
    const codec = new CursorCodec();

    it('round trips a small opaque cursor payload', () => {
        const cursor = codec.encode({ dueDate: '2026-08-17', id: 'sub-1' });

        expect(codec.decodeOrThrow(cursor)).toEqual({
            dueDate: '2026-08-17',
            id: 'sub-1',
        });
    });

    it('rejects malformed cursors', () => {
        expect(() => codec.decodeOrThrow('not+a+cursor')).toThrow(
            BadRequestException,
        );
    });

    it('rejects cursors that do not match the expected payload', () => {
        const cursor = codec.encode({ id: 'sub-1' });

        expect(() =>
            codec.decodeOrThrow(
                cursor,
                (payload): payload is { dueDate: string; id: string } =>
                    typeof payload.dueDate === 'string' &&
                    typeof payload.id === 'string',
            ),
        ).toThrow(BadRequestException);
    });
});
