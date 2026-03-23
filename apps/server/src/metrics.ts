/**
 * Lightweight Prometheus metrics for Bun runtime.
 * Exposes counters, histograms, and gauges in Prometheus text format.
 */

import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';

// --- Storage ---

const counters = new Map<string, Map<string, number>>();
const histogramBuckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const histograms = new Map<string, Map<string, { buckets: number[]; sum: number; count: number }>>();
const gauges = new Map<string, Map<string, number>>();

// --- Helpers ---

function labelsToKey(labels: Record<string, string>): string {
  const entries = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return '';
  return entries.map(([k, v]) => `${k}="${v}"`).join(',');
}

// --- Public API ---

export function incCounter(name: string, labels: Record<string, string> = {}, value = 1) {
  if (!counters.has(name)) counters.set(name, new Map());
  const key = labelsToKey(labels);
  const map = counters.get(name)!;
  map.set(key, (map.get(key) ?? 0) + value);
}

export function observeHistogram(name: string, labels: Record<string, string>, value: number) {
  if (!histograms.has(name)) histograms.set(name, new Map());
  const key = labelsToKey(labels);
  const map = histograms.get(name)!;
  if (!map.has(key)) {
    map.set(key, { buckets: new Array(histogramBuckets.length).fill(0), sum: 0, count: 0 });
  }
  const entry = map.get(key)!;
  entry.sum += value;
  entry.count += 1;
  for (let i = 0; i < histogramBuckets.length; i++) {
    if (value <= histogramBuckets[i]) entry.buckets[i]++;
  }
}

export function setGauge(name: string, labels: Record<string, string> = {}, value: number) {
  if (!gauges.has(name)) gauges.set(name, new Map());
  const key = labelsToKey(labels);
  gauges.get(name)!.set(key, value);
}

export function incGauge(name: string, labels: Record<string, string> = {}, value = 1) {
  if (!gauges.has(name)) gauges.set(name, new Map());
  const key = labelsToKey(labels);
  const map = gauges.get(name)!;
  map.set(key, (map.get(key) ?? 0) + value);
}

export function decGauge(name: string, labels: Record<string, string> = {}, value = 1) {
  incGauge(name, labels, -value);
}

// --- Serialize to Prometheus text format ---

function serialize(): string {
  const lines: string[] = [];

  for (const [name, map] of counters) {
    lines.push(`# TYPE ${name} counter`);
    for (const [key, val] of map) {
      lines.push(key ? `${name}{${key}} ${val}` : `${name} ${val}`);
    }
  }

  for (const [name, map] of gauges) {
    lines.push(`# TYPE ${name} gauge`);
    for (const [key, val] of map) {
      lines.push(key ? `${name}{${key}} ${val}` : `${name} ${val}`);
    }
  }

  for (const [name, map] of histograms) {
    lines.push(`# TYPE ${name} histogram`);
    for (const [key, entry] of map) {
      const labelPrefix = key ? `${key},` : '';
      for (let i = 0; i < histogramBuckets.length; i++) {
        const cumulative = entry.buckets.slice(0, i + 1).reduce((a, b) => a + b, 0);
        lines.push(`${name}_bucket{${labelPrefix}le="${histogramBuckets[i]}"} ${cumulative}`);
      }
      lines.push(`${name}_bucket{${labelPrefix}le="+Inf"} ${entry.count}`);
      lines.push(`${name}_sum{${key}} ${entry.sum}`);
      lines.push(`${name}_count{${key}} ${entry.count}`);
    }
  }

  return lines.join('\n') + '\n';
}

// --- HTTP Middleware ---

export const metricsMiddleware: MiddlewareHandler = async (c, next) => {
  const start = performance.now();
  await next();
  const duration = (performance.now() - start) / 1000; // seconds

  const method = c.req.method;
  const path = c.req.routePath || c.req.path;
  const status = String(c.res.status);

  incCounter('http_requests_total', { method, path, status });
  observeHistogram('http_request_duration_seconds', { method, path }, duration);
};

// --- Metrics Route ---

const metricsRoute = new Hono();

metricsRoute.get('/', (c) => {
  return c.text(serialize(), 200, {
    'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
  });
});

export { metricsRoute };
