import https from 'node:https';
import { Readable } from 'node:stream';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { ToolLoopAgent, isStepCount, tool } from 'ai';
import { z } from 'zod';
import { modelConfigSchema, providerBaseUrl, type ModelConfig } from '../shared/models.js';
import { publicAddress } from './network.js';

/** Browser-supplied endpoints never bypass the public-network boundary or follow redirects with credentials. */
export const publicModelFetch: typeof fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443'))
    throw new Error('模型接口必须使用公开 HTTPS 地址。');
  const address = await publicAddress(url.hostname);
  const signal = init?.signal ?? undefined;
  if (init?.body && typeof init.body !== 'string') throw new Error('不支持此模型请求格式。');
  return await new Promise<Response>((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: init?.method || 'POST',
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
        family: address.family,
        lookup: (_host, _options, cb) => cb(null, address.address, address.family),
        rejectUnauthorized: true,
        signal,
        timeout: 60_000,
      },
      (res) => {
        if ((res.statusCode ?? 0) >= 300 && (res.statusCode ?? 0) < 400) {
          res.destroy();
          reject(new Error('模型接口发生重定向，已停止以避免转发密钥。请填写最终接口地址。'));
          return;
        }
        const headers = new Headers();
        for (const [key, value] of Object.entries(res.headers))
          if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
        // Request does not advertise compressed encoding; keep the SSE stream unbuffered.
        resolve(
          new Response(Readable.toWeb(res) as ReadableStream<Uint8Array>, {
            status: res.statusCode || 502,
            headers,
          }),
        );
      },
    );
    req.on('timeout', () => req.destroy(new Error('模型接口响应超时。')));
    req.on('error', reject);
    req.end(init?.body || undefined);
  });
};

export const serverModelConfigured = () => Boolean(process.env.AI_API_KEY && process.env.AI_MODEL);
export function languageModel(input?: ModelConfig, transport: typeof fetch = publicModelFetch) {
  if (!input) {
    if (!serverModelConfigured()) return null;
    // Environment configuration is controlled by the local server owner, including local protocol tests.
    return createOpenAI({
      apiKey: process.env.AI_API_KEY!,
      baseURL: process.env.AI_BASE_URL || 'https://api.openai.com/v1',
    }).chat(process.env.AI_MODEL!);
  }
  const config = modelConfigSchema.parse(input);
  const baseURL = providerBaseUrl(config);
  if (config.provider === 'openai')
    return createOpenAI({ apiKey: config.apiKey, baseURL, fetch: transport }).chat(config.model);
  return createOpenAICompatible({
    name: config.provider,
    apiKey: config.apiKey,
    baseURL,
    fetch: transport,
    // Compatible adapter preserves reasoning_content through tool cycles for Kimi / GLM / DeepSeek.
    transformRequestBody: (body) => ({
      ...body,
      ...(['kimi', 'deepseek', 'zhipu'].includes(config.provider)
        ? { reasoning_effort: 'low' }
        : {}),
    }),
  }).chatModel(config.model);
}

export function modelError(error: unknown, key?: string): string {
  const status =
    typeof error === 'object' && error !== null && 'statusCode' in error
      ? Number(error.statusCode)
      : 0;
  if (status === 401 || status === 403)
    return '模型认证失败：请检查所选服务商、API Key、区域接口与模型权限。';
  if (status === 429) return '模型服务限流或额度不足，请检查余额与配额后重试。';
  if (status === 404) return '模型或接口不存在，请核对模型标识与 Base URL。';
  // Never forward provider bodies, URLs, or echoed keys to the client.
  if (
    error instanceof Error &&
    /non-public|非公开|内网|保留域名|HTTPS|重定向|超时/.test(error.message)
  )
    return key ? error.message.replaceAll(key, '[已隐藏]') : error.message;
  return '模型请求失败，请检查 Key、模型名、工具调用权限和接口配置。';
}

export async function testModel(config: ModelConfig, signal: AbortSignal) {
  const model = languageModel(config)!;
  let called = false;
  const agent = new ToolLoopAgent({
    model,
    stopWhen: isStepCount(1),
    maxOutputTokens: 4096,
    maxRetries: 0,
    toolChoice: 'required',
    instructions: 'Call connectionCheck exactly once. Do not output explanations.',
    tools: {
      connectionCheck: tool({
        description: 'Verify tool calling.',
        inputSchema: z.object({}),
        execute: async () => {
          called = true;
          return { ok: true };
        },
      }),
    },
  });
  const result = await agent.stream({
    prompt: 'Call connectionCheck now.',
    abortSignal: signal,
    timeout: 45_000,
  });
  for await (const part of result.fullStream)
    if (part.type === 'error') throw new Error(modelError(part.error, config.apiKey));
  if (!called) throw new Error('接口已响应，但没有完成工具调用。请确认模型支持函数工具调用。');
  return { ok: true, message: '连接成功，流式响应与工具调用可用。', model: config.model };
}
