import { randomUUID } from 'node:crypto';
import * as cheerio from 'cheerio';
import { chromium, type Browser } from 'playwright';
import type { Check, Evidence, Report, Technology } from '../shared/types.js';
import { browserArgs, chromePath } from './browser.js';
import { createSafeProxy, normalizeUrl, safeFetch } from './network.js';

const compact = (text: string) => text.replace(/\s+/g, ' ').trim();

export async function analyze(
  input: string,
  progress: (message: string) => void,
  signal: AbortSignal,
): Promise<Report> {
  const requestedUrl = normalizeUrl(input).href;
  progress('正在验证公开网址与重定向…');
  const response = await safeFetch(requestedUrl, signal);
  let html = response.body;
  let url = response.url;
  let screenshot: string | undefined;
  let mode: Report['mode'] = 'html';
  const warnings: string[] = [];
  const resourceUrls: string[] = [];
  progress('正在渲染网页，提取正文与资源证据…');
  const proxy = await createSafeProxy();
  let browser: Browser | undefined;
  try {
    signal.throwIfAborted();
    browser = await chromium.launch({
      executablePath: chromePath(),
      headless: true,
      proxy: { server: proxy.url },
      args: browserArgs,
    });
    const close = () => {
      void browser?.close();
    };
    signal.addEventListener('abort', close, { once: true });
    try {
      signal.throwIfAborted();
      const context = await browser.newContext({
        viewport: { width: 1440, height: 960 },
        deviceScaleFactor: 1,
        serviceWorkers: 'block',
        acceptDownloads: false,
      });
      const page = await context.newPage();
      await context.route('**/*', (route) =>
        ['media', 'websocket'].includes(route.request().resourceType()) ||
        !['GET', 'HEAD'].includes(route.request().method())
          ? route.abort()
          : route.continue(),
      );
      await context.routeWebSocket(/.*/, (socket) => socket.close());
      page.on('request', (req) => {
        if (resourceUrls.length < 300) resourceUrls.push(req.url());
      });
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25_000 });
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
      // Avoid retaining an unlimited DOM or image; screenshot never embeds target HTML in our UI.
      const rendered = await page.content();
      if (rendered.length > 6 * 1024 * 1024) throw new Error('渲染后的页面超过大小限制。');
      html = rendered;
      url = normalizeUrl(page.url()).href;
      screenshot = `data:image/jpeg;base64,${(await page.screenshot({ type: 'jpeg', quality: 65, timeout: 5_000 })).toString('base64')}`;
      mode = 'rendered';
    } finally {
      signal.removeEventListener('abort', close);
    }
  } catch (error) {
    signal.throwIfAborted();
    warnings.push(
      `浏览器渲染不可用，当前仅分析服务端 HTML，可能缺少动态内容。${error instanceof Error ? error.message : ''}`,
    );
  } finally {
    await browser?.close();
    proxy.close();
  }
  signal.throwIfAborted();
  progress('正在分析技术指纹、SEO 与响应头…');
  return extractReport({
    html,
    headers: response.headers,
    requestedUrl,
    url,
    screenshot,
    mode,
    warnings,
    status: response.status,
    resourceUrls,
  });
}

export function extractReport(input: {
  html: string;
  headers: Record<string, string>;
  requestedUrl: string;
  url: string;
  screenshot?: string;
  mode: Report['mode'];
  warnings: string[];
  status: number;
  resourceUrls?: string[];
}): Report {
  const { html, headers, url } = input;
  const $ = cheerio.load(html);
  const meta = (name: string) =>
    compact($(`meta[name="${name}"],meta[property="${name}"]`).first().attr('content') ?? '');
  const title = compact($('title').first().text());
  const description = meta('description');
  const headings = $('h1,h2,h3,h4,h5,h6')
    .toArray()
    .map((el) => ({ level: Number(el.tagName[1]), text: compact($(el).text()) }))
    .filter((h) => h.text)
    .slice(0, 100);
  const scripts = $('script[src]')
    .toArray()
    .map((el) => $(el).attr('src') ?? '');
  const sources = [...scripts, ...(input.resourceUrls ?? [])];
  const technologies: Technology[] = [];
  const detect = (
    name: string,
    category: string,
    pattern: RegExp,
    confidence: Technology['confidence'] = 'high',
  ) => {
    const source = sources.find((src) => pattern.test(src));
    if (source) technologies.push({ name, category, confidence, evidence: source.slice(0, 220) });
  };
  detect('Next.js', '应用框架', /\/_next\//);
  detect('Nuxt', '应用框架', /\/_nuxt\//);
  detect('React', 'UI 框架', /(?:^|[/.@-])react(?:-dom)?(?:[/.@-]|$)/i);
  if (
    technologies.some((t) => t.name === 'Next.js') &&
    !technologies.some((t) => t.name === 'React')
  )
    technologies.push({
      name: 'React',
      category: 'UI 框架',
      confidence: 'medium',
      evidence: '存在 Next.js 资源，推断使用 React；未确认 React 版本。',
    });
  detect('Vue', 'UI 框架', /(?:^|[/.@-])vue(?:[/.@-]|$)/i);
  detect('Astro', '应用框架', /\/_astro\//);
  detect('Vite', '构建工具', /\/@vite\//);
  detect('jQuery', 'JavaScript 库', /jquery[.-]/i);
  detect('Google Analytics', '访问分析', /google-analytics\.com|googletagmanager\.com/);
  detect('WordPress', 'CMS', /\/wp-(?:content|includes)\//);
  if (html.includes('data-svelte') || html.includes('__svelte'))
    technologies.push({
      name: 'Svelte',
      category: 'UI 框架',
      confidence: 'medium',
      evidence: 'DOM 包含 Svelte 标记，具体版本无法确认。',
    });
  const generator = meta('generator');
  if (generator)
    technologies.push({
      name: generator.slice(0, 80),
      category: 'Generator 标签',
      confidence: 'high',
      evidence: `meta[name="generator"] = ${generator.slice(0, 150)}`,
    });
  for (const key of ['server', 'x-powered-by'])
    if (headers[key])
      technologies.push({
        name: headers[key].slice(0, 80),
        category: '响应头声明',
        confidence: 'high',
        evidence: `${key}: ${headers[key].slice(0, 180)}（响应头可能由代理提供）`,
      });
  if (headers['cf-ray'])
    technologies.push({
      name: 'Cloudflare',
      category: 'CDN / 代理',
      confidence: 'high',
      evidence: `cf-ray: ${headers['cf-ray']}`,
    });
  const classes = $('[class]')
    .toArray()
    .slice(0, 500)
    .map((el) => $(el).attr('class'))
    .join(' ');
  if (/(?:sm|md|lg|xl):\S+/.test(classes) && /(?:flex|grid|text-|bg-|px-|py-)/.test(classes))
    technologies.push({
      name: 'Tailwind CSS',
      category: '样式工具',
      confidence: 'medium',
      evidence: '检测到响应式前缀和工具类组合；相似类名也可能来自手写 CSS。',
    });
  const imgs = $('img').toArray();
  const missingAlt = imgs.filter((el) => $(el).attr('alt') === undefined).length;
  const canonical = $('link[rel="canonical"]').attr('href') ?? '';
  const h1 = headings.filter((h) => h.level === 1);
  const robots = meta('robots');
  const ld = $('script[type="application/ld+json"]').toArray();
  const validLd =
    ld.length > 0 &&
    ld.every((el) => {
      try {
        JSON.parse($(el).text());
        return true;
      } catch {
        return false;
      }
    });
  const check = (
    id: string,
    title: string,
    status: Check['status'],
    evidence: string,
    recommendation: string,
  ): Check => ({ id, title, status, evidence, recommendation });
  const seo: Check[] = [
    check(
      'title',
      '页面标题',
      title ? 'pass' : 'fail',
      title || '未发现 title 标签',
      '为页面设置简明、独特、描述主题的标题。',
    ),
    check(
      'description',
      '搜索摘要',
      description ? 'pass' : 'warn',
      description || '未发现 meta description',
      '添加准确概括页面内容的描述；搜索引擎也可能自行生成摘要。',
    ),
    check(
      'h1',
      '主标题结构',
      h1.length === 1 ? 'pass' : 'warn',
      `${h1.length} 个 H1${h1[0] ? `：${h1[0].text}` : ''}`,
      '为主要内容提供清晰的标题层级；H1 数量本身不是排名评分。',
    ),
    check(
      'canonical',
      '规范链接',
      canonical ? 'pass' : 'warn',
      canonical || '未声明 canonical',
      '在有重复 URL 的情况下，声明有效的规范链接。存在标签不代表搜索引擎已采纳。',
    ),
    check(
      'viewport',
      '移动端视口',
      meta('viewport').includes('width=device-width') ? 'pass' : 'warn',
      meta('viewport') || '未声明 viewport',
      '使用 width=device-width，确保移动端布局适配。',
    ),
    check(
      'language',
      '文档语言',
      $('html').attr('lang') ? 'pass' : 'warn',
      $('html').attr('lang') || '未声明 html lang',
      '声明与正文一致的语言，帮助辅助技术理解页面。',
    ),
    check(
      'alt',
      '图片替代文本',
      missingAlt === 0 ? 'pass' : 'warn',
      `${imgs.length} 张图片，${missingAlt} 张缺少 alt 属性；未验证已有文本质量。`,
      '为有意义的图片提供描述；装饰图片可以使用空 alt。',
    ),
    check(
      'robots',
      '索引指令',
      /noindex|none/i.test(`${robots} ${headers['x-robots-tag'] ?? ''}`) ? 'warn' : 'pass',
      `${robots || '未声明 meta robots'}；X-Robots-Tag: ${headers['x-robots-tag'] || '未声明'}。未检查 robots.txt。`,
      '确认索引指令符合页面用途；没有 noindex 不保证一定被收录。',
    ),
    check(
      'social',
      '社交分享信息',
      meta('og:title') && meta('og:image') ? 'pass' : 'warn',
      `og:title: ${meta('og:title') || '缺少'}；og:image: ${meta('og:image') || '缺少'}`,
      '为分享预览提供标题、描述和预览图片。',
    ),
    check(
      'structured',
      '结构化数据',
      validLd ? 'pass' : 'warn',
      ld.length
        ? `${ld.length} 个 JSON-LD，JSON 语法${validLd ? '有效（未校验 Schema 语义）' : '存在错误'}`
        : '未发现 JSON-LD；并非所有页面都需要。',
      '如页面类型适用，添加正确的结构化数据，并使用富媒体搜索结果测试验证。',
    ),
  ];
  const security: Check[] = [
    check(
      'https',
      'HTTPS 传输',
      url.startsWith('https:') ? 'pass' : 'fail',
      new URL(url).protocol,
      '启用 HTTPS，并将 HTTP 重定向至 HTTPS。',
    ),
    ...(
      [
        [
          'strict-transport-security',
          'HSTS',
          '确认 HTTPS 全站可用后，配置适当的 Strict-Transport-Security。',
        ],
        [
          'content-security-policy',
          '内容安全策略',
          '按实际资源来源配置 CSP，避免直接复制过宽策略。',
        ],
        ['x-content-type-options', 'MIME 类型保护', '配置 X-Content-Type-Options: nosniff。'],
        ['referrer-policy', '来源信息策略', '根据需求配置 Referrer-Policy。'],
        ['permissions-policy', '浏览器权限策略', '限制页面不需要的摄像头、麦克风等权限。'],
      ] as const
    ).map(([key, label, advice]) =>
      check(
        key,
        label,
        headers[key] ? 'pass' : 'warn',
        headers[key] ? `${key}: ${headers[key]}` : `响应头未声明 ${key}`,
        `${advice} 当前仅检查是否声明，未完整验证策略有效性。`,
      ),
    ),
  ];
  const links = $('a[href]')
    .toArray()
    .flatMap((el) => {
      try {
        const link = new URL($(el).attr('href')!, url);
        if (!['http:', 'https:'].includes(link.protocol)) return [];
        link.hash = '';
        return [
          {
            text: compact($(el).text()).slice(0, 100) || link.pathname,
            url: link.href,
            internal: link.origin === new URL(url).origin,
          },
        ];
      } catch {
        return [];
      }
    })
    .filter((link, i, all) => all.findIndex((l) => l.url === link.url) === i)
    .slice(0, 150);
  $('script,style,noscript,svg,template,[hidden],[aria-hidden="true"]').remove();
  const main = $('main').first().length
    ? $('main').first()
    : $('article').first().length
      ? $('article').first()
      : $('body');
  const evidence: Evidence[] = [];
  let heading = title || new URL(url).hostname;
  let buffer = '';
  const flush = () => {
    if (buffer && evidence.length < 60)
      evidence.push({ id: `E${evidence.length + 1}`, heading, text: buffer.slice(0, 1800), url });
    buffer = '';
  };
  main.find('h1,h2,h3,h4,p,li,pre,blockquote,td').each((_i, el) => {
    if ($(el).parents('li,pre,blockquote,td').length && !/^h/.test(el.tagName)) return;
    const text = compact($(el).text());
    if (/^h[1-4]$/.test(el.tagName)) {
      flush();
      heading = text || heading;
    } else if (text) {
      if (buffer.length + text.length > 1600) flush();
      buffer += `${buffer ? '\n' : ''}${text}`;
      if (buffer.length > 1600) flush();
    }
  });
  flush();
  const bodyText = compact(main.text());
  if (!evidence.length && bodyText)
    for (let i = 0; i < Math.min(bodyText.length, 18_000); i += 1400)
      evidence.push({
        id: `E${evidence.length + 1}`,
        heading,
        text: bodyText.slice(i, i + 1400),
        url,
      });
  if (!evidence.length)
    input.warnings.push('未提取到正文。页面可能要求登录、阻止自动访问或只包含交互控件。');
  return {
    id: randomUUID(),
    requestedUrl: input.requestedUrl,
    url,
    title: title || new URL(url).hostname,
    description,
    analyzedAt: new Date().toISOString(),
    statusCode: input.status,
    mode: input.mode,
    warnings: input.warnings,
    screenshot: input.screenshot,
    language: $('html').attr('lang') || '未声明',
    wordCount: bodyText.match(/[\p{Script=Han}]|[\p{L}\p{N}]+/gu)?.length ?? 0,
    headings,
    links,
    resources: {
      scripts: scripts.length,
      styles: $('link[rel="stylesheet"]').length,
      images: imgs.length,
      imagesWithoutAlt: missingAlt,
    },
    technologies,
    seo,
    security,
    evidence,
    audits: {},
  };
}

export function searchEvidence(report: Report, query: string, limit = 6): Evidence[] {
  const tokens = query.toLowerCase().match(/[a-z0-9]{2,}|[\p{Script=Han}]{1,2}/gu) ?? [];
  return report.evidence
    .map((e, index) => ({
      e,
      index,
      score: tokens.reduce(
        (n, t) => n + (`${e.heading} ${e.text}`.toLowerCase().includes(t) ? t.length : 0),
        0,
      ),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((x) => x.e);
}
