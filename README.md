# Subscription Billing Scheduler

NestJS service for the Phase 2 Subscription Billing Scheduler project. Milestone 2 now includes the subscription domain; invoice transactions and scheduler execution remain later milestones.

Agent context and repository conventions: `agent.md`.

## Included foundation and subscription domain

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
- subscription creation, retrieval, listing, controlled update, pause, resume, and cancellation
- operator-authorized billing retry and explicit unblock recovery
- deterministic monthly recurrence calculation with preserved billing anchors

## Endpoint flowcharts

- Subscription module: `src/modules/subscriptions/flowchart.md`
- Health module: `src/health/flowchart.md`

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
this.config.operator.id
this.config.operator.token
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

Milestone 2 owns subscription-domain behavior and recurrence rules. Invoice creation, scheduler leases, claiming, batching, automatic failure classification, catch-up execution, and billing-run history remain later milestones.
