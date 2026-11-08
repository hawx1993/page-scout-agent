import { describe, expect, it } from 'vitest';
import { searchEvidence, extractReport } from '../server/analyze.js';
import { fixtureReport } from './fixtures.js';

describe('evidence-based extraction', () => {
  it('extracts current-page evidence and excludes scripts and hidden content', () => {
    const report = fixtureReport();
    expect(report.title).toBe('开源组件工坊');
    expect(report.description).toContain('React');
    expect(report.evidence.map((e) => e.text).join(' ')).not.toMatch(/secretScript|隐藏内容/);
    expect(report.evidence.every((e) => e.url === report.url)).toBe(true);
    expect(new Set(report.evidence.map((e) => e.id)).size).toBe(report.evidence.length);
  });
  it('retrieves the relevant citation without generating facts', () => {
    const results = searchEvidence(fixtureReport(), '许可 定价');
    expect(results[0]?.heading).toBe('许可与定价');
    expect(results[0]?.text).toContain('MIT');
  });
  it('distinguishes direct Next.js evidence from inferred React', () => {
    const technologies = fixtureReport().technologies;
    expect(technologies.find((t) => t.name === 'Next.js')?.confidence).toBe('high');
    expect(technologies.find((t) => t.name === 'React')?.confidence).toBe('medium');
    expect(technologies.some((t) => /postgres|mysql|mongodb/i.test(t.name))).toBe(false);
  });
  it('does not fabricate Lighthouse or real-user scores', () => {
    const report = fixtureReport();
    expect(report.audits).toEqual({});
    expect(report.fieldData).toBeUndefined();
  });
  it('treats decorative empty alt as present and flags only missing attributes', () => {
    expect(fixtureReport().resources.imagesWithoutAlt).toBe(1);
  });
  it('deduplicates links and filters script URLs', () => {
    const links = fixtureReport().links;
    expect(links.filter((l) => l.url === 'https://example.com/docs')).toHaveLength(1);
    expect(links.some((l) => l.url.startsWith('javascript:'))).toBe(false);
  });
  it('flags noindex in HTTP response headers', () => {
    const report = extractReport({
      html: '<html><head><title>Test</title></head><body><h1>Hi</h1></body></html>',
      headers: { 'x-robots-tag': 'noindex' },
      url: 'https://example.com/',
      requestedUrl: 'https://example.com/',
      mode: 'html',
      status: 200,
      warnings: [],
    });
    expect(report.seo.find((c) => c.id === 'robots')?.status).toBe('warn');
  });
  it('does not classify arbitrary content mentions as framework fingerprints', () => {
    const report = extractReport({
      html: '<html><body><p>I compare React, Next.js and Vue.</p></body></html>',
      headers: {},
      url: 'https://example.com/',
      requestedUrl: 'https://example.com/',
      mode: 'html',
      status: 200,
      warnings: [],
    });
    expect(report.technologies).toEqual([]);
  });
});
