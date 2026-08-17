import 'reflect-metadata';
import { ApiProperty, type ApiPropertyOptions } from '@nestjs/swagger';

const RESPONSE_FIELDS_METADATA = Symbol('response-fields');

export type ApiResponseFieldOptions<
    TSource extends object = Record<string, unknown>,
> = ApiPropertyOptions & {
    transform?: (source: TSource) => unknown;
};

export type ResponseFieldMetadata = {
    key: string | symbol;
    transform?: (source: object) => unknown;
};

/** Adds Swagger metadata and runtime response-mapping metadata to a DTO field. */
export function ApiResponseField<
    TSource extends object = Record<string, unknown>,
>(options: ApiResponseFieldOptions<TSource>): PropertyDecorator {
    const { transform, ...swaggerOptions } = options;

    return (target, propertyKey) => {
        ApiProperty(swaggerOptions)(target, propertyKey);

        const fields =
            (Reflect.getOwnMetadata(RESPONSE_FIELDS_METADATA, target) as
                ResponseFieldMetadata[] | undefined) ?? [];

        Reflect.defineMetadata(
            RESPONSE_FIELDS_METADATA,
            [
                ...fields,
                {
                    key: propertyKey,
                    transform: transform as
                        ((source: object) => unknown) | undefined,
                },
            ] satisfies ResponseFieldMetadata[],
            target,
        );
    };
}

/** Returns response fields from the DTO inheritance chain, with child fields overriding parent fields. */
export function getResponseFields(
    target: object,
): readonly ResponseFieldMetadata[] {
    const chain: object[] = [];

    for (
        let current: object | null = target;
        current;
        current = Object.getPrototypeOf(current) as object | null
    ) {
        chain.unshift(current);
    }

    const fields = new Map<string | symbol, ResponseFieldMetadata>();

    for (const current of chain) {
        const ownFields =
            (Reflect.getOwnMetadata(RESPONSE_FIELDS_METADATA, current) as
                ResponseFieldMetadata[] | undefined) ?? [];

        for (const field of ownFields) fields.set(field.key, field);
    }

    return [...fields.values()];
}
