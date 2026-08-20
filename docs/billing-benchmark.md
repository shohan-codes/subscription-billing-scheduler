# Billing load benchmark

Milestone 6 includes a repeatable benchmark that seeds at least 10,000 due subscriptions in bounded chunks, runs the scheduler once with one Nest application instance and once with two instances sharing the same PostgreSQL database, and reports correctness and performance evidence.

Run it against the migrated local PostgreSQL database:

```bash
pn benchmark:billing -- --report=docs/billing-benchmark-results.md
```

`--subscriptions=<count>` may increase the workload but cannot be set below `10000`. Add `--keep-data` only when the persisted benchmark rows need to be inspected after the run.

The generated report contains run duration, invoice throughput, configured batch size and local concurrency, PostgreSQL activity deltas, hardware limits, run-counter reconciliation, duplicate-period verification, remaining due work, and unexpired orphan-claim verification. The two-instance phase uses two independently configured Nest application contexts against the same database so the database lease is exercised rather than an in-memory lock.

The benchmark runner does not collect credentials, connection strings, SQL text, customer-level labels, run IDs, or subscription IDs in the report. Do not commit a benchmark result until the command has actually been executed on the environment being documented.
