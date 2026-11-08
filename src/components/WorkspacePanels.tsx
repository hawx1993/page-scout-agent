import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Braces,
  Check,
  ChevronDown,
  Code2,
  Compass,
  FileText,
  Globe2,
  Link2,
  LoaderCircle,
  Monitor,
  Search,
  Smartphone,
  Zap,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { Audit, Check as CheckType, Report } from '../../shared/types';
const date = (iso: string) =>
  new Date(iso).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

export function PanelTitle({
  icon: Icon,
  title,
  aside,
}: {
  icon: typeof Globe2;
  title: string;
  aside?: string;
}) {
  return (
    <div className="panel-title">
      <div>
        <Icon size={16} />
        <h3>{title}</h3>
      </div>
      {aside && <span>{aside}</span>}
    </div>
  );
}
export function EmptyOverview({
  loading,
  onExample,
  disabled,
}: {
  loading: boolean;
  onExample: () => void;
  disabled: boolean;
}) {
  return (
    <>
      <div className="empty-scores">
        {['性能', '可访问性', '最佳实践', 'SEO'].map((label, i) => (
          <div key={label}>
            <div className={`empty-ring ring-${i}`}>
              <span>—</span>
            </div>
            <strong>{label}</strong>
            <small>等待真实检测</small>
          </div>
        ))}
      </div>
      <div className={`exploration-card ${loading ? 'is-scanning' : ''}`}>
        <div className="exploration-visual" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="orbit orbit-three" />
          <span className="orbit-satellite sat-one" />
          <span className="orbit-satellite sat-two" />
          <div className="visual-browser">
            <div className="visual-toolbar">
              <i />
              <i />
              <i />
              <span>the web, in focus</span>
            </div>
            <div className="visual-content">
              <div className="visual-side">
                <i />
                <i />
                <i />
              </div>
              <div className="visual-main">
                <div />
                <span />
                <span />
                <div className="visual-boxes">
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            </div>
            <div className="visual-cursor">
              <Compass size={27} fill="#bfe7ce" strokeWidth={1.2} />
            </div>
          </div>
          <span className="visual-tag tag-top">
            <Code2 size={13} /> 解读技术
          </span>
          <span className="visual-tag tag-bottom">
            <Activity size={13} /> 洞察体验
          </span>
        </div>
        <div className="exploration-copy">
          <span className="small-eyebrow">EVERY PAGE HAS A STORY</span>
          <h2>{loading ? '正在把网页，变成证据。' : '好奇一个网站？\n从这里开始。'}</h2>
          <p>
            {loading
              ? '抓取内容、观察资源、检查页面结构。\n每一项结论，都从真实页面出发。'
              : '粘贴公开网址，解读页面内容与技术实现。\n再用一次真实检测，发现值得改进的细节。'}
          </p>
          <button onClick={onExample} disabled={disabled}>
            {loading ? <LoaderCircle size={15} className="spin" /> : <Globe2 size={15} />}
            {loading ? '正在探索中…' : '用 example.com 试一试'}
            {!loading && <ArrowUpRight size={15} />}
          </button>
        </div>
      </div>
      <div className="capability-heading">
        <span>从一个网址，到完整理解</span>
        <span>FOUR WAYS TO EXPLORE</span>
      </div>
      <div className="capability-grid">
        {[
          {
            icon: FileText,
            title: '理解网页内容',
            text: '提取正文、检索段落，回答附带来源。',
            index: '01',
          },
          {
            icon: Braces,
            title: '解读技术实现',
            text: '发现框架与资源指纹，区分事实与推断。',
            index: '02',
          },
          {
            icon: Activity,
            title: '衡量真实体验',
            text: 'Lighthouse 实测，独立查询真实用户指标。',
            index: '03',
          },
          {
            icon: Search,
            title: '找到优化方向',
            text: 'SEO、可访问性与安全头，有据可查。',
            index: '04',
          },
        ].map(({ icon: Icon, title, text, index }) => (
          <article key={index}>
            <div>
              <Icon size={19} strokeWidth={1.6} />
              <span>{index}</span>
            </div>
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </div>
    </>
  );
}

export function ScoreBoard({
  audit,
  device,
  setDevice,
  busy,
  run,
  pending = false,
  failure = '',
}: {
  pending?: boolean;
  failure?: string;
  audit?: Audit;
  device: 'mobile' | 'desktop';
  setDevice: (value: 'mobile' | 'desktop') => void;
  busy: boolean;
  run: () => void;
}) {
  return (
    <section className="panel score-panel">
      <div className="score-heading">
        <div>
          <span className="small-eyebrow">LIGHTHOUSE AUDIT</span>
          <h3>让体验，有数可依。</h3>
        </div>
        <div className="device-switch" aria-label="检测设备">
          <button
            disabled={busy}
            className={device === 'mobile' ? 'selected' : ''}
            onClick={() => setDevice('mobile')}
          >
            <Smartphone size={13} />
            移动端
          </button>
          <button
            disabled={busy}
            className={device === 'desktop' ? 'selected' : ''}
            onClick={() => setDevice('desktop')}
          >
            <Monitor size={13} />
            桌面端
          </button>
        </div>
      </div>
      <div className="score-grid">
        {(
          [
            { key: 'performance', label: '性能' },
            { key: 'accessibility', label: '可访问性' },
            { key: 'best-practices', label: '最佳实践' },
            { key: 'seo', label: 'SEO' },
          ] as const
        ).map(({ key, label }) => {
          const score = audit?.scores[key] ?? null;
          return (
            <div key={key}>
              <ScoreRing value={score} />
              <strong>{label}</strong>
              <span>
                {score === null
                  ? pending
                    ? '正在检测…'
                    : failure
                      ? '未完成检测'
                      : '等待检测'
                  : score >= 90
                    ? '表现良好'
                    : score >= 50
                      ? '需要改进'
                      : '优先优化'}
              </span>
            </div>
          );
        })}
      </div>
      {!audit && failure && (
        <div className="notice" role="alert">
          Lighthouse 未完成：{failure} 页面内容仍可查看，请点击下方重试。
        </div>
      )}
      <div className="score-footer">
        <span>
          <span className="legend-dot good" />
          90–100 <span className="legend-dot average" />
          50–89 <span className="legend-dot poor" />
          0–49
        </span>
        <button className="text-button" onClick={run} disabled={busy || !!audit}>
          {audit ? (
            <>
              <Check size={13} /> 已实测 · {date(audit.measuredAt)}
            </>
          ) : (
            <>
              <Zap size={13} />
              {pending ? '检测中…' : failure ? '重试检测' : '运行真实检测'}
              <ArrowRight size={13} />
            </>
          )}
        </button>
      </div>
    </section>
  );
}
export function ScoreRing({ value }: { value: number | null }) {
  const color =
    value === null ? '#dce4e0' : value >= 90 ? '#24956a' : value >= 50 ? '#c17d24' : '#cf5d53';
  return (
    <div className="score-ring">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="43" fill="none" stroke="#edf0ec" strokeWidth="5" />
        <circle
          cx="50"
          cy="50"
          r="43"
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${value === null ? 0 : value * 2.702} 270.2`}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <strong style={{ color: value === null ? '#a2aaa5' : color }}>{value ?? '—'}</strong>
    </div>
  );
}
export function CheckList({ checks, compact = false }: { checks: CheckType[]; compact?: boolean }) {
  return (
    <div className={`check-list ${compact ? 'compact' : ''}`}>
      {checks.map((check) => (
        <details key={check.id}>
          <summary>
            <span className={`check-icon ${check.status}`}>
              {check.status === 'pass' ? <Check size={12} /> : <span>!</span>}
            </span>
            <span className="check-label">{check.title}</span>
            <span className={`check-status ${check.status}`}>
              {check.status === 'pass' ? '已通过' : check.status === 'fail' ? '需修复' : '建议检查'}
            </span>
            <ChevronDown size={13} />
          </summary>
          <div className="check-detail">
            <p>
              <strong>观测：</strong>
              {check.evidence}
            </p>
            <p>
              <strong>建议：</strong>
              {check.recommendation}
            </p>
          </div>
        </details>
      ))}
    </div>
  );
}

export function ContentPanel({ report }: { report: Report }) {
  return (
    <>
      <section className="panel">
        <PanelTitle
          icon={FileText}
          title="正文证据库"
          aside={`${report.evidence.length} 个可引用片段`}
        />
        <p className="panel-explanation">
          对话中的 [E1] 等标记对应下面的原文片段。当前范围仅包含此页面，不包含链接指向的页面。
        </p>
        <div className="evidence-list">
          {report.evidence.length ? (
            report.evidence.map((e) => (
              <article key={e.id} id={e.id}>
                <div>
                  <a href={`#${e.id}`}>[{e.id}]</a>
                  <h3>{e.heading}</h3>
                </div>
                <p>{e.text}</p>
                <a className="evidence-source" href={e.url} target="_blank" rel="noreferrer">
                  原网页 <ArrowUpRight size={11} />
                </a>
              </article>
            ))
          ) : (
            <div className="inner-empty">没有可提取正文，请检查网页是否依赖登录或阻止抓取。</div>
          )}
        </div>
      </section>
      <section className="panel">
        <PanelTitle
          icon={Link2}
          title="页面链接"
          aside={`${report.links.filter((l) => l.internal).length} 个站内 · ${report.links.filter((l) => !l.internal).length} 个外部`}
        />
        <div className="link-list">
          {report.links.slice(0, 40).map((link, i) => (
            <a key={i} href={link.url} target="_blank" rel="noreferrer">
              <span>{link.text}</span>
              <small>{link.internal ? '站内' : '外部'}</small>
              <ArrowUpRight size={13} />
            </a>
          ))}
        </div>
      </section>
    </>
  );
}

export function PerformancePanel({
  report,
  audit,
  busy,
  queryField,
}: {
  report: Report;
  audit?: Audit;
  busy: boolean;
  queryField: () => void;
}) {
  const field = report.fieldData;
  return (
    <>
      <section className="panel">
        <PanelTitle
          icon={Activity}
          title="实验室加载指标"
          aside={audit ? `Lighthouse ${audit.lighthouseVersion}` : '尚未检测'}
        />
        <div className="metric-grid">
          {(
            audit?.metrics ?? [
              { label: 'LCP', display: '—', score: null },
              { label: 'CLS', display: '—', score: null },
              { label: 'FCP', display: '—', score: null },
              { label: 'TBT', display: '—', score: null },
            ]
          ).map((m) => (
            <div key={m.label}>
              <span>
                {m.label}
                <span
                  className={`metric-dot ${m.score === null ? '' : m.score >= 0.9 ? 'good' : m.score >= 0.5 ? 'average' : 'poor'}`}
                />
              </span>
              <strong>{m.display}</strong>
              <small>
                {m.label === 'TBT'
                  ? '总阻塞时间，不等于 INP'
                  : m.label === 'LCP'
                    ? '最大内容绘制'
                    : m.label === 'CLS'
                      ? '累积布局偏移'
                      : m.label === 'FCP'
                        ? '首次内容绘制'
                        : '视觉加载速度'}
              </small>
            </div>
          ))}
        </div>
        {audit && <p className="panel-explanation">{audit.warnings.join(' ')}</p>}
      </section>
      <section className="panel">
        <PanelTitle icon={Globe2} title="Core Web Vitals" aside="真实用户 · CrUX · 移动端 p75" />
        <p className="panel-explanation">
          {field?.message ||
            '真实用户体验与实验室分数是两类数据。查询 CrUX，查看 LCP、INP、CLS 的真实用户分布。'}
        </p>
        {field?.metrics && (
          <div className="metric-grid field-metrics">
            {field.metrics.map((m) => (
              <div key={m.name}>
                <span>
                  {m.name}
                  <span
                    className={`metric-dot ${m.rating === 'good' ? 'good' : m.rating === 'poor' ? 'poor' : 'average'}`}
                  />
                </span>
                <strong>
                  {m.p75}
                  <small>{m.unit}</small>
                </strong>
                <small>
                  {m.rating === 'good' ? '良好' : m.rating === 'poor' ? '较差' : '需要改进'}
                </small>
              </div>
            ))}
          </div>
        )}
        {field?.period && (
          <div className="field-period">
            {field.scope === 'origin' ? '整个来源' : '当前 URL'} · PHONE · {field.period}
          </div>
        )}
        <button className="outline-button" disabled={busy} onClick={queryField}>
          <Globe2 size={14} />
          {field ? '再次查询真实用户数据' : '查询真实用户指标'}
          <ArrowRight size={13} />
        </button>
      </section>
      {audit && (
        <section className="panel">
          <PanelTitle
            icon={Zap}
            title="值得优先改进"
            aside={`${audit.findings.length} 个检测发现`}
          />
          <div className="audit-findings">
            {audit.findings.length ? (
              audit.findings.map((f) => (
                <details key={f.id}>
                  <summary>
                    <span className="finding-dot" />
                    <strong>{f.title}</strong>
                    {f.display && <span>{f.display}</span>}
                    <ChevronDown size={13} />
                  </summary>
                  <div className="markdown">
                    <ReactMarkdown
                      components={{
                        a: ({ href, children }) => (
                          <a href={href} target="_blank" rel="noreferrer">
                            {children}
                          </a>
                        ),
                      }}
                    >
                      {f.description}
                    </ReactMarkdown>
                    <small>
                      {f.category} · {f.id}
                    </small>
                  </div>
                </details>
              ))
            ) : (
              <p className="muted-text">本次自动检测没有发现需改进的计分项目，仍建议人工检查。</p>
            )}
          </div>
          <div className="raw-downloads">
            <a href={`/api/reports/${report.id}/lighthouse/${audit.device}`}>
              <ArrowDownToLine size={14} />
              完整 HTML 报告
            </a>
            <a href={`/api/reports/${report.id}/lighthouse/${audit.device}?format=json`}>
              <Braces size={14} />
              原始 JSON
            </a>
          </div>
        </section>
      )}
    </>
  );
}
