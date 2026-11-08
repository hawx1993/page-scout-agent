import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzeAndAudit } from '../src/lib';
import { fixtureReport } from './fixtures';
import type { StreamEvent } from '../shared/types';
afterEach(() => vi.unstubAllGlobals());
describe('URL analysis and scoring workflow', () => {
  it('automatically requests scores for the selected device after extraction', async () => {
    const report = fixtureReport();
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, init) => {
        calls.push({ url, body: JSON.parse(init.body) });
        return new Response(JSON.stringify({ type: 'report', report }) + '\n{"type":"done"}\n');
      }),
    );
    const events: StreamEvent[] = [];
    await analyzeAndAudit('https://example.com', 'desktop', new AbortController().signal, (e) =>
      events.push(e),
    );
    expect(calls.map((c) => c.url)).toEqual(['/api/analyze', '/api/audit']);
    expect(calls[1].body).toEqual({ reportId: report.id, device: 'desktop', kind: 'lighthouse' });
    expect(events.some((e) => e.type === 'progress' && e.message.includes('Lighthouse'))).toBe(
      true,
    );
  });
  it('surfaces a scoring failure after preserving the extracted page', async () => {
    const report = fixtureReport();
    const events: StreamEvent[] = [];
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ type: 'report', report }) + '\n{"type":"done"}\n'),
        )
        .mockResolvedValueOnce(new Response('{"type":"error","message":"Chrome 启动失败"}\n')),
    );
    await expect(
      analyzeAndAudit(report.url, 'mobile', new AbortController().signal, (e) => events.push(e)),
    ).rejects.toThrow('Chrome 启动失败');
    expect(events.some((e) => e.type === 'report')).toBe(true);
  });
  it('does not start scoring after cancellation', async () => {
    const controller = new AbortController();
    const report = fixtureReport();
    const fetchMock = vi.fn(async () => {
      controller.abort();
      return new Response(JSON.stringify({ type: 'report', report }) + '\n{"type":"done"}\n');
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      analyzeAndAudit(report.url, 'mobile', controller.signal, () => {}),
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
