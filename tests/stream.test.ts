import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestStream } from '../src/lib.js';
import type { StreamEvent } from '../shared/types.js';

afterEach(() => vi.unstubAllGlobals());
describe('stream transport boundaries', () => {
  it('handles split NDJSON frames and split UTF-8 characters', async () => {
    const data = new TextEncoder().encode('{"type":"text","text":"网页证据"}\n{"type":"done"}\n');
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < data.length; i += 2) controller.enqueue(data.slice(i, i + 2));
        controller.close();
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream)));
    const events: StreamEvent[] = [];
    await requestStream('/api/chat', {}, new AbortController().signal, (e) => events.push(e));
    expect(events).toEqual([{ type: 'text', text: '网页证据' }, { type: 'done' }]);
  });
  it('does not mark a truncated response as successful', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{"type":"text","text":"partial"}\n')),
    );
    await expect(
      requestStream('/api/chat', {}, new AbortController().signal, () => {}),
    ).rejects.toThrow('连接提前结束');
  });
  it('surfaces tool/request errors rather than swallowing them', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{"type":"error","message":"检测失败"}\n')),
    );
    await expect(
      requestStream('/api/audit', {}, new AbortController().signal, () => {}),
    ).rejects.toThrow('检测失败');
  });
});
