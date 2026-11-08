# Contributing

感谢参与 page scout agent。欢迎报告问题、改进规则、增加可验证的技术指纹或完善文档。

1. 使用 Node.js 22.19+，执行 `npm ci`。
2. 准备 Chrome / Chromium，然后 `npm run dev`。
3. 为涉及解析、网络边界或工具行为的变更加入有意义的测试。
4. 提交前执行 `npm test` 和 `npm run build`。

报告问题请附公开 URL、重现步骤、浏览器版本、检测时间与错误提示。不要提交 API Key、Cookie、私有网页内容或个人信息。

新增检测规则应明确说明证据、置信度和限制。不要把框架猜测、启发式 SEO 检查或缺失指标呈现为确定事实。
