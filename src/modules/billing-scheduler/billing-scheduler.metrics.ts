import { Injectable } from '@nestjs/common';
import { $subscription } from '../subscriptions/subscriptions.constant';
import { $billingScheduler } from './billing-scheduler.constant';
import type {
    BillingDueCount,
    SchedulerRunRecord,
} from './billing-scheduler.types';

const HISTOGRAM_BUCKETS = [
    0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60,
] as const;

type Labels = Readonly<Record<string, string>>;
type HistogramState = {
    count: number;
    sum: number;
    buckets: number[];
};

/** Tracks the bounded billing metrics required by the PRD. */
@Injectable()
export class BillingSchedulerMetrics {
    private readonly counters = new Map<string, Map<string, number>>();
    private readonly gauges = new Map<string, Map<string, number>>();
    private readonly histograms = new Map<
        string,
        Map<string, HistogramState>
    >();

    constructor() {
        this.recordDueCounts([]);
    }

    /** Records one terminal scheduler attempt and its elapsed duration. */
    recordRun(run: SchedulerRunRecord, durationMs: number): void {
        this.increment(
            $billingScheduler.metric.runTotal.NAME,
            {
                trigger_type: run.trigger_type,
                status: run.status,
            },
            1,
        );
        this.observe(
            $billingScheduler.metric.runDurationSeconds.NAME,
            { status: run.status },
            durationMs / 1000,
        );
    }

    /** Records one processed subscription outcome and item latency. */
    recordItem(result: string, errorCode: string, durationMs: number): void {
        this.increment(
            $billingScheduler.metric.subscriptionProcessedTotal.NAME,
            { result, error_code: errorCode },
            1,
        );
        this.observe(
            $billingScheduler.metric.itemDurationSeconds.NAME,
            { result },
            durationMs / 1000,
        );
    }

    /** Records created invoices grouped only by bounded currency labels. */
    recordInvoices(currencies: readonly string[]): void {
        for (const currency of currencies) {
            this.increment(
                $billingScheduler.metric.invoiceCreatedTotal.NAME,
                { currency },
                1,
            );
        }
    }

    /** Replaces due-subscription gauges from the latest database snapshot. */
    recordDueCounts(counts: readonly BillingDueCount[]): void {
        const metric = $billingScheduler.metric.dueSubscriptionCount.NAME;
        const values = new Map<string, number>([
            [
                labelsKey({
                    billing_state: $subscription.billingState.READY,
                }),
                0,
            ],
            [
                labelsKey({
                    billing_state: $subscription.billingState.RETRY_WAIT,
                }),
                0,
            ],
        ]);

        for (const count of counts) {
            values.set(
                labelsKey({ billing_state: count.billingState }),
                count.count,
            );
        }

        this.gauges.set(metric, values);
    }

    /** Adds reclaimed expired claims to the monotonic recovery counter. */
    recordExpiredClaims(count: number): void {
        if (count <= 0) return;
        this.increment(
            $billingScheduler.metric.claimExpiredTotal.NAME,
            {},
            count,
        );
    }

    /** Records a failed coordinator lease acquisition for the stable job name. */
    recordLeaseContention(jobName: string): void {
        this.increment(
            $billingScheduler.metric.leaseContentionTotal.NAME,
            { job_name: jobName },
            1,
        );
    }

    /** Records how many whole business days a claimed subscription is overdue. */
    recordScheduleLag(cutoffDate: string, billingDate: string): void {
        const lagDays = Math.max(
            0,
            Math.floor(
                (Date.parse(`${cutoffDate}T00:00:00.000Z`) -
                    Date.parse(`${billingDate}T00:00:00.000Z`)) /
                    86_400_000,
            ),
        );
        this.observe(
            $billingScheduler.metric.scheduleLagDays.NAME,
            {},
            lagDays,
        );
    }

    /** Renders the current metrics in Prometheus text exposition format. */
    render(): string {
        const lines: string[] = [];

        for (const descriptor of Object.values($billingScheduler.metric)) {
            lines.push(`# HELP ${descriptor.NAME} ${descriptor.HELP}`);
            lines.push(`# TYPE ${descriptor.NAME} ${descriptor.TYPE}`);

            if (descriptor.TYPE === 'counter') {
                this.renderScalar(
                    lines,
                    descriptor.NAME,
                    this.counters.get(descriptor.NAME),
                );
            } else if (descriptor.TYPE === 'gauge') {
                this.renderScalar(
                    lines,
                    descriptor.NAME,
                    this.gauges.get(descriptor.NAME),
                );
            } else {
                this.renderHistogram(
                    lines,
                    descriptor.NAME,
                    this.histograms.get(descriptor.NAME),
                );
            }
        }

        return `${lines.join('\n')}\n`;
    }

    /** Increments one counter series identified by its bounded label set. */
    private increment(name: string, labels: Labels, amount: number): void {
        const series = this.counters.get(name) ?? new Map<string, number>();
        const key = labelsKey(labels);
        series.set(key, (series.get(key) ?? 0) + amount);
        this.counters.set(name, series);
    }

    /** Observes one value in a histogram series. */
    private observe(name: string, labels: Labels, value: number): void {
        const series =
            this.histograms.get(name) ?? new Map<string, HistogramState>();
        const key = labelsKey(labels);
        const state = series.get(key) ?? {
            count: 0,
            sum: 0,
            buckets: HISTOGRAM_BUCKETS.map(() => 0),
        };

        state.count += 1;
        state.sum += value;
        HISTOGRAM_BUCKETS.forEach((bucket, index) => {
            if (value <= bucket) state.buckets[index] += 1;
        });
        series.set(key, state);
        this.histograms.set(name, series);
    }

    /** Renders counter or gauge series with deterministic label ordering. */
    private renderScalar(
        lines: string[],
        name: string,
        series: Map<string, number> | undefined,
    ): void {
        if (!series || series.size === 0) return;

        for (const [key, value] of [...series.entries()].sort()) {
            lines.push(`${name}${renderLabels(key)} ${value}`);
        }
    }

    /** Renders histogram buckets, sum, and count for each bounded series. */
    private renderHistogram(
        lines: string[],
        name: string,
        series: Map<string, HistogramState> | undefined,
    ): void {
        if (!series || series.size === 0) return;

        for (const [key, state] of [...series.entries()].sort()) {
            HISTOGRAM_BUCKETS.forEach((bucket, index) => {
                lines.push(
                    `${name}_bucket${renderLabels(key, { le: String(bucket) })} ${state.buckets[index]}`,
                );
            });
            lines.push(
                `${name}_bucket${renderLabels(key, { le: '+Inf' })} ${state.count}`,
            );
            lines.push(`${name}_sum${renderLabels(key)} ${state.sum}`);
            lines.push(`${name}_count${renderLabels(key)} ${state.count}`);
        }
    }
}

/** Serializes labels into a stable internal key. */
function labelsKey(labels: Labels): string {
    return Object.entries(labels)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => `${key}=${escapeLabel(value)}`)
        .join(',');
}

/** Renders a stable internal label key as Prometheus labels. */
function renderLabels(
    key: string,
    extra: Readonly<Record<string, string>> = {},
): string {
    const labels = new Map<string, string>();

    if (key) {
        for (const entry of key.split(',')) {
            const separator = entry.indexOf('=');
            labels.set(entry.slice(0, separator), entry.slice(separator + 1));
        }
    }
    for (const [label, value] of Object.entries(extra)) {
        labels.set(label, escapeLabel(value));
    }

    if (labels.size === 0) return '';
    const content = [...labels.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([label, value]) => `${label}="${value}"`)
        .join(',');
    return `{${content}}`;
}

/** Escapes a Prometheus label value without exposing raw control characters. */
function escapeLabel(value: string): string {
    return value
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n');
}
