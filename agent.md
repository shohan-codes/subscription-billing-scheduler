## General convention

### JSDoc : keep comments concise and purpose-focused

- `Usage`: Add JSDoc to major or non-trivial classes, functions, methods, and lifecycle boundaries; skip simple self-explanatory code.
- `Purpose`: Keep JSDoc focused only on the purpose of the class, function, or method.
- `Single line`: Use single-line JSDoc when the description fits on one line, for example `/** Finds a subscription by ID or throws when missing. */`. (Most Case)
- `Multiline`: Use multiline JSDoc only when multiple meaningful lines are actually required.
- `Content`: Do not put architectural rules, generic explanations, or obvious implementation details in source-code comments.
- `Controllers`: Do not use JSDoc for controller endpoint descriptions; document controller methods with OpenAPI decorators.

### Method layout : keep methods easy to scan

- `Spacing`: Separate one method from the next with extra blank lines.
- `Ordering`: Keep paired methods adjacent and order them as `<X>OrThrow` first, then `<X>`.

## Configuration convention

### AppConfigService : centralize typed application configuration

- `Access`: Access application configuration through `AppConfigService` with dot notation, such as `config.app.port`, `config.database.url`, and `config.billing.timezone`.
- `Environment`: Do not use `process.env` directly in application code.
- `ConfigService`: Do not inject NestJS `ConfigService` directly outside the configuration layer.
- `Validation`: Add or validate environment variables in `src/config/env.validation.ts`.
- `Mapping`: Map validated variables under the appropriate group in `src/config/app-config.service.ts`.

## Module convention

### Module structure : keep each feature flat and predictable

```text
src/modules/<feature>/
├── <feature>.module.ts
├── <feature>.controller.ts
├── <feature>.service.ts
├── <feature>.action.ts
├── <feature>.repository.ts
├── <feature>.dto.ts
├── <feature>.constant.ts   # only if needed
├── <feature>.types.ts      # only if needed
├── <feature>.errors.ts
└── test/
    └── *.spec.ts
```

### <feature>.module.ts : module definition

### <feature>.controller.ts : HTTP API endpoints

- `Input`: Controller method arguments must use Request DTOs.
- `Output`: Controller method outputs must use Response DTOs.
- `OpenAPI`: Use `@ApiRoute` for endpoint OpenAPI documentation instead of direct `@nestjs/swagger` controller decorators.
- `Configuration`: Configure endpoint-specific status, response type, auth, not-found, conflict, array, or envelope behavior through `@ApiRoute`.
- `Swagger decorators`: Do not use `@ApiOperation`, `@ApiResponse`, `@ApiBearerAuth`, or similar Swagger decorators directly in controllers.

### <feature>.service.ts : orchestrate the feature flow

- `Response`: Service methods must return the endpoint's predefined Response DTO.
- `Transformation`: When transformation is required, use the Response DTO's static `from` method in the service.
- `Business logic`: Delegate business logic to `<feature>.action.ts`.
- `Database access`: Delegate database queries and persistence operations to `<feature>.repository.ts`.

* `Flow`: Maintain the logical flow of the method by calling repositories for data access and actions for business decisions in the required order.

- `No business logic`: Do not implement business logic directly in the service.
- `No database logic`: Do not implement database query logic directly in the service.
- `Responsibility`: Service methods should primarily coordinate calls and return their results.

### <feature>.action.ts : business logic only

- `Responsibility`: Keep business rules, validations, state transitions, and business decisions here.

* `Database access`: Do not access repositories or perform database operations; receive the required data from the service.

- `Exceptions`: Intentional exceptions may be thrown only from methods ending with `OrThrow`.
- `Ordering`: Keep `<X>OrThrow` and `<X>` methods adjacent when both variants exist, with `<X>OrThrow` first.

### <feature>.repository.ts : database queries only

- `Responsibility`: Keep database queries, persistence operations, locking, and database-specific behavior here.
- `Business logic`: Do not implement business rules or business-flow orchestration in the repository.
- `Exceptions`: Intentional exceptions may be thrown only from methods ending with `OrThrow`.
- `Ordering`: Keep `<X>OrThrow` and `<X>` methods adjacent when both variants exist, with `<X>OrThrow` first.

### <feature>.dto.ts : keep API contracts and response mapping together

- `Location`: Keep all request and response DTOs for a feature in this single file.
- `Naming`: Name DTO classes with the `Request` or `Response` suffix.
- `Validation`: Use `class-validator` only on Request DTO fields and add only meaningful validation constraints.
- `Request OpenAPI`: Use `@ApiProperty` or `@ApiPropertyOptional` on every Request DTO field with a realistic `example`.
- `Response OpenAPI`: Extend `ResponseDto<Source>` and use `@ApiResponseField` on every Response DTO field with a realistic `example`.
- `OpenAPI metadata`: Add explicit metadata such as `nullable`, `format`, `enumName`, unions, generics, or complex schemas when TypeScript cannot describe the OpenAPI contract completely.
- `OpenAPI inference`: Do not repeat inferable metadata such as primitive `type` unless required.
- `Grouping`: Keep Request and Response DTOs for the same endpoint adjacent, with Request first and Response immediately after it.
- `Shared zone`: Keep reusable response shapes at the top of the file and extend or redeclare them for endpoint-specific responses with the same shape.
- `Separator`: Separate endpoint DTO groups with a descriptive `// ---------- <Endpoint Name> ----------` comment.
- `Response mapping`: Let `ResponseDto.from()` map declared response fields automatically from the source object.
- `Transform`: Use `ApiResponseField`'s `transform` only when a response field cannot use the same-named source value directly.
- `Mapping boundary`: Keep response transforms pure; do not perform business logic, database access, exception handling, or flow orchestration.

### <feature>.errors.ts : keep feature exceptions together

- `Location`: Keep a feature's NestJS exceptions in this single file.
- `Files`: Do not create a separate file for every small exception.
- `Naming`: Use the `Exception` suffix for classes extending NestJS HTTP exceptions, for example `SubscriptionNotFoundException`.

### <feature>.constant.ts : keep feature constants together

- `Ownership`: Keep constants owned only by the feature in `<feature>.constant.ts`.
- `Creation`: Create this file only when the feature actually has constants.
- `Location`: Do not keep feature-specific constants in generic common or shared files.
- `Exports`: Export only constants that are used outside this file.
- `Configuration`: Keep configuration values in the configuration layer, not in `<feature>.constant.ts`.

### <feature>.types.ts : keep feature-internal types together

- `Scope`: Keep shared feature-internal types and interfaces in `<feature>.types.ts`.
- `API contracts`: Keep Request and Response types in `<feature>.dto.ts`, not here.
- `Creation`: Create this file only when the feature actually needs shared internal types.

### <feature>/test : keep feature tests grouped outside source files

- `Location`: Keep feature test files in `<feature>/test/`; do not colocate `*.spec.ts` beside implementation files.
- `Naming`: Name test files after the implementation file, such as `<feature>.service.spec.ts`.
- `Scope`: Keep only tests owned by the feature here; cross-feature or end-to-end tests belong in the project-level `test/` directory.
