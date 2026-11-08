# SiteLens

**与网页对话，让每个结论都有证据。**

An evidence-first, open-source website analysis agent. Chat with a public webpage, inspect its technology signals, and run real Lighthouse and Chrome UX Report checks.

输入 URL，提取网页正文与截图后自动运行当前设备的 Lighthouse，再用自然语言探索内容、技术栈、性能、SEO 和安全响应头。为前端开发者、开源作者与独立开发者构建，使用公开网页即可演示。

## 功能

- **网页内容问答**：浏览器渲染、正文分段、按需检索、`[E1]` 引用、多轮流式对话。
- **真正的工具调用 Agent**：AI SDK `ToolLoopAgent`，按问题选择工具，接收结果后继续回答，最多 6 步。界面显示工具执行记录，不展示内部思考。
- **技术栈分析**：脚本路径、DOM 标记、Generator 标签与响应头指纹；区分直接观测和中等置信度推断。无法确认的版本、数据库与后端不会当作事实。
- **真实 Lighthouse**：本地 Chrome / Chromium 实测移动端、桌面端的性能、SEO、可访问性和最佳实践评分；加载指标、改进项目和原始 HTML / JSON 报告。
- **Core Web Vitals**：单独调用 CrUX，查询真实用户移动端 p75 的 LCP、INP、CLS。标明时间窗口、URL / origin 范围与缺失样本。
- **SEO 基础检查**：标题、描述、H1、canonical、viewport、语言、图片 alt、索引指令、Open Graph、JSON-LD 语法；展开查看证据与建议。
- **安全响应头检查**：HTTPS、HSTS、CSP、MIME 保护、来源策略、权限策略；只报告检查范围内的事实。
- **便于展示**：响应式工作台、网页截图、历史网址、取消任务、Markdown / JSON 导出。
- **免密钥证据模式**：无需模型 Key 也能抓取网页、查看证据、按关键词调用检测。界面明确标注此模式不使用 LLM，不具备模型的多轮理解能力。

## 快速开始

需要 **Node.js 22.19+**，推荐 Node.js 24 LTS。

```bash
npm ci
npm run browser:install
cp .env.example .env
npm run dev
```

打开 **http://127.0.0.1:3000**。如果本机已安装 Chrome，会自动使用它，可以省略浏览器下载。也可在 `.env` 设置 `CHROME_PATH` 为浏览器可执行文件的绝对路径。

Linux 安装 Chromium 系统依赖：

```bash
npx playwright install --with-deps chromium
```

第一次可分析 `https://example.com`。抓取完成后自动运行当前设备的 Lighthouse，通常需要 30–120 秒；切换设备时自动检测缺失结果。检测失败会保留网页内容并显示原因，可点击重试。这会访问真实公开网站，没有内置虚构评分。

### 在网页设置模型与 Key

点击侧栏「模型与 API Key」或右侧模型选择器旁的设置按钮，选择 DeepSeek、Kimi、OpenAI、智普或自定义兼容接口，填写 Key 和模型标识，然后「保存并使用」。无需修改环境变量或重启。每个服务商分别保存配置，右侧可随时切换；也可填写自己的模型标识。

勾选「在此浏览器记住 Key」会将 Key **未加密地保存到当前浏览器 localStorage**；不勾选则 Key 仅存在当前页面内存中，刷新后需重新填写。可删除单个服务商的 Key。请求时 Key 经本站后端转发到所选服务商，不写入服务端配置、报告或历史列表。公开部署须使用 HTTPS，并保护站点免受脚本注入。

「测试连接」会发起一次少量 Token 的流式工具调用，验证认证及函数工具能力。没有各家真实 Key 时，只能验证兼容协议，不能保证账号权限或余额。

右侧支持直接对话，无需先分析网页；将公开网址发给 Agent 可建立网页上下文，再继续追问内容、技术、性能或 SEO。不同服务商的对话 Key 在请求间隔离，服务端不会将某位用户的 Key 保存为全局默认值。

DeepSeek 预设保留用户请求的 `deepseek-v4-flash` 与 `deepseek-v4-pro`；官方可能把 Flash 旧标识映射到新版本，见 [官方说明](https://api-docs.deepseek.com/quick_start/pricing-details-cny/)。Kimi、GLM 模型列表以官方当前文档为参考，实际可用性取决于账号；输入框支持自定义标识。国内与国际区或 Coding Plan 的 Key / 接口不可随意混用，其他接口通过「自定义兼容接口」设置。

### 启用 Agent 对话

在 `.env` 中配置支持 **Chat Completions、流式输出与工具调用**的 OpenAI 兼容接口：

```dotenv
AI_API_KEY=你的密钥
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=你的服务商支持的模型标识
```

模型名称由你选择，不会静默使用默认付费模型。可接入其他兼容服务的 `/v1` 地址。配置后重启服务，界面会从“证据模式”切换为“AGENT”。密钥只在服务端使用，不会发送给待分析网页或前端。

模型回答会将按需检索的公开网页片段和检测结果发送给你配置的模型服务。目标页面内容始终作为不可信数据处理，不能覆盖系统指令。

### 启用真实用户指标

在 Google Cloud 项目中启用 **Chrome UX Report API**，设置：

```dotenv
CRUX_API_KEY=你的Google_API_Key
```

CrUX 会先查询当前 URL，样本不足时查询 origin。界面会清楚区分，且始终显示 PHONE（移动端）p75 与统计窗口。没有样本时不判定通过 / 不通过。

**Lighthouse 是单次实验室检测，不提供真实用户 INP；TBT 不等于 INP。** 未配置 CrUX 不影响本地 Lighthouse。

## 试着这样问

```text
这个网页主要讲了什么？请引用原文。
这个产品适合什么人？页面有没有提到定价？
网站使用了哪些技术栈？哪些是确定的，哪些只是推断？
运行移动端 Lighthouse，解释性能瓶颈和优先优化项。
比较当前页面的移动端和桌面端 Lighthouse 分数。
查询真实用户 Core Web Vitals，是否有 INP 数据？
SEO 哪些方面做得好，哪些需要改进？
检查 HTTPS 和安全响应头，并说明你无法确认的部分。
```

免密钥模式按关键词选择工具并展示原始证据，不替代 LLM 对问题的理解。内容问答范围是**当前页面**，不会声称已经读过整个网站。

## 开发与验证

```bash
npm run typecheck
npm test
npm run build
npm start
```

`npm start` 启动生产服务，需先构建前端。服务端直接通过 `tsx` 运行 TypeScript，因此运行环境需要安装完整依赖。单元与集成测试不需要真实模型 Key；模型协议测试在本机启动一个模拟兼容接口，验证实际 SDK 的工具循环，不验证真实模型回答质量。

## 技术栈与结构

React 19 · TypeScript · Vite · Express · AI SDK · Playwright · Lighthouse · Cheerio · Zod · Vitest

```text
src/                 React 工作台、流式事件客户端与导出
shared/types.ts      前后端共享的数据与事件契约
server/index.ts      API、NDJSON 流、限流、快照生命周期
server/analyze.ts    浏览器渲染、正文证据、SEO、技术指纹
server/agent.ts      Agent、工具定义与免密钥证据模式
server/audit.ts      Lighthouse、CrUX、原始报告
server/network.ts    URL 验证、DNS 固定、安全出口代理
server/browser.ts    浏览器定位与运行参数
tests/               内容、网络边界、CrUX 与 SDK 集成测试
docs/architecture.md 架构、设计取舍与面试讲解点
```

## 检测边界

- 只分析公开、无需登录、80 / 443 端口的 HTTP / HTTPS 页面。不处理 Cookie 登录、验证码、付费墙或登录后的个人数据。
- 浏览器以独立临时上下文渲染；无法渲染时降级为服务端 HTML 并显示提示，可能遗漏客户端内容。
- 当前读取 DOM 中的标题、段落、列表等，不提供 OCR、Shadow DOM 全覆盖或全站爬取。
- SEO 基础检查通过数不是 Lighthouse SEO 评分，更不是排名预测。canonical 仅检查声明，JSON-LD 仅检查 JSON 语法；不检查实际索引状态或 robots.txt。
- 可访问性分数来自 Lighthouse 自动检查，不等于完整人工无障碍审计。
- 响应头检查只检查声明，不提供漏洞扫描、安全认证或“网站安全”结论。
- Lighthouse 受到本机 CPU、网络、浏览器版本及公共网络出口代理影响，使用模拟节流；同一个快照、同一设备的检测结果复用。要重新测量，请重新分析 URL。
- 移动端 / 桌面端 Lighthouse 是独立检测；当前 CrUX 查询固定为移动端 PHONE，不跟随 Lighthouse 设备切换。
- 截图固定为桌面视口，不随 Lighthouse 设备切换。
- 默认内存最多保存 25 份快照，闲置约一小时过期；重启后消失。浏览器历史仅保存最多 8 个网址与标题，不持久化正文、截图或对话。

## 部署

这是一个需要 Node.js 与 Chrome 的应用，适合本机或专用容器，**不能作为纯静态网站部署**。常规短时 serverless 函数也不适合 30–120 秒的 Lighthouse 任务。

默认只监听 `127.0.0.1`。当前版本没有账户、租户隔离、持久数据库或分布式队列。若开放给互联网使用，需要增加鉴权、按用户配额、独立检测 worker、隔离容器及网络出口规则。

已经实现的网络边界：

- 限制 URL scheme、账号信息与目标端口；拒绝私有、环回、链路本地、保留 IP。
- 服务端 HTML 请求对每次重定向重新校验 DNS，并把已校验地址固定到实际连接，避免二次 DNS 查询。
- 浏览器与 Lighthouse 的 HTTP / HTTPS 请求通过本机代理，代理逐连接校验并固定公开 IP；关闭 QUIC、禁用非代理 WebRTC UDP。
- 不在应用中嵌入目标 HTML；截图作为图片显示，Lighthouse HTML 强制附件下载。
- 请求体、页面内容、上下文、并发和 API 频率有上限；用户断开或取消会中断请求并清理浏览器。

这些是应用层限制，**不是浏览器漏洞或恶意页面的完整安全沙箱**。公开部署应在无敏感凭据、禁止访问内网的独立容器运行检测浏览器；不要简单把默认本机开发服务暴露到公网。

## 数据来源

- [Lighthouse](https://github.com/GoogleChrome/lighthouse)
- [Chrome UX Report API](https://developer.chrome.com/docs/crux/api)
- [Core Web Vitals 与实验室指标的区别](https://web.dev/articles/vitals)
- [AI SDK Agent 文档](https://ai-sdk.dev/docs/agents/building-agents)

## License

[MIT](LICENSE)
