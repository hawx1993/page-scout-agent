import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';
import type { Audit, FieldData, Report } from '../shared/types.js';
import { browserArgs, chromePath } from './browser.js';
import { createSafeProxy, normalizeUrl, publicAddress } from './network.js';

let running = false;
export const rawAudits = new Map<string, { html: string; json: string }>();

export async function runLighthouse(
  report: Report,
  device: Audit['device'],
  signal: AbortSignal,
): Promise<Audit> {
  if (report.audits[device]) return report.audits[device]!;
  if (running) throw new Error('另一个 Lighthouse 检测正在进行，请稍后重试。');
  running = true;
  let chrome: Awaited<ReturnType<typeof chromeLauncher.launch>> | undefined;
  let proxy: Awaited<ReturnType<typeof createSafeProxy>> | undefined;
  const start = Date.now();
  let timer: NodeJS.Timeout | undefined;
  const kill = () => {
    void chrome?.kill();
  };
  try {
    await publicAddress(normalizeUrl(report.url).hostname);
    signal.throwIfAborted();
    proxy = await createSafeProxy();
    chrome = await chromeLauncher.launch({
      chromePath: chromePath(),
      chromeFlags: [
        '--headless=new',
        '--no-first-run',
        '--disable-dev-shm-usage',
        `--proxy-server=${proxy.url}`,
        ...browserArgs,
      ],
    });
    signal.addEventListener('abort', kill, { once: true });
    signal.throwIfAborted();
    timer = setTimeout(kill, 120_000);
    const result = await lighthouse(
      report.url,
      {
        port: chrome.port,
        logLevel: 'error',
        output: ['html', 'json'],
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
        throttlingMethod: 'simulate',
        maxWaitForLoad: 35_000,
      },
      device === 'desktop' ? desktopConfig : undefined,
    );
    signal.throwIfAborted();
    if (!result) throw new Error('Lighthouse 没有返回报告。');
    const lhr = result.lhr;
    if (lhr.runtimeError) throw new Error(`Lighthouse: ${lhr.runtimeError.message}`);
    const score = (id: string) =>
      typeof lhr.categories[id]?.score === 'number'
        ? Math.round(lhr.categories[id]!.score! * 100)
        : null;
    const metrics = [
      ['largest-contentful-paint', 'LCP'],
      ['cumulative-layout-shift', 'CLS'],
      ['first-contentful-paint', 'FCP'],
      ['total-blocking-time', 'TBT'],
      ['speed-index', 'Speed Index'],
    ].map(([id, label]) => ({
      id: id!,
      label: label!,
      value: lhr.audits[id!]?.numericValue ?? null,
      display: lhr.audits[id!]?.displayValue ?? '无数据',
      score: lhr.audits[id!]?.score ?? null,
    }));
    const findings: Audit['findings'] = [];
    for (const category of Object.values(lhr.categories)) {
      for (const ref of category.auditRefs) {
        const audit = lhr.audits[ref.id];
        if (
          !audit ||
          audit.score === null ||
          audit.score >= 1 ||
          ['notApplicable', 'manual', 'informative'].includes(audit.scoreDisplayMode)
        )
          continue;
        if (findings.some((f) => f.id === ref.id)) continue;
        findings.push({
          id: ref.id,
          title: audit.title,
          description: audit.description,
          score: audit.score,
          display: audit.displayValue,
          category: category.id,
        });
      }
    }
    const audit: Audit = {
      device,
      measuredAt: new Date().toISOString(),
      lighthouseVersion: lhr.lighthouseVersion,
      finalUrl: lhr.finalDisplayedUrl || report.url,
      durationMs: Date.now() - start,
      scores: {
        performance: score('performance'),
        accessibility: score('accessibility'),
        'best-practices': score('best-practices'),
        seo: score('seo'),
      },
      metrics,
      findings: findings.slice(0, 50),
      warnings: [
        ...(lhr.runWarnings ?? []).map(String),
        '本地 Lighthouse 单次实验室检测，使用模拟节流。设备、网络、代理与浏览器版本会影响结果；不代表真实用户 Core Web Vitals 或搜索排名。',
      ],
    };
    report.audits[device] = audit;
    const outputs = Array.isArray(result.report) ? result.report : [result.report];
    rawAudits.set(`${report.id}:${device}`, {
      html: outputs[0] || '',
      json: outputs[1] || JSON.stringify(lhr),
    });
    return audit;
  } finally {
    if (timer) clearTimeout(timer);
    signal.removeEventListener('abort', kill);
    try {
      chrome?.kill();
    } finally {
      proxy?.close();
      running = false;
    }
  }
}

export async function getFieldData(report: Report, signal: AbortSignal): Promise<FieldData> {
  if (report.fieldData) return report.fieldData;
  if (!process.env.CRUX_API_KEY)
    return (report.fieldData = {
      status: 'not-configured',
      message:
        '未配置 CRUX_API_KEY。真实用户 LCP / INP / CLS 暂不可用；Lighthouse 不提供真实用户 INP。',
    });
  const request = async (scope: 'url' | 'origin') => {
    const response = await fetch(
      `https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${encodeURIComponent(process.env.CRUX_API_KEY!)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
        body: JSON.stringify({
          [scope]: scope === 'url' ? report.url : new URL(report.url).origin,
          formFactor: 'PHONE',
          metrics: [
            'largest_contentful_paint',
            'interaction_to_next_paint',
            'cumulative_layout_shift',
          ],
        }),
      },
    );
    if (response.status === 404) return null;
    if (!response.ok)
      throw new Error(`CrUX 服务返回 HTTP ${response.status}，请检查配额与 API 配置。`);
    return (await response.json()) as {
      record: {
        collectionPeriod: {
          firstDate: { year: number; month: number; day: number };
          lastDate: { year: number; month: number; day: number };
        };
        metrics: Record<string, { percentiles: { p75: number | string } }>;
      };
    };
  };
  try {
    let scope: 'url' | 'origin' = 'url';
    let result = await request(scope);
    if (!result) {
      scope = 'origin';
      result = await request(scope);
    }
    if (!result)
      return (report.fieldData = {
        status: 'unavailable',
        message:
          'CrUX 中没有该 URL 或整个来源的足够真实用户样本。这不表示网站通过或未通过 Core Web Vitals。',
      });
    const { record } = result;
    const metrics = Object.entries(record.metrics).flatMap(([name, metric]) => {
      const p75 = Number(metric.percentiles.p75);
      if (!Number.isFinite(p75)) return [];
      const cls = name === 'cumulative_layout_shift';
      const inp = name === 'interaction_to_next_paint';
      const good = cls ? 0.1 : inp ? 200 : 2500;
      const poor = cls ? 0.25 : inp ? 500 : 4000;
      return [
        {
          name: cls ? 'CLS' : inp ? 'INP' : 'LCP',
          p75,
          rating: (p75 <= good ? 'good' : p75 <= poor ? 'needs-improvement' : 'poor') as
            'good' | 'needs-improvement' | 'poor',
          unit: cls ? '' : 'ms',
        },
      ];
    });
    const format = (d: { year: number; month: number; day: number }) =>
      `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
    return (report.fieldData = {
      status: 'available',
      scope,
      formFactor: 'PHONE',
      period: `${format(record.collectionPeriod.firstDate)} — ${format(record.collectionPeriod.lastDate)}`,
      metrics,
      message:
        scope === 'url'
          ? '该 URL 的移动端真实用户数据（p75）。'
          : '该 URL 样本不足，展示整个来源的移动端真实用户数据（p75），不代表单页。',
    });
  } catch (error) {
    signal.throwIfAborted();
    return {
      status: 'unavailable',
      message: error instanceof Error ? error.message : 'CrUX 暂不可用。',
    };
  }
}
