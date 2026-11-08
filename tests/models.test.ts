import { afterEach, describe, expect, it, vi } from 'vitest';
import { modelConfigSchema, providerBaseUrl } from '../shared/models';
import {
  loadModelSettings,
  newProfile,
  saveModelSettings,
  type ModelSettings,
} from '../src/model-settings';
import { ToolLoopAgent, isStepCount, tool } from 'ai';
import { z } from 'zod';
import { languageModel, modelError, publicModelFetch } from '../server/models';
import { chat } from '../server/agent';
import type { StreamEvent } from '../shared/types';

afterEach(() => vi.unstubAllEnvs());
describe('model settings and key boundaries', () => {
  function storage() {
    let value: string | null = null;
    return {
      getItem: () => value,
      setItem: (_key: string, next: string) => {
        value = next;
      },
    };
  }
  it('remembers independent provider keys and selected model across reload', () => {
    const store = storage();
    const settings: ModelSettings = {
      active: 'deepseek',
      profiles: {
        deepseek: { ...newProfile('deepseek'), apiKey: 'key-deepseek' },
        kimi: { ...newProfile('kimi'), apiKey: 'key-kimi' },
      },
    };
    saveModelSettings(settings, store);
    const restored = loadModelSettings(store);
    expect(restored.active).toBe('deepseek');
    expect(restored.profiles.deepseek?.apiKey).toBe('key-deepseek');
    expect(restored.profiles.kimi?.apiKey).toBe('key-kimi');
  });
  it('never persists a session-only key while preserving selected model metadata', () => {
    const store = storage();
    const profile = { ...newProfile('deepseek'), apiKey: 'session-secret', rememberKey: false };
    saveModelSettings({ active: 'deepseek', profiles: { deepseek: profile } }, store);
    expect(store.getItem()).not.toContain('session-secret');
    expect(loadModelSettings(store).profiles.deepseek?.model).toBe('deepseek-v4-flash');
    expect(profile.apiKey).toBe('session-secret');
  });
  it('removing a key removes it from durable storage', () => {
    const store = storage();
    saveModelSettings(
      { active: 'kimi', profiles: { kimi: { ...newProfile('kimi'), apiKey: 'secret' } } },
      store,
    );
    saveModelSettings({ active: 'kimi', profiles: { kimi: newProfile('kimi') } }, store);
    expect(store.getItem()).not.toContain('secret');
  });
  it('ignores a browser override for a preset endpoint', () => {
    expect(
      providerBaseUrl({
        ...newProfile('deepseek'),
        apiKey: 'test',
        baseUrl: 'https://attacker.example',
      }),
    ).toBe('https://api.deepseek.com');
  });
  it.each([
    'http://example.com',
    'https://user:pass@example.com',
    'https://example.com?key=test',
    'https://example.com:8443',
  ])('rejects unsafe custom endpoint %s', (baseUrl) => {
    expect(() =>
      providerBaseUrl({ ...newProfile('custom'), model: 'test', apiKey: 'test', baseUrl }),
    ).toThrow();
  });
  it('blocks private model endpoints before transmitting a key', async () => {
    await expect(
      publicModelFetch('https://127.0.0.1/v1/chat/completions', {
        headers: { Authorization: 'Bearer secret' },
      }),
    ).rejects.toThrow('非公开');
  });
  it('does not expose provider-echoed keys through error messages', () => {
    expect(modelError(new Error('raw provider secret-key'), 'secret-key')).not.toContain(
      'secret-key',
    );
  });
  it('rejects malformed API keys', () => {
    expect(
      modelConfigSchema.safeParse({ ...newProfile('kimi'), apiKey: 'secret\r\ninjected' }).success,
    ).toBe(false);
  });
  it('permits direct chat without a report and explains missing configuration', async () => {
    vi.stubEnv('AI_API_KEY', '');
    vi.stubEnv('AI_MODEL', '');
    const events: StreamEvent[] = [];
    await chat(
      null,
      [{ id: 'user', role: 'user', content: '你好' }],
      (e) => events.push(e),
      new AbortController().signal,
    );
    expect(events.some((e) => e.type === 'text' && e.text.includes('模型设置'))).toBe(true);
  });
});

describe('compatible reasoning tool loops', () => {
  it.each(['deepseek', 'kimi', 'zhipu'] as const)(
    'preserves reasoning_content through %s tool calls',
    async (provider) => {
      const requests: Record<string, unknown>[] = [];
      const transport: typeof fetch = async (_input, init) => {
        const body = JSON.parse(String(init?.body));
        requests.push(body);
        const first = requests.length === 1;
        const chunks = first
          ? [
              { reasoning_content: 'test reasoning metadata' },
              {
                tool_calls: [
                  {
                    index: 0,
                    id: 'tool_1',
                    type: 'function',
                    function: { name: 'verify', arguments: '{}' },
                  },
                ],
              },
            ]
          : [{ content: 'verified' }];
        const packet = (delta: unknown, finish_reason: string | null = null) =>
          'data: ' +
          JSON.stringify({
            id: 'response',
            object: 'chat.completion.chunk',
            created: 1,
            model: body.model,
            choices: [{ index: 0, delta, finish_reason }],
          }) +
          '\n\n';
        return new Response(
          chunks.map((delta) => packet(delta)).join('') +
            packet({}, first ? 'tool_calls' : 'stop') +
            'data: [DONE]\n\n',
          { headers: { 'content-type': 'text/event-stream' } },
        );
      };
      const model = languageModel({ ...newProfile(provider), apiKey: 'test-only' }, transport)!;
      const agent = new ToolLoopAgent({
        model,
        stopWhen: isStepCount(3),
        tools: {
          verify: tool({ inputSchema: z.object({}), execute: async () => ({ verified: true }) }),
        },
      });
      const result = await agent.stream({ prompt: 'verify' });
      let output = '';
      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') output += part.text;
        if (part.type === 'error') throw part.error;
      }
      expect(output).toBe('verified');
      expect(requests).toHaveLength(2);
      const messages = requests[1].messages as { role: string; reasoning_content?: string }[];
      expect(messages.find((m) => m.role === 'assistant')?.reasoning_content).toBe(
        'test reasoning metadata',
      );
      expect(requests[0].reasoning_effort).toBe('low');
    },
  );
});
