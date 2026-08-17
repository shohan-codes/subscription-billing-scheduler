import { applyDecorators, type Type } from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiExtraModels,
    ApiOperation,
    ApiResponse,
    getSchemaPath,
} from '@nestjs/swagger';
import { SkipEnvelope } from './skip-envelope.decorator';

type OpenApiSchema = Record<string, unknown>;

export type ApiRouteOptions = {
    summary: string;
    status?: number;
    description?: string;
    auth?: boolean;
    notFound?: boolean;
    conflict?: boolean;
    responseType?: Type<unknown>;
    responseIsArray?: boolean;
    dataSchema?: OpenApiSchema;
    envelope?: boolean;
};

export const ApiRoute = ({
    summary,
    status = 200,
    description = 'Successful response',
    auth = true,
    notFound = false,
    conflict = false,
    responseType,
    responseIsArray = false,
    dataSchema,
    envelope = true,
}: ApiRouteOptions) => {
    const responseSchema = makeResponseSchema({
        responseType,
        responseIsArray,
        dataSchema,
        envelope,
    });
    const decorators = [ApiOperation({ summary })];

    if (!envelope) decorators.push(SkipEnvelope());
    if (responseType) decorators.push(ApiExtraModels(responseType));

    decorators.push(
        ApiResponse({ status, description, schema: responseSchema }),
        apiErrorResponse(400, 'Validation or malformed request'),
    );

    if (auth) {
        decorators.push(
            ApiBearerAuth(),
            apiErrorResponse(401, 'Unauthenticated'),
            apiErrorResponse(403, 'Forbidden'),
        );
    }

    if (notFound) {
        decorators.push(apiErrorResponse(404, 'Resource not found'));
    }
    if (conflict) decorators.push(apiErrorResponse(409, 'Conflict'));

    decorators.push(
        apiErrorResponse(429, 'Too many requests'),
        apiErrorResponse(500, 'Unexpected server error'),
    );

    return applyDecorators(...decorators);
};

type ResponseSchemaOptions = Pick<
    ApiRouteOptions,
    'responseType' | 'responseIsArray' | 'dataSchema' | 'envelope'
>;

function makeResponseSchema({
    responseType,
    responseIsArray,
    dataSchema,
    envelope,
}: ResponseSchemaOptions): OpenApiSchema {
    const resolvedDataSchema =
        dataSchema ??
        (responseType
            ? responseIsArray
                ? {
                      type: 'array',
                      items: { $ref: getSchemaPath(responseType) },
                  }
                : { $ref: getSchemaPath(responseType) }
            : { type: 'object', additionalProperties: true });

    if (!envelope) return resolvedDataSchema;

    return {
        type: 'object',
        required: ['success', 'data', 'message', 'errors'],
        properties: {
            success: { type: 'boolean', example: true },
            data: resolvedDataSchema,
            message: { type: 'string', example: '' },
            errors: { type: 'array', maxItems: 0 },
        },
    };
}

function apiErrorResponse(status: number, description: string) {
    return ApiResponse({ status, description, schema: apiErrorSchema });
}

const apiErrorSchema: OpenApiSchema = {
    type: 'object',
    required: ['code', 'message', 'requestId', 'timestamp'],
    properties: {
        code: { type: 'string', example: 'INVALID_BILLING_ANCHOR' },
        message: { type: 'string', example: 'Billing anchor is invalid' },
        details: {
            type: 'object',
            nullable: true,
            additionalProperties: true,
        },
        requestId: {
            type: 'string',
            example: '6f6390ca-c75f-4da5-a95d-d36a6f03fd39',
        },
        timestamp: {
            type: 'string',
            format: 'date-time',
            example: '2026-08-17T04:00:00.000Z',
        },
    },
};
