# 产品截图与体验记录

[返回产品说明](../../README.md)

截图采集于 2026-11-08，目标页面为 `https://vite.dev/guide/`，通过本机 page scout agent 的真实界面操作产生。使用 Chrome 原生全屏隐藏浏览器工具栏，保留产品界面；图片没有替换分数、模型回答或页面内容。

| 文件                       | 实际操作与观察                                                             |
| -------------------------- | -------------------------------------------------------------------------- |
| 01-analysis-running.jpg    | 在 URL 输入框填写 Vite 文档地址，点击开始分析，看到渲染进度                |
| 02-overview.jpg            | 自动评分完成，移动端 57 / 99 / 92 / 100，11 段内容证据                     |
| 03-slash-menu.jpg          | 点击输入框下方 / 按钮，打开快捷菜单                                        |
| 04-technology.jpg          | 切换技术栈，查看 VitePress Generator、Netlify 响应头与 Tailwind 启发式推断 |
| 05-agent-summary.jpg       | 在输入框选择总结命令并发送，DeepSeek 返回带引用的实际回答                  |
| 06-seo.jpg                 | 打开 SEO，展开图片 alt 检查，看到 26 张图片中 1 张未声明 alt               |
| 07-performance.jpg         | 查看加载指标，并点击 CrUX 查询；环境未配置 Key，界面显示不可用原因         |
| 08-content-evidence.jpg    | 点击回答中的 E1 引用，左侧切到正文证据库                                   |
| 09-overview-with-agent.jpg | 返回概览，展示评分、网页快照和实际 Agent 回答                              |

实际点击导出按钮后下载了 `sitelens-vite.dev.md`。仓库保存其[检测章节节选](../examples/vite-guide-audit.md)，未把用户的下载目录路径写入公开说明。

本次未测试所有模型、翻译语言或桌面评分，也未获取 CrUX 真实用户数据。分数仅表示截图时本机的单次 Lighthouse 实验室运行。截图中没有显示 API Key，也没有包含浏览器其他标签页的内容。
