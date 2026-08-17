# Subscription Billing Scheduler

Foundation-only NestJS service for the Phase 2 Subscription Billing Scheduler project. Billing/subscription/invoice features are intentionally not implemented yet.

Agent context and repository conventions: `agent.md`.

## Included foundation

- NestJS 11 application bootstrap
- validated environment configuration
- Swagger UI / OpenAPI generation with the Nest compiler plugin
- PostgreSQL connection pool through Kysely
- Kysely migration CLI wiring
- Nest scheduler module wiring (no cron job yet)
- liveness and database readiness endpoints
- global DTO validation defaults
- injectable clock for deterministic billing tests
- request correlation header (`x-request-id`) and async correlation context
- structured HTTP completion/failure logs with request ID, instance ID, status, and duration
- global success response envelope with `@SkipEnvelope()` opt-out
- standard safe error envelope with correlation ID and UTC timestamp
- Helmet security headers
- graceful database shutdown
- Docker Compose PostgreSQL

## Local setup

```bash
cp .env.example .env
docker compose up -d postgres
pnpm install # refreshes the lockfile after the foundation dependencies added here
pnpm db:migrate
pnpm start:dev
```

Open:

- API docs: `http://localhost:5000/docs`
- liveness: `http://localhost:5000/health/live`
- readiness: `http://localhost:5000/health/ready`

## Application configuration

Inject `AppConfigService` and use typed dot notation instead of reading `process.env` or calling Nest `ConfigService` throughout the application:

```ts
constructor(private readonly config: AppConfigService) {}

this.config.app.port
this.config.database.url
this.config.swagger.enabled
this.config.billing.timezone
```

`env.validation.ts` remains the trust boundary that validates and normalizes raw environment variables at startup.

## Quality checks

```bash
pnpm check
```

## Database migrations

Create a migration only when a feature introduces schema:

```bash
pnpm db:migration:create <migration-name>
pnpm db:migrate
```

Rollback all applied migrations in local development:

```bash
pnpm db:rollback
```

Migration files belong in `src/database/migrations` and should use Kysely schema APIs.

## Scope boundary

This baseline deliberately contains no subscription, invoice, lease, claiming, retry, or billing-run business logic. Those belong to later feature milestones.
