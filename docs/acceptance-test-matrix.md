# Phase 2 acceptance test matrix

Milestone 6 uses the existing unit, PostgreSQL integration, and application E2E suites as one acceptance set. The scenarios below point to the automated evidence rather than duplicating the same behavior in multiple files.

| Acceptance | Automated coverage |
| --- | --- |
| AT-001–AT-005 | `test/billing-acceptance.e2e-spec.ts`, subscription lifecycle tests |
| AT-006–AT-010 | `test/multi-instance-concurrency-recovery.e2e-spec.ts` |
| AT-011–AT-013 | `test/billing-failure-handling.e2e-spec.ts`, `test/subscription-billing-retry.e2e-spec.ts` |
| AT-014–AT-015 | `test/scheduler-batch-claiming.e2e-spec.ts` |
| AT-016–AT-018 | `src/modules/subscriptions/test/subscriptions.action.spec.ts` |
| AT-019–AT-020 | `test/catch-up-billing.e2e-spec.ts` |
| AT-021 | `src/common/test/clock.spec.ts` |
| AT-022 | `src/config/env.validation.spec.ts` |
| AT-023 | `test/scheduler-runs.e2e-spec.ts` |
| AT-024 | `test/billing-acceptance.e2e-spec.ts` and scheduler run-history tests |
| AT-025 | `test/health-metrics.e2e-spec.ts` |
