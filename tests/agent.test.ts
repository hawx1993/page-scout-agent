import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { StreamEvent } from '../shared/types.js';
import { chat } from '../server/agent.js';
import { getFieldData } from '../server/audit.js';
import { fixtureReport } from './fixtures.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe('honest fallback and real SDK tool loop', () => {
  it('labels no-key mode and returns extracted citations', async () => {
    vi.stubEnv('AI_API_KEY', '');
    vi.stubEnv('AI_MODEL', '');
    const events: StreamEvent[] = [];
    await chat(
      fixtureReport(),
      [{ id: 'u', role: 'user', content: '许可和定价是什么？' }],
      (e) => events.push(e),
      new AbortController().signal,
    );
    expect(events).toContainEqual({ type: 'mode', mode: 'evidence' });
    const text = events
      .filter((e) => e.type === 'text')
      .map((e) => e.text)
      .join('');
    expect(text).toContain('未调用大语言模型');
    expect(text).toContain('MIT');
    expect(text).toMatch(/\[E\d+\]/);
  });
  it('never substitutes lab values when CrUX is not configured', async () => {
    vi.stubEnv('CRUX_API_KEY', '');
    const result = await getFieldData(fixtureReport(), new AbortController().signal);
    expect(result.status).toBe('not-configured');
    expect(result.metrics).toBeUndefined();
    expect(result.message).toContain('INP');
  });
  it('labels origin fallback and applies p75 thresholds using the CrUX response', async () => {
    vi.stubEnv('CRUX_API_KEY', 'test-key');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 404 }))
      .mockResolvedValueOnce(
        Response.json({
          record: {
            collectionPeriod: {
              firstDate: { year: 2026, month: 10, day: 1 },
              lastDate: { year: 2026, month: 10, day: 28 },
            },
            metrics: {
              largest_contentful_paint: { percentiles: { p75: 2500 } },
              interaction_to_next_paint: { percentiles: { p75: 501 } },
              cumulative_layout_shift: { percentiles: { p75: '0.15' } },
            },
          },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const data = await getFieldData(fixtureReport(), new AbortController().signal);
    expect(data.scope).toBe('origin');
    expect(data.metrics?.map((m) => m.rating)).toEqual(['good', 'poor', 'needs-improvement']);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toHaveProperty(
      'origin',
      'https://example.com',
    );
  });
  it('feeds a tool result back to an OpenAI-compatible provider before the final answer', async () => {
    // Protocol fixture, not a real LLM: verifies actual AI SDK integration and the two-step tool loop.
    const requests: { messages: { role: string; content: unknown }[] }[] = [];
    const server = createServer(async (req, res) => {
      let body = '';
      for await (const chunk of req) body += chunk;
      const data = JSON.parse(body);
      requests.push(data);
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const delta =
        requests.length === 1
          ? {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_content',
                  type: 'function',
                  function: { name: 'readContent', arguments: '{"query":"许可"}' },
                },
              ],
            }
          : { content: '该组件库采用 MIT 许可证，支持商业使用。[E3]' };
      const base = {
        id: 'test-completion',
        object: 'chat.completion.chunk',
        created: 1,
        model: 'protocol-test',
      };
      res.write(
        `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`,
      );
      res.write(
        `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: requests.length === 1 ? 'tool_calls' : 'stop' }] })}\n\n`,
      );
      res.end('data: [DONE]\n\n');
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const port = (server.address() as AddressInfo).port;
    vi.stubEnv('AI_API_KEY', 'protocol-test-not-a-real-key');
    vi.stubEnv('AI_MODEL', 'protocol-test');
    vi.stubEnv('AI_BASE_URL', `http://127.0.0.1:${port}/v1`);
    try {
      const events: StreamEvent[] = [];
      await chat(
        fixtureReport(),
        [{ id: 'u', role: 'user', content: '许可是什么？' }],
        (e) => events.push(e),
        new AbortController().signal,
      );
      expect(requests).toHaveLength(2);
      expect(
        requests[1]?.messages.some((m) => m.role === 'tool' && String(m.content).includes('MIT')),
      ).toBe(true);
      expect(
        events.some((e) => e.type === 'tool' && e.name === 'readContent' && e.status === 'done'),
      ).toBe(true);
      expect(
        events
          .filter((e) => e.type === 'text')
          .map((e) => e.text)
          .join(''),
      ).toContain('MIT');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
