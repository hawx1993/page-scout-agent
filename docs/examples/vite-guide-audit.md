> 此文件来自 2026-11-08 的实际 UI 导出，省略了正文证据章节，保留检测结果。数值是当时本机的单次实验室结果，不代表该网站当前表现。

# SiteLens · Getting Started | Vite

URL: https://vite.dev/guide/

快照时间：2026-11-08T05:45:09.217Z

抓取方式：rendered

Next Generation Frontend Tooling

## 技术栈

- **VitePress v2.0.0-alpha.21** (high)：meta[name="generator"] = VitePress v2.0.0-alpha.21
- **Netlify** (high)：server: Netlify（响应头可能由代理提供）
- **Tailwind CSS** (medium)：检测到响应式前缀和工具类组合；相似类名也可能来自手写 CSS。

## SEO 基础检查

- [pass] 页面标题：Getting Started | Vite
  建议：为页面设置简明、独特、描述主题的标题。
- [pass] 搜索摘要：Next Generation Frontend Tooling
  建议：添加准确概括页面内容的描述；搜索引擎也可能自行生成摘要。
- [pass] 主标题结构：1 个 H1：Getting Started ​
  建议：为主要内容提供清晰的标题层级；H1 数量本身不是排名评分。
- [pass] 规范链接：https://vite.dev/guide/
  建议：在有重复 URL 的情况下，声明有效的规范链接。存在标签不代表搜索引擎已采纳。
- [pass] 移动端视口：width=device-width,initial-scale=1
  建议：使用 width=device-width，确保移动端布局适配。
- [pass] 文档语言：en-US
  建议：声明与正文一致的语言，帮助辅助技术理解页面。
- [warn] 图片替代文本：26 张图片，1 张缺少 alt 属性；未验证已有文本质量。
  建议：为有意义的图片提供描述；装饰图片可以使用空 alt。
- [pass] 索引指令：未声明 meta robots；X-Robots-Tag: 未声明。未检查 robots.txt。
  建议：确认索引指令符合页面用途；没有 noindex 不保证一定被收录。
- [pass] 社交分享信息：og:title: Getting Started；og:image: https://vite.dev/og-image.jpg
  建议：为分享预览提供标题、描述和预览图片。
- [warn] 结构化数据：未发现 JSON-LD；并非所有页面都需要。
  建议：如页面类型适用，添加正确的结构化数据，并使用富媒体搜索结果测试验证。

## 安全响应头基础检查

- [pass] HTTPS 传输：https:
- [pass] HSTS：strict-transport-security: max-age=31536000
- [warn] 内容安全策略：响应头未声明 content-security-policy
- [warn] MIME 类型保护：响应头未声明 x-content-type-options
- [warn] 来源信息策略：响应头未声明 referrer-policy
- [warn] 浏览器权限策略：响应头未声明 permissions-policy

## Lighthouse · mobile

检测时间：2026-11-08T05:45:32.203Z · v13.6.0

- performance: 57
- accessibility: 99
- best-practices: 92
- seo: 100

- LCP: 9.0 s
- CLS: 0.001
- FCP: 9.0 s
- TBT: 50 ms
- Speed Index: 9.0 s

### 待改进

- First Contentful Paint：9.0 s
- Largest Contentful Paint：9.0 s
- Speed Index：9.0 s
- Use efficient cache lifetimes：Est savings of 128 KiB
- Font display：Est savings of 3,000 ms
- Forced reflow
- Network dependency tree
- Render-blocking requests：Est savings of 220 ms
- Time to Interactive：10.7 s
- Max Potential First Input Delay：100 ms
- Reduce unused CSS：Est savings of 29 KiB
- Reduce unused JavaScript：Est savings of 21 KiB
- Image elements do not have explicit `width` and `height`
- Heading elements are not in a sequentially-descending order
- Browser errors were logged to the console
- Issues were logged in the `Issues` panel in Chrome Devtools

本地 Lighthouse 单次实验室检测，使用模拟节流。设备、网络、代理与浏览器版本会影响结果；不代表真实用户 Core Web Vitals 或搜索排名。

## Core Web Vitals · 真实用户

未配置 CRUX_API_KEY。真实用户 LCP / INP / CLS 暂不可用；Lighthouse 不提供真实用户 INP。
