export const slashCommands = [
  {
    id: 'outline',
    name: '总结网页内容大纲',
    description: '提炼主题、章节层级与关键结论',
    argument: '',
    requiresModel: true,
  },
  {
    id: 'tech',
    name: '分析网站前端技术',
    description: '分析框架、构建工具及技术证据',
    argument: '',
    requiresModel: false,
  },
  {
    id: 'translate',
    name: '翻译网页内容',
    description: '翻译当前网页，保留标题层级与引用',
    argument: '目标语言，例如：英语、日语',
    requiresModel: true,
  },
  {
    id: 'question',
    name: '对网页内容提问',
    description: '基于当前页面原文回答你的问题',
    argument: '输入你想问的问题',
    requiresModel: true,
  },
  {
    id: 'performance',
    name: '检测网页性能',
    description: '运行 Lighthouse 并解释性能瓶颈',
    argument: '',
    requiresModel: false,
  },
  {
    id: 'seo',
    name: '分析网页SEO',
    description: '查看做得好的项目与优化建议',
    argument: '',
    requiresModel: false,
  },
] as const;
export type SlashCommand = (typeof slashCommands)[number];
export function matchingCommands(value: string): SlashCommand[] {
  const match = value.match(/^\/([^\s]*)$/);
  if (!match) return [];
  const query = match[1].toLowerCase();
  return slashCommands.filter((command) =>
    `${command.name} ${command.id}`.toLowerCase().includes(query),
  );
}
export function prepareCommand(value: string): {
  prompt: string;
  error?: string;
  requiresPage?: boolean;
  requiresModel?: boolean;
} {
  const text = value.trim();
  if (!text.startsWith('/')) return { prompt: text };
  const [name, ...rest] = text.slice(1).split(/\s+/);
  const command = slashCommands.find((c) => c.name === name || c.id === name);
  if (!command)
    return { prompt: '', error: '未知快捷命令。输入 / 查看可用命令，或去掉 / 作为普通问题发送。' };
  const argument = rest.join(' ').trim();
  if (command.argument && (!argument || /^\[.*\]$/.test(argument)))
    return {
      prompt: '',
      error:
        command.id === 'translate'
          ? '请在命令后输入目标语言，例如：/翻译网页内容 英语'
          : '请在命令后输入你的问题。',
    };
  if (!command.argument && argument)
    return {
      prompt: '',
      error: '此命令无需参数，请删除命令后的文字，或使用普通对话提出附加要求。',
    };
  const prompts: Record<SlashCommand['id'], string> = {
    outline:
      '请读取当前网页正文，总结网页内容大纲：包含主题、按标题组织的章节层级、每节要点和关键结论，引用对应的原文证据编号。不要把未读取的链接内容当作已知。',
    tech: '请分析当前网站的前端技术，包括 UI 框架、应用框架、构建工具、样式方案、脚本与资源。逐项给出观测证据和置信度，无法确认的技术或版本请说明。',
    translate: `请将当前网页正文翻译为「${argument}」。先读取正文，按原文顺序保留标题层级、代码、链接和证据编号。若正文过长无法一次完整翻译，请明确标注本次覆盖的范围及未翻译部分，不得将节选说成全文。`,
    question: `请基于当前网页正文回答以下问题，引用原文证据编号。没有证据时说明无法确认。\n\n${argument}`,
    performance:
      '请运行当前网页的移动端 Lighthouse 检测，说明性能分数、LCP、CLS、TBT 和优先优化事项，区分实验室指标与真实用户 Core Web Vitals。',
    seo: '请分析当前网页的 SEO，说明哪些方面做得好、哪些需要改进，并给出证据与优化建议。基础检查通过数不要当作 Lighthouse SEO 分数或排名预测。',
  };
  return { prompt: prompts[command.id], requiresPage: true, requiresModel: command.requiresModel };
}
