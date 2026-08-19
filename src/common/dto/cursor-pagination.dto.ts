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
import { $common } from '../common.constant';
import { ApiResponseField } from '../decorators/api-response-field.decorator';
import { ResponseDto } from './response.dto';

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
    @MaxLength($common.cursor.MAX_LENGTH)
    cursor?: string;

    @ApiPropertyOptional({
        default: $common.cursor.page.DEFAULT_LIMIT,
        example: 50,
        minimum: 1,
        maximum: $common.cursor.page.MAX_LIMIT,
    })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max($common.cursor.page.MAX_LIMIT)
    limit = $common.cursor.page.DEFAULT_LIMIT;
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
