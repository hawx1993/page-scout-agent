import { z } from 'zod';

export const providers = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    models: ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-flash'],
    docs: 'https://api-docs.deepseek.com/quick_start/pricing-details-cny/',
    note: 'V4 Flash 旧名称仍可调用，官方可能映射到更新的 Flash 版本；以服务端实际返回为准。',
  },
  {
    id: 'kimi',
    name: 'Kimi / Moonshot',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['kimi-k3.1-pro', 'kimi-k3.1-pro-highspeed', 'kimi-k3', 'kimi-k2.6'],
    docs: 'https://platform.kimi.com/docs/models',
    note: 'K2.6 的可用性取决于账号权限。国际区 Key 请使用自定义接口配置 api.moonshot.ai/v1。',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-6.1-sol', 'gpt-6-sol', 'gpt-6-astra'],
    docs: 'https://developers.openai.com/api/docs/models/all',
    note: '使用 Chat Completions；可填写账号实际有权限的文本模型标识。',
  },
  {
    id: 'zhipu',
    name: '智普 / GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-5.3', 'glm-5.3-flash', 'glm-4.7', 'glm-4.7-flash'],
    docs: 'https://docs.bigmodel.cn/cn/guide/start/model-overview',
    note: '普通 API Key 使用此接口。Coding Plan 或其他区域接口请使用自定义配置。',
  },
  {
    id: 'custom',
    name: '自定义兼容接口',
    baseUrl: '',
    models: [],
    docs: '',
    note: '支持 OpenAI Chat Completions 格式、SSE 流与函数工具调用的公开 HTTPS 接口。Base URL 不包含 /chat/completions。',
  },
] as const;

export const modelConfigSchema = z.object({
  provider: z.enum(['deepseek', 'kimi', 'openai', 'zhipu', 'custom']),
  model: z
    .string()
    .trim()
    .min(1, '请填写模型标识')
    .max(160)
    .regex(/^[\w./:@+-]+$/, '模型标识包含无效字符'),
  apiKey: z
    .string()
    .trim()
    .min(1, '请填写 API Key')
    .max(2048)
    .regex(/^[^\r\n]+$/),
  baseUrl: z.string().trim().max(2048).optional(),
});
export type ModelConfig = z.infer<typeof modelConfigSchema>;
export type ProviderId = ModelConfig['provider'];
export type ModelProfile = ModelConfig & { rememberKey: boolean };
export const providerById = (id: ProviderId) => providers.find((p) => p.id === id)!;

export function providerBaseUrl(config: ModelConfig): string {
  if (config.provider !== 'custom') return providerById(config.provider).baseUrl;
  const url = new URL(config.baseUrl || '');
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.port && url.port !== '443')
  )
    throw new Error('自定义接口须为公开 HTTPS 地址，不含账号、查询参数或非标准端口。');
  return url.href.replace(/\/+$/, '');
}
