import { Type } from 'class-transformer';
import {
    IsInt,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ApiResponseField } from '../decorators/api-response-field.decorator';
import { ResponseDto } from './response.dto';

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 100;
const MAX_CURSOR_LENGTH = 512;

export type CursorPaginationMeta = {
    nextCursor: string | null;
    hasMore: boolean;
};

export type CursorPage<T> = {
    items: T[];
    pagination: CursorPaginationMeta;
};

/** Validates the shared cursor-pagination query contract. */
export class CursorPaginationRequest {
    @ApiPropertyOptional({
        description: 'Opaque cursor returned by the previous page',
        example: 'eyJpZCI6IjAxSldYIn0',
    })
    @IsOptional()
    @IsString()
    @MaxLength(MAX_CURSOR_LENGTH)
    cursor?: string;

    @ApiPropertyOptional({
        default: DEFAULT_PAGE_LIMIT,
        example: 50,
        minimum: 1,
        maximum: MAX_PAGE_LIMIT,
    })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(MAX_PAGE_LIMIT)
    limit = DEFAULT_PAGE_LIMIT;
}

/** Describes cursor metadata returned by list endpoints. */
export class CursorPaginationMetaResponse extends ResponseDto<CursorPaginationMeta> {
    @ApiResponseField({
        nullable: true,
        example: 'eyJpZCI6IjAxSldYIn0',
    })
    nextCursor!: string | null;

    @ApiResponseField({ example: true })
    hasMore!: boolean;
}
