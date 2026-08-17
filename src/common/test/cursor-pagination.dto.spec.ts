import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CursorPaginationRequest } from '../dto/cursor-pagination.dto';

describe('CursorPaginationRequest', () => {
    it('uses the bounded default page size', async () => {
        const request = plainToInstance(CursorPaginationRequest, {});

        expect(await validate(request)).toHaveLength(0);
        expect(request.limit).toBe(50);
    });

    it('rejects page sizes above the shared limit', async () => {
        const request = plainToInstance(CursorPaginationRequest, {
            limit: 101,
        });

        expect(await validate(request)).not.toHaveLength(0);
    });
});
