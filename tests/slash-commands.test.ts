import { describe, expect, it } from 'vitest';
import { matchingCommands, prepareCommand, slashCommands } from '../src/slash-commands';

describe('Agent slash commands', () => {
  it('shows the command menu only for a leading slash query', () => {
    expect(matchingCommands('/')).toHaveLength(slashCommands.length);
    expect(matchingCommands('https://example.com/')).toEqual([]);
    expect(matchingCommands('请 / 总结')).toEqual([]);
    expect(matchingCommands('/翻译网页内容 英语')).toEqual([]);
  });
  it('filters Chinese command names and English aliases', () => {
    expect(matchingCommands('/翻译').map((c) => c.id)).toEqual(['translate']);
    expect(matchingCommands('/tech').map((c) => c.id)).toEqual(['tech']);
    expect(matchingCommands('/不存在')).toEqual([]);
  });
  it.each(['/翻译网页内容', '/翻译网页内容 [输入待翻译语言]'])(
    'requires an actual translation language: %s',
    (value) => {
      expect(prepareCommand(value).error).toContain('目标语言');
    },
  );
  it('converts a language argument into a translation prompt with scope constraints', () => {
    const result = prepareCommand('/翻译网页内容 Brazilian Portuguese');
    expect(result.error).toBeUndefined();
    expect(result.prompt).toContain('Brazilian Portuguese');
    expect(result.prompt).toContain('不得将节选说成全文');
    expect(result.requiresPage).toBe(true);
    expect(result.requiresModel).toBe(true);
  });
  it('requires a question and preserves multi-word question arguments', () => {
    expect(prepareCommand('/对网页内容提问').error).toBeTruthy();
    expect(prepareCommand('/对网页内容提问 What is the pricing?').prompt).toContain(
      'What is the pricing?',
    );
  });
  it('expands summary and technical analysis into evidence-grounded prompts', () => {
    expect(prepareCommand('/总结网页内容大纲').prompt).toContain('章节层级');
    expect(prepareCommand('/分析网站前端技术').prompt).toContain('置信度');
    expect(prepareCommand('/分析网站前端技术').requiresModel).toBe(false);
  });
  it('rejects unknown commands and unexpected arguments without sending raw commands', () => {
    expect(prepareCommand('/unknown').error).toBeTruthy();
    expect(prepareCommand('/总结网页内容大纲 unexpected').error).toBeTruthy();
    expect(prepareCommand('/').prompt).toBe('');
  });
  it('leaves ordinary chat and URLs unchanged', () => {
    expect(prepareCommand('请分析 https://example.com/foo/')).toEqual({
      prompt: '请分析 https://example.com/foo/',
    });
  });
});
