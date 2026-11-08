import 'dotenv/config';
import express from 'express';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { Report, StreamEvent } from '../shared/types.js';
import { modelConfigSchema } from '../shared/models.js';
import { testModel, modelError } from './models.js';
import { analyze } from './analyze.js';
import { chat, agentConfigured } from './agent.js';
import { getFieldData, rawAudits, runLighthouse } from './audit.js';

const app = express();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});
// No cross-origin API access: prevent a third-party website from driving the local inspector.
app.use('/api', (req, res, next) => {
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host) {
    res.status(403).json({ error: '不接受跨来源请求。' });
    return;
  }
  next();
});
app.use(
  '/api',
  rateLimit({
    windowMs: 60_000,
    limit: 40,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: '请求过于频繁，请稍后重试。' },
  }),
);
const expensive = rateLimit({
  windowMs: 60_000,
  limit: 8,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: '检测请求过于频繁，请稍后重试。' },
});
const reports = new Map<string, { report: Report; expires: number }>();
const reportLocks = new Set<string>();
let analyzing = 0;
const ttl = 60 * 60_000;
function remember(report: Report) {
  reports.set(report.id, { report, expires: Date.now() + ttl });
  for (const [id, entry] of reports) {
    if ((entry.expires < Date.now() || reports.size > 25) && !reportLocks.has(id)) {
      reports.delete(id);
      rawAudits.delete(`${id}:mobile`);
      rawAudits.delete(`${id}:desktop`);
    }
  }
}
function getReport(id: string) {
  const entry = reports.get(id);
  if (!entry || entry.expires < Date.now()) {
    reports.delete(id);
    rawAudits.delete(`${id}:mobile`);
    rawAudits.delete(`${id}:desktop`);
    return null;
  }
  entry.expires = Date.now() + ttl;
  return entry.report;
}

function stream(
  res: express.Response,
  action: (emit: (event: StreamEvent) => void, signal: AbortSignal) => Promise<void>,
) {
  res.status(200).set({
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });
  const emit = (event: StreamEvent) => {
    if (!res.destroyed && !controller.signal.aborted) res.write(`${JSON.stringify(event)}\n`);
  };
  void action(emit, controller.signal)
    .then(() => emit({ type: 'done' }))
    .catch((error) => {
      if (!controller.signal.aborted)
        emit({
          type: 'error',
          message: error instanceof Error ? error.message : '执行失败，请稍后重试。',
        });
    })
    .finally(() => res.end());
}

app.get('/api/health', (_req, res) =>
  res.json({ ok: true, ai: agentConfigured(), crux: Boolean(process.env.CRUX_API_KEY) }),
);
app.post('/api/analyze', expensive, (req, res) => {
  const parsed = z.object({ url: z.string().trim().min(3).max(2048) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: '请输入有效的网址。' });
    return;
  }
  if (analyzing >= 2) {
    res.status(429).json({ error: '分析队列已满，请稍后重试。' });
    return;
  }
  analyzing++;
  stream(res, async (emit, signal) => {
    try {
      const report = await analyze(
        parsed.data.url,
        (message) => emit({ type: 'progress', message }),
        signal,
      );
      remember(report);
      emit({ type: 'report', report });
    } finally {
      analyzing--;
    }
  });
});
app.post('/api/models/test', expensive, (req, res) => {
  const parsed = modelConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: '模型配置无效。' });
    return;
  }
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });
  void testModel(parsed.data, controller.signal)
    .then((data) => res.json(data))
    .catch((error) => {
      if (!res.destroyed) res.status(400).json({ error: modelError(error, parsed.data.apiKey) });
    });
});
app.post('/api/chat', expensive, (req, res) => {
  const parsed = z
    .object({
      reportId: z.string().uuid().optional(),
      modelConfig: modelConfigSchema.optional(),
      messages: z
        .array(
          z.object({
            id: z.string().max(100),
            role: z.enum(['user', 'assistant']),
            content: z.string().max(8000),
          }),
        )
        .min(1)
        .max(30),
    })
    .safeParse(req.body);
  if (!parsed.success || parsed.data.messages.at(-1)?.role !== 'user') {
    res.status(400).json({ error: '对话格式无效或超出长度限制。' });
    return;
  }
  const report = parsed.data.reportId ? getReport(parsed.data.reportId) : null;
  if (parsed.data.reportId && !report) {
    res.status(404).json({ error: '分析快照已过期，请重新分析网页。' });
    return;
  }
  if (report && reportLocks.has(report.id)) {
    res.status(409).json({ error: '当前网页的任务尚未完成。' });
    return;
  }
  if (report) reportLocks.add(report.id);
  stream(res, async (emit, signal) => {
    try {
      try {
        await chat(report, parsed.data.messages, emit, signal, parsed.data.modelConfig, remember);
      } catch (error) {
        if (signal.aborted) throw error;
        throw new Error(modelError(error, parsed.data.modelConfig?.apiKey));
      }
    } finally {
      if (report) reportLocks.delete(report.id);
    }
  });
});
app.post('/api/audit', expensive, (req, res) => {
  const parsed = z
    .object({
      reportId: z.string().uuid(),
      device: z.enum(['mobile', 'desktop']),
      kind: z.enum(['lighthouse', 'field']).default('lighthouse'),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: '检测参数无效。' });
    return;
  }
  const report = getReport(parsed.data.reportId);
  if (!report) {
    res.status(404).json({ error: '分析快照已过期，请重新分析网页。' });
    return;
  }
  if (reportLocks.has(report.id)) {
    res.status(409).json({ error: '当前网页的任务尚未完成。' });
    return;
  }
  reportLocks.add(report.id);
  stream(res, async (emit, signal) => {
    try {
      emit({
        type: 'progress',
        message:
          parsed.data.kind === 'field'
            ? '正在查询 CrUX 真实用户数据…'
            : '正在运行 Lighthouse，通常需要 30–120 秒…',
      });
      if (parsed.data.kind === 'field') await getFieldData(report, signal);
      else await runLighthouse(report, parsed.data.device, signal);
      emit({ type: 'report', report });
    } finally {
      reportLocks.delete(report.id);
    }
  });
});
app.get('/api/reports/:id/lighthouse/:device', (req, res) => {
  if (!getReport(req.params.id)) {
    res.status(404).json({ error: '报告已过期。' });
    return;
  }
  const raw = rawAudits.get(`${req.params.id}:${req.params.device}`);
  if (!raw) {
    res.status(404).json({ error: '请先运行该设备的 Lighthouse 检测。' });
    return;
  }
  const json = req.query.format === 'json';
  // Always download, never execute a target-derived Lighthouse HTML report on our application origin.
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="sitelens-lighthouse-${req.params.device}.${json ? 'json' : 'html'}"`,
  );
  res.type(json ? 'application/json' : 'text/html').send(json ? raw.json : raw.html);
});
app.use('/api', (_req, res) => res.status(404).json({ error: '接口不存在。' }));
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res
    .status(400)
    .json({ error: err instanceof SyntaxError ? '请求 JSON 无效。' : '请求无效或过大。' });
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(root, 'dist')));
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(root, 'dist/index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}
const port = Number(process.env.PORT || 3000);
app.listen(port, process.env.HOST || '127.0.0.1', () =>
  console.log(
    `\n  SiteLens → http://${process.env.HOST || '127.0.0.1'}:${port}\n  AI: ${agentConfigured() ? 'configured' : 'evidence mode (configure .env to enable Agent)'}\n`,
  ),
);
