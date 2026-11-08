import type { Report, StreamEvent } from '../shared/types';

export async function analyzeAndAudit(
  url: string,
  device: 'mobile' | 'desktop',
  signal: AbortSignal,
  onEvent: (event: StreamEvent) => void,
  request = requestStream,
) {
  let reportId: string | undefined;
  await request('/api/analyze', { url }, signal, (event) => {
    if (event.type === 'report') reportId = event.report.id;
    if (event.type !== 'done') onEvent(event);
  });
  signal.throwIfAborted();
  if (!reportId) throw new Error('网页抓取未返回快照，无法启动 Lighthouse。请重新分析。');
  onEvent({
    type: 'progress',
    message: `网页抓取完成，正在运行${device === 'mobile' ? '移动端' : '桌面端'} Lighthouse，通常需要 30–120 秒…`,
  });
  await request('/api/audit', { reportId, device, kind: 'lighthouse' }, signal, onEvent);
}

export async function requestStream(
  path: string,
  body: unknown,
  signal: AbortSignal,
  onEvent: (event: StreamEvent) => void,
) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || `请求失败：HTTP ${response.status}`);
  }
  if (!response.body) throw new Error('当前浏览器不支持流式响应。');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let complete = false;
  function consume(line: string) {
    if (!line.trim()) return;
    const event = JSON.parse(line) as StreamEvent;
    if (event.type === 'error') throw new Error(event.message);
    if (event.type === 'done') complete = true;
    onEvent(event);
  }
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let index;
      while ((index = buffer.indexOf('\n')) !== -1) {
        consume(buffer.slice(0, index));
        buffer = buffer.slice(index + 1);
      }
    }
    buffer += decoder.decode();
    consume(buffer);
    if (!complete) throw new Error('连接提前结束，请重试。');
  } finally {
    reader.releaseLock();
  }
}

export function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportReport(report: Report) {
  const auditLines = Object.values(report.audits).map(
    (a) =>
      `## Lighthouse · ${a.device}\n\n检测时间：${a.measuredAt} · v${a.lighthouseVersion}\n\n${Object.entries(
        a.scores,
      )
        .map(([key, value]) => `- ${key}: ${value ?? '无数据'}`)
        .join(
          '\n',
        )}\n\n${a.metrics.map((m) => `- ${m.label}: ${m.display}`).join('\n')}\n\n### 待改进\n\n${a.findings.map((f) => `- ${f.title}${f.display ? `：${f.display}` : ''}`).join('\n')}\n\n${a.warnings.join('\n')}`,
  );
  const text = `# SiteLens · ${report.title}\n\nURL: ${report.url}\n\n快照时间：${report.analyzedAt}\n\n抓取方式：${report.mode}\n\n${report.description}\n\n${report.warnings.join('\n')}\n\n## 技术栈\n\n${report.technologies.map((t) => `- **${t.name}** (${t.confidence})：${t.evidence}`).join('\n') || '未发现可靠指纹'}\n\n## SEO 基础检查\n\n${report.seo.map((c) => `- [${c.status}] ${c.title}：${c.evidence}\n  建议：${c.recommendation}`).join('\n')}\n\n## 安全响应头基础检查\n\n${report.security.map((c) => `- [${c.status}] ${c.title}：${c.evidence}`).join('\n')}\n\n${auditLines.join('\n\n') || '## Lighthouse\n\n尚未运行，无评分。'}\n\n## Core Web Vitals · 真实用户\n\n${report.fieldData?.message || '尚未查询 CrUX 数据。'}\n${report.fieldData?.period || ''}\n${report.fieldData?.metrics?.map((m) => `- ${m.name} p75: ${m.p75}${m.unit} (${m.rating})`).join('\n') || ''}\n\n## 正文证据\n\n${report.evidence.map((e) => `### [${e.id}] ${e.heading}\n\n${e.text}\n\n来源：${e.url}`).join('\n\n')}\n\n---\n生成于 SiteLens。基础检查不代表搜索排名、安全认证或完整的无障碍审计。Lighthouse 为本地实验室单次检测，CrUX 为独立的真实用户数据。\n`;
  download(`sitelens-${new URL(report.url).hostname}.md`, text, 'text/markdown;charset=utf-8');
}
