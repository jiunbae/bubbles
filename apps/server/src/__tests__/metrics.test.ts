import { describe, test, expect, beforeEach } from 'bun:test';

// Re-import fresh module state by importing the functions directly.
// Note: since the metrics module uses module-level Maps, we test against
// the singleton state. Tests run sequentially within a describe block.
import {
  incCounter,
  observeHistogram,
  setGauge,
  incGauge,
  decGauge,
  metricsRoute,
} from '../metrics';

// Helper to get serialized metrics text from the route handler
async function getMetricsText(): Promise<string> {
  const req = new Request('http://localhost/');
  const res = await metricsRoute.fetch(req);
  return res.text();
}

describe('metrics', () => {
  test('incCounter increments and appears in output', async () => {
    incCounter('test_counter_a', { method: 'GET' });
    incCounter('test_counter_a', { method: 'GET' });
    incCounter('test_counter_a', { method: 'POST' });

    const text = await getMetricsText();
    expect(text).toContain('# TYPE test_counter_a counter');
    expect(text).toContain('test_counter_a{method="GET"} 2');
    expect(text).toContain('test_counter_a{method="POST"} 1');
  });

  test('incCounter with custom value', async () => {
    incCounter('test_counter_b', {}, 5);
    incCounter('test_counter_b', {}, 3);

    const text = await getMetricsText();
    expect(text).toContain('test_counter_b 8');
  });

  test('observeHistogram records buckets, sum, and count', async () => {
    observeHistogram('test_hist', { route: '/' }, 0.05);
    observeHistogram('test_hist', { route: '/' }, 0.5);
    observeHistogram('test_hist', { route: '/' }, 2.0);

    const text = await getMetricsText();
    expect(text).toContain('# TYPE test_hist histogram');
    expect(text).toContain('test_hist_bucket{route="/",le="0.005"} 0');
    expect(text).toContain('test_hist_bucket{route="/",le="+Inf"} 3');
    expect(text).toContain('test_hist_sum{route="/"} 2.55');
    expect(text).toContain('test_hist_count{route="/"} 3');
  });

  test('setGauge sets value', async () => {
    setGauge('test_gauge_set', {}, 42);

    const text = await getMetricsText();
    expect(text).toContain('# TYPE test_gauge_set gauge');
    expect(text).toContain('test_gauge_set 42');
  });

  test('incGauge and decGauge adjust value', async () => {
    setGauge('test_gauge_adj', {}, 10);
    incGauge('test_gauge_adj', {}, 5);
    decGauge('test_gauge_adj', {}, 3);

    const text = await getMetricsText();
    expect(text).toContain('test_gauge_adj 12');
  });

  test('serialize outputs # HELP lines for known metrics', async () => {
    // Trigger a known metric so it appears in output
    incCounter('http_requests_total', { method: 'GET', path: '/test', status: '200' });

    const text = await getMetricsText();
    expect(text).toContain('# HELP http_requests_total Total number of HTTP requests.');
    expect(text).toContain('# TYPE http_requests_total counter');
  });

  test('serialize output ends with newline', async () => {
    const text = await getMetricsText();
    expect(text.endsWith('\n')).toBe(true);
  });
});
