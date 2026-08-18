import { ApiHideProperty } from '@nestjs/swagger';
import { getResponseFields } from '../decorators/api-response-field.decorator';

type ResponseDtoConstructor<TResponse extends ResponseDto<object>> = {
    prototype: TResponse;
};

type ResponseSource<TResponse> =
    TResponse extends ResponseDto<infer TSource> ? TSource : never;

/** Maps an internal object to only the fields declared by `@ApiResponseField`. */
export abstract class ResponseDto<
    TSource extends object = Record<string, unknown>,
> {
    @ApiHideProperty()
    declare protected readonly __responseSource: TSource;

    /** Maps source values into the declared response DTO fields. */
    static from<TResponse extends ResponseDto<object>>(
        this: ResponseDtoConstructor<TResponse>,
        source: ResponseSource<TResponse>,
    ): TResponse {
        const response = Object.create(this.prototype) as TResponse;

        for (const field of getResponseFields(this.prototype)) {
            Reflect.set(
                response,
                field.key,
                field.transform
                    ? field.transform(source)
                    : Reflect.get(source, field.key),
            );
        }

        return response;
    }
}
