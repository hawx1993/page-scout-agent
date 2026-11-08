import { extractReport } from '../server/analyze.js';

export const fixtureHtml = `<!doctype html><html lang="zh-CN"><head>
<title>开源组件工坊</title><meta name="description" content="一个免费的 React 组件库，包含按钮、表单和导航组件。">
<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="canonical" href="https://example.com/">
<meta property="og:title" content="组件工坊"><meta property="og:image" content="https://example.com/og.png">
<script src="/_next/static/chunk.js"></script><script src="/wp-content/plugin.js"></script>
<script type="application/ld+json">{"@type":"SoftwareApplication"}</script>
</head><body><nav><a href="/docs">文档</a></nav><main><h1>开源组件工坊</h1><p>免费使用的 React 组件库，适合构建前端作品。</p>
<h2>安装方法</h2><p>执行 npm install component-studio 即可安装。</p>
<h2>许可与定价</h2><p>采用 MIT 许可证。所有组件免费，支持商业使用。</p>
<p hidden>这是不应出现的隐藏内容。</p><script>secretScript()</script><img src="/button.png" alt="按钮示例"><img src="/decoration.png" alt=""><img src="/missing.png">
<a href="/docs">开始学习</a><a href="javascript:alert(1)">无效链接</a><a href="https://other.example.org">外部</a>
</main></body></html>`;
export function fixtureReport() {
  return extractReport({
    html: fixtureHtml,
    headers: { server: 'nginx', 'x-content-type-options': 'nosniff' },
    requestedUrl: 'https://example.com',
    url: 'https://example.com/',
    mode: 'html',
    warnings: [],
    status: 200,
  });
}
