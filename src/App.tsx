import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Braces,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Clock3,
  Code2,
  Compass,
  ExternalLink,
  FileText,
  Globe2,
  Layers3,
  Link2,
  LoaderCircle,
  Menu,
  MessageSquareText,
  Monitor,
  Plus,
  Radar,
  Search,
  ShieldCheck,
  Settings2,
  Sparkles,
  Square,
  X,
  Zap,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { ChatMessage, Report, StreamEvent } from '../shared/types';
import { analyzeAndAudit, download, exportReport, requestStream } from './lib';
import {
  CheckList,
  ContentPanel,
  EmptyOverview,
  PanelTitle,
  PerformancePanel,
  ScoreBoard,
} from './components/WorkspacePanels';
import { loadModelSettings, saveModelSettings, type ModelSettings } from './model-settings';
import { providers } from '../shared/models';
import { ModelSettingsModal } from './components/ModelSettings';
import { HelpModal } from './components/HelpModal';

type Tab = 'overview' | 'content' | 'performance' | 'seo' | 'tech' | 'security';
type HistoryItem = { url: string; title: string; time: string };
type ToolEvent = { name: string; status: 'running' | 'done' | 'error'; detail: string };
const navigation = [
  { id: 'overview', label: '分析概览', icon: Compass },
  { id: 'content', label: '网页内容', icon: FileText },
  { id: 'performance', label: '性能与体验', icon: Activity },
  { id: 'seo', label: 'SEO 洞察', icon: Search },
  { id: 'tech', label: '技术栈', icon: Braces },
  { id: 'security', label: '安全与规范', icon: ShieldCheck },
] as const;
const suggestions = [
  { icon: FileText, label: '这个网页主要讲了什么？', tag: '内容理解' },
  { icon: Code2, label: '网站使用了哪些技术栈？', tag: '技术分析' },
  { icon: Zap, label: '运行 Lighthouse，分析性能评分', tag: '性能诊断' },
  { icon: Search, label: 'SEO 哪些方面做得好，哪些需要改进？', tag: '搜索优化' },
];
function loadHistory(): HistoryItem[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem('sitelens.history.v1') || '[]');
    return Array.isArray(value)
      ? value
          .filter(
            (x): x is HistoryItem =>
              typeof x?.url === 'string' &&
              typeof x?.title === 'string' &&
              typeof x?.time === 'string',
          )
          .slice(0, 8)
      : [];
  } catch {
    return [];
  }
}
const date = (iso: string) =>
  new Date(iso).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

export default function App() {
  const [tab, setTab] = useState<Tab>('overview');
  const [url, setUrl] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>(loadHistory);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<'analyze' | 'chat' | 'audit' | null>(null);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [auditFailure, setAuditFailure] = useState('');
  const [tools, setTools] = useState<ToolEvent[]>([]);
  const [device, setDevice] = useState<'mobile' | 'desktop'>('mobile');
  const [serverAi, setAi] = useState(false);
  const [modelSettings, setModelSettings] = useState<ModelSettings>(loadModelSettings);
  const [showModels, setShowModels] = useState(false);
  const selectedProfile =
    modelSettings.active === 'server' ? undefined : modelSettings.profiles[modelSettings.active];
  const ai =
    modelSettings.active === 'server'
      ? serverAi
      : Boolean(selectedProfile?.apiKey && selectedProfile.model);
  function updateModels(next: ModelSettings) {
    saveModelSettings(next);
    setModelSettings(next);
  }
  const [connected, setConnected] = useState(false);
  const [help, setHelp] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [citation, setCitation] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const active = useRef(false);
  const chatBottom = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const audit = report?.audits[device];
  useEffect(() => {
    if (citation && tab === 'content')
      document.getElementById(citation)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [citation, tab]);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/health', { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        setAi(data.ai);
        setConnected(true);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    chatBottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, tools]);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    if (!help) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHelp(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [help]);

  function handleReport(next: Report) {
    setReport(next);
    setHistory((items) => {
      const nextItems = [
        { url: next.url, title: next.title, time: next.analyzedAt },
        ...items.filter((i) => i.url !== next.url),
      ].slice(0, 8);
      try {
        localStorage.setItem('sitelens.history.v1', JSON.stringify(nextItems));
      } catch {
        /* Browsing history is optional. */
      }
      return nextItems;
    });
  }
  async function execute(
    kind: 'analyze' | 'chat' | 'audit',
    endpoint: string,
    body: unknown,
    onEvent?: (event: StreamEvent) => void,
  ) {
    if (active.current) return;
    active.current = true;
    setBusy(kind);
    if (kind !== 'chat') setAuditFailure('');
    setError('');
    setTools([]);
    const controller = new AbortController();
    abort.current = controller;
    try {
      const receive = (event: StreamEvent) => {
        if (event.type === 'progress') setProgress(event.message);
        if (event.type === 'report') handleReport(event.report);
        if (event.type === 'tool')
          setTools((items) => [...items.filter((t) => t.name !== event.name), event]);
        onEvent?.(event);
      };
      if (kind === 'analyze')
        await analyzeAndAudit((body as { url: string }).url, device, controller.signal, receive);
      else await requestStream(endpoint, body, controller.signal, receive);
    } catch (err) {
      if (kind !== 'chat')
        setAuditFailure(
          controller.signal.aborted
            ? '检测已停止，可重试。'
            : err instanceof Error
              ? err.message
              : 'Lighthouse 检测失败，请重试。',
        );
      if (controller.signal.aborted) setProgress('任务已停止。已完成的检测结果仍可查看。');
      else setError(err instanceof Error ? err.message : '连接失败，请重试。');
    } finally {
      active.current = false;
      setBusy(null);
      abort.current = null;
    }
  }
  async function startAnalysis(value = url) {
    if (active.current || !value.trim()) return;
    setUrl(value);
    setReport(null);
    setMessages([]);
    setTab('overview');
    setProgress('准备分析网页…');
    setSidebar(false);
    await execute('analyze', '/api/analyze', { url: value.trim() });
  }
  async function ask(question = draft) {
    if (active.current || !question.trim()) return;
    if ((!ai && !report) || (modelSettings.active !== 'server' && !selectedProfile?.apiKey)) {
      setShowModels(true);
      return;
    }
    setChatOpen(true);
    setDraft('');
    const user: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: question.trim() };
    const assistantId = crypto.randomUUID();
    const conversation = [...messages, user].slice(-25);
    setMessages([...conversation, { id: assistantId, role: 'assistant', content: '' }]);
    await execute(
      'chat',
      '/api/chat',
      {
        reportId: report?.id,
        messages: conversation,
        modelConfig: selectedProfile?.apiKey ? selectedProfile : undefined,
      },
      (event) => {
        if (event.type === 'text')
          setMessages((items) =>
            items.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + event.text } : m,
            ),
          );
      },
    );
    setMessages((items) =>
      items.map((m) =>
        m.id === assistantId && !m.content
          ? { ...m, content: '本轮没有返回文字结果，请查看工具状态与错误提示后重试。' }
          : m,
      ),
    );
  }
  async function runAudit(kind: 'lighthouse' | 'field' = 'lighthouse', targetDevice = device) {
    if (!report || active.current) return;
    setProgress(kind === 'field' ? '查询真实用户数据…' : '启动 Lighthouse…');
    await execute('audit', '/api/audit', { reportId: report.id, device: targetDevice, kind });
  }
  function reset() {
    if (active.current) return;
    setReport(null);
    setUrl('');
    setMessages([]);
    setError('');
    setTab('overview');
    setProgress('');
    setTools([]);
    inputRef.current?.focus();
  }
  function submitUrl(e: FormEvent) {
    e.preventDefault();
    void startAnalysis();
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebar ? 'is-open' : ''}`} aria-label="主导航">
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            reset();
          }}
        >
          <span className="brand-mark">
            <Radar size={25} strokeWidth={1.7} />
          </span>
          SiteLens<span className="brand-dot">®</span>
        </a>
        <div className="workspace-label">YOUR WEB, UNDERSTOOD.</div>
        <button className="new-analysis" onClick={reset} disabled={!!busy}>
          <Plus size={17} /> 新建网页分析 <span>↗</span>
        </button>
        <div className="nav-caption">工作空间</div>
        <nav>
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${tab === id ? 'active' : ''}`}
              onClick={() => {
                setTab(id);
                setSidebar(false);
              }}
              aria-current={tab === id ? 'page' : undefined}
            >
              <Icon size={18} />
              <span>{label}</span>
              {tab === id && <span className="nav-active-dot" />}
            </button>
          ))}
        </nav>
        <div className="history-heading">
          <span className="nav-caption">最近分析</span>
          {history.length > 0 && (
            <button
              className="subtle-button"
              onClick={() => {
                setHistory([]);
                localStorage.removeItem('sitelens.history.v1');
              }}
              title="清除本机历史"
            >
              清除
            </button>
          )}
        </div>
        <div className="history-list">
          {history.length ? (
            history.map((item) => (
              <button
                key={item.url}
                disabled={!!busy}
                onClick={() => void startAnalysis(item.url)}
                title={`${item.title}\n${item.url}`}
              >
                <Globe2 size={14} />
                <span>{new URL(item.url).hostname}</span>
                <ChevronRight size={12} />
              </button>
            ))
          ) : (
            <div className="history-empty">
              <Clock3 size={15} />
              <span>你的探索，从一个网址开始</span>
            </div>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="local-note">
            <span className="tiny-orbit" />
            <div>
              <strong>为好奇心而构建</strong>
              <p>公开网页 · 真实证据 · 开源</p>
            </div>
          </div>
          <button className="sidebar-help" disabled={!!busy} onClick={() => setShowModels(true)}>
            <Settings2 size={16} /> 模型与 API Key <ArrowUpRight size={14} />
          </button>
          <button className="sidebar-help" onClick={() => setHelp(true)}>
            <BookOpen size={16} /> 使用说明 <ArrowUpRight size={14} />
          </button>
          <div className="sidebar-footer">
            <span className={`status-dot ${connected ? '' : 'offline'}`} />
            {connected ? '本地服务已连接' : '正在连接服务…'}
            <span>v0.1.0</span>
          </div>
        </div>
      </aside>
      {sidebar && (
        <button
          className="sidebar-backdrop"
          aria-label="关闭导航"
          onClick={() => setSidebar(false)}
        />
      )}
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="展开导航"
              onClick={() => setSidebar(true)}
            >
              <Menu size={20} />
            </button>
            <span>工作空间</span>
            <ChevronRight size={13} />
            <strong>{navigation.find((n) => n.id === tab)?.label}</strong>
          </div>
          <div className="topbar-right">
            <span className="open-source">
              <span />
              OPEN SOURCE
            </span>
            <button className="help-button" onClick={() => setHelp(true)}>
              <CircleHelp size={16} />
              <span>使用指南</span>
            </button>
            <span className="avatar">SL</span>
          </div>
        </header>
        <div className="page-heading">
          <div>
            <div className="eyebrow">
              <span /> A LITTLE CURIOSITY. A LOT OF CLARITY.
            </div>
            <h1>{report ? '看见网页，更看懂网页。' : '让每个网页，都经得起追问。'}</h1>
            <p>从内容到代码，从体验到搜索。一个网址，开启一次深入探索。</p>
          </div>
          <div className="heading-stamp">
            <Globe2 size={36} strokeWidth={1} />
            <span>
              THE WEB
              <br />
              IN FOCUS.
            </span>
          </div>
        </div>
        <form className={`url-form ${busy === 'analyze' ? 'analyzing' : ''}`} onSubmit={submitUrl}>
          <span className="url-icon">
            <Link2 size={20} />
          </span>
          <label className="sr-only" htmlFor="website-url">
            要分析的网页 URL
          </label>
          <input
            id="website-url"
            ref={inputRef}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="粘贴一个网址，例如 https://example.com"
            autoComplete="url"
            spellCheck={false}
            disabled={!!busy}
          />
          <span className="url-protocol">PUBLIC WEB</span>
          <button type="submit" disabled={!!busy || !url.trim()}>
            {busy === 'analyze' ? <LoaderCircle size={17} className="spin" /> : <Radar size={17} />}
            <span>{busy === 'analyze' ? '分析中' : '开始分析'}</span>
            <ArrowRight size={16} />
          </button>
        </form>
        <div className="below-url">
          <span>
            <ShieldCheck size={12} /> 仅访问公开网页，无需网站授权或埋点
          </span>
          <button disabled={!!busy} onClick={() => void startAnalysis('https://example.com')}>
            试试 example.com <ArrowUpRight size={12} />
          </button>
        </div>
        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button className="icon-button" onClick={() => setError('')} aria-label="关闭错误">
              <X size={15} />
            </button>
          </div>
        )}
        {busy && (
          <div className="progress-banner" role="status">
            <LoaderCircle size={15} className="spin" />
            <span>
              {busy === 'chat'
                ? tools.find((t) => t.status === 'running')?.detail || '正在整理网页证据…'
                : progress}
            </span>
            <button onClick={() => abort.current?.abort()}>
              <Square size={11} /> 停止
            </button>
          </div>
        )}
        <div className="workbench">
          <main className="analysis-pane" aria-label="分析结果">
            <div className="pane-heading">
              <div className="section-title">
                <span className="section-number">01</span>
                <h2>{report ? report.title : '网页观察台'}</h2>
                {report && (
                  <span className="live-badge">
                    <span /> 已分析
                  </span>
                )}
              </div>
              <button
                className="text-button"
                disabled={!report}
                onClick={() => report && exportReport(report)}
              >
                <ArrowDownToLine size={14} /> 导出报告
              </button>
            </div>
            {report && (
              <div className="report-meta">
                <a href={report.url} target="_blank" rel="noreferrer">
                  {new URL(report.url).hostname}
                  {new URL(report.url).pathname !== '/' ? new URL(report.url).pathname : ''}
                  <ExternalLink size={11} />
                </a>
                <span>
                  {date(report.analyzedAt)} ·{' '}
                  {report.mode === 'rendered' ? '浏览器渲染' : 'HTML 快照'} · HTTP{' '}
                  {report.statusCode}
                </span>
              </div>
            )}
            {report?.warnings.map((warning, i) => (
              <div className="notice" key={i}>
                {warning}
              </div>
            ))}
            {!report ? (
              <EmptyOverview
                loading={busy === 'analyze'}
                onExample={() => void startAnalysis('https://example.com')}
                disabled={!!busy}
              />
            ) : (
              <>
                {tab === 'overview' && (
                  <>
                    <ScoreBoard
                      pending={(busy === 'analyze' || busy === 'audit') && !audit}
                      failure={auditFailure}
                      audit={audit}
                      device={device}
                      setDevice={(next) => {
                        setDevice(next);
                        if (report && !report.audits[next]) void runAudit('lighthouse', next);
                      }}
                      busy={!!busy}
                      run={() => void runAudit()}
                    />
                    <div className="overview-grid">
                      <section className="panel snapshot-panel">
                        <PanelTitle icon={Monitor} title="页面快照" aside="DESKTOP" />
                        <div className="browser-chrome">
                          <i />
                          <i />
                          <i />
                          <span>{new URL(report.url).hostname}</span>
                        </div>
                        {report.screenshot ? (
                          <a
                            href={report.url}
                            target="_blank"
                            rel="noreferrer"
                            className="screenshot-link"
                          >
                            <img src={report.screenshot} alt={`${report.title} 桌面端页面截图`} />
                          </a>
                        ) : (
                          <div className="no-screenshot">
                            <Monitor size={25} />
                            仅提取到 HTML，无浏览器截图
                          </div>
                        )}
                      </section>
                      <section className="panel summary-panel">
                        <PanelTitle icon={FileText} title="页面速览" />
                        <p className="summary-description">
                          {report.description ||
                            report.evidence[0]?.text.slice(0, 180) ||
                            '该网页未提供描述或可提取正文。'}
                        </p>
                        <div className="page-facts">
                          <div>
                            <span>正文规模</span>
                            <strong>
                              {report.wordCount.toLocaleString()} <small>字 / 词</small>
                            </strong>
                          </div>
                          <div>
                            <span>标题 / 链接</span>
                            <strong>
                              {report.headings.length} <small>/ {report.links.length}</small>
                            </strong>
                          </div>
                          <div>
                            <span>页面语言</span>
                            <strong>{report.language}</strong>
                          </div>
                          <div>
                            <span>内容证据</span>
                            <strong>
                              {report.evidence.length} <small>段</small>
                            </strong>
                          </div>
                        </div>
                        <button className="text-button" onClick={() => setTab('content')}>
                          探索网页内容 <ArrowRight size={14} />
                        </button>
                      </section>
                    </div>
                    <section className="panel">
                      <PanelTitle icon={Braces} title="技术雷达" aside="有据可查的技术线索" />
                      {report.technologies.length ? (
                        <div className="tech-chips">
                          {report.technologies.slice(0, 8).map((tech, i) => (
                            <button key={i} onClick={() => setTab('tech')} title={tech.evidence}>
                              <Code2 size={15} />
                              {tech.name}
                              <span>{tech.confidence === 'high' ? '已观测' : '推断'}</span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="muted-text">未发现可靠指纹。技术实现可能被构建或代理隐藏。</p>
                      )}
                    </section>
                    <section className="panel">
                      <PanelTitle
                        icon={Search}
                        title="SEO 快速洞察"
                        aside={`${report.seo.filter((c) => c.status === 'pass').length} / ${report.seo.length} 项基础检查通过`}
                      />
                      <CheckList checks={report.seo.slice(0, 4)} compact />
                      <button className="text-button full-width-link" onClick={() => setTab('seo')}>
                        查看全部 SEO 检查 <ArrowRight size={14} />
                      </button>
                    </section>
                  </>
                )}
                {tab === 'content' && <ContentPanel report={report} />}
                {tab === 'performance' && (
                  <>
                    <ScoreBoard
                      pending={(busy === 'analyze' || busy === 'audit') && !audit}
                      failure={auditFailure}
                      audit={audit}
                      device={device}
                      setDevice={(next) => {
                        setDevice(next);
                        if (report && !report.audits[next]) void runAudit('lighthouse', next);
                      }}
                      busy={!!busy}
                      run={() => void runAudit()}
                    />
                    <PerformancePanel
                      report={report}
                      audit={audit}
                      busy={!!busy}
                      queryField={() => void runAudit('field')}
                    />
                  </>
                )}
                {tab === 'seo' && (
                  <>
                    <section className="panel">
                      <PanelTitle
                        icon={Search}
                        title="SEO 基础检查"
                        aside="当前页面 · 非排名预测"
                      />
                      <div className="seo-intro">
                        <div className="check-fraction">
                          {report.seo.filter((c) => c.status === 'pass').length}
                          <span> / {report.seo.length}</span>
                        </div>
                        <div>
                          <strong>项基础检查通过</strong>
                          <p>标签、内容结构与可发现性线索。Lighthouse SEO 评分请单独运行检测。</p>
                        </div>
                      </div>
                      <CheckList checks={report.seo} />
                    </section>
                    <section className="panel">
                      <PanelTitle icon={Layers3} title="页面标题层级" />
                      <div className="heading-tree">
                        {report.headings.length ? (
                          report.headings.map((h, i) => (
                            <div key={i} style={{ paddingLeft: (h.level - 1) * 14 }}>
                              <span>H{h.level}</span>
                              {h.text}
                            </div>
                          ))
                        ) : (
                          <p className="muted-text">未发现标题元素。</p>
                        )}
                      </div>
                    </section>
                  </>
                )}
                {tab === 'tech' && (
                  <section className="panel">
                    <PanelTitle
                      icon={Braces}
                      title="技术栈与观测证据"
                      aside="指纹识别 ≠ 完整源码分析"
                    />
                    {report.technologies.length ? (
                      <div className="technology-list">
                        {report.technologies.map((t, i) => (
                          <article key={i}>
                            <div className="technology-symbol">
                              <Code2 size={20} />
                            </div>
                            <div>
                              <div className="technology-name">
                                <h3>{t.name}</h3>
                                <span className={`confidence ${t.confidence}`}>
                                  {t.confidence === 'high' ? '高置信度' : '可能使用'}
                                </span>
                              </div>
                              <span className="small-label">{t.category}</span>
                              <code>{t.evidence}</code>
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className="inner-empty">
                        <Braces size={30} />
                        <h3>没有足够可靠的技术指纹</h3>
                        <p>生产构建可能隐藏框架信息。我们不会据此猜测后端、数据库或版本。</p>
                      </div>
                    )}
                    <div className="resource-summary">
                      {[
                        ['外部脚本', report.resources.scripts],
                        ['样式表', report.resources.styles],
                        ['图片', report.resources.images],
                      ].map(([label, count]) => (
                        <div key={label}>
                          <strong>{count}</strong>
                          <span>{label}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
                {tab === 'security' && (
                  <section className="panel">
                    <PanelTitle icon={ShieldCheck} title="安全与响应头" aside="基础声明检查" />
                    <p className="panel-explanation">
                      检查当前最终 HTML 响应的 HTTPS
                      与常用安全头。未声明不等于存在漏洞，已声明也不代表配置完整有效。
                    </p>
                    <CheckList checks={report.security} />
                  </section>
                )}
                <div className="data-footnote">
                  <ShieldCheck size={12} />
                  <span>
                    结果来自 {date(report.analyzedAt)} 的单页快照。检测有边界，结论有来源。
                  </span>
                  <button
                    onClick={() =>
                      download(
                        'sitelens-report.json',
                        JSON.stringify(report, null, 2),
                        'application/json',
                      )
                    }
                  >
                    JSON <ArrowDownToLine size={11} />
                  </button>
                </div>
              </>
            )}
          </main>
          <aside className={`chat-pane ${chatOpen ? 'chat-open' : ''}`} aria-label="网页对话">
            <div className="chat-header">
              <div>
                <span className="assistant-icon">
                  <Sparkles size={16} />
                </span>
                <strong>与 Agent 对话</strong>
              </div>
              <div>
                <span className={`mode-badge ${ai ? 'ai-enabled' : ''}`}>
                  <span />
                  {ai ? 'AGENT' : '证据模式'}
                </span>
                <button
                  className="icon-button close-chat"
                  aria-label="关闭对话"
                  onClick={() => setChatOpen(false)}
                >
                  <X size={17} />
                </button>
              </div>
            </div>
            <div className="chat-model-picker">
              <select
                aria-label="对话模型"
                disabled={!!busy}
                value={modelSettings.active}
                onChange={(e) => {
                  const active = e.target.value as ModelSettings['active'];
                  updateModels({ ...modelSettings, active });
                  if (active !== 'server' && !modelSettings.profiles[active]?.apiKey)
                    setShowModels(true);
                }}
              >
                <option value="server">服务端默认{serverAi ? '' : '（未配置）'}</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {modelSettings.profiles[p.id]?.model
                      ? ` · ${modelSettings.profiles[p.id]!.model}`
                      : ' · 待配置'}
                  </option>
                ))}
              </select>
              <button
                className="icon-button"
                onClick={() => setShowModels(true)}
                disabled={!!busy}
                aria-label="模型设置"
              >
                <Settings2 size={16} />
              </button>
            </div>
            <div className="chat-context">
              <Globe2 size={13} />
              <span>{report ? new URL(report.url).hostname : '自由对话 · 可直接发送网址'}</span>
              {report && <CheckCheck size={13} />}
            </div>
            <div className="chat-body">
              {!messages.length && (
                <div className="chat-welcome">
                  <span className="welcome-orbit">
                    <Sparkles size={25} strokeWidth={1.5} />
                  </span>
                  <h2>
                    不止看见，
                    <br />
                    <span>还可以追问。</span>
                  </h2>
                  <p>
                    内容、技术、性能、SEO…
                    <br />
                    把你的好奇，交给 SiteLens。
                  </p>
                  <div className="suggestion-list">
                    {suggestions.map(({ icon: Icon, label, tag }) => (
                      <button key={label} disabled={!!busy} onClick={() => void ask(label)}>
                        <span>
                          <Icon size={16} />
                          <small>{tag}</small>
                        </span>
                        <strong>{label}</strong>
                        <ArrowUpRight size={14} />
                      </button>
                    ))}
                  </div>
                  <div className="welcome-note">
                    <ShieldCheck size={12} /> 基于网页证据回答，未知内容如实说明
                  </div>
                </div>
              )}
              {messages.map((message) => (
                <article key={message.id} className={`message ${message.role}`}>
                  <div className="message-role">
                    {message.role === 'assistant' ? (
                      <>
                        <Sparkles size={13} /> SiteLens
                      </>
                    ) : (
                      '你'
                    )}
                  </div>
                  {message.content ? (
                    <div className="markdown">
                      <ReactMarkdown
                        components={{
                          a: ({ children, href }) => (
                            <a
                              href={href}
                              target={href?.startsWith('#E') ? undefined : '_blank'}
                              rel="noreferrer"
                              onClick={(e) => {
                                if (href && /^#E\d+$/.test(href)) {
                                  e.preventDefault();
                                  setTab('content');
                                  setCitation(href.slice(1));
                                  setChatOpen(false);
                                  if (tab === 'content')
                                    document
                                      .getElementById(href.slice(1))
                                      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }
                              }}
                            >
                              {children}
                            </a>
                          ),
                        }}
                      >
                        {message.content.replace(/\[(E\d+)\](?!\()/g, (match, id: string) =>
                          report?.evidence.some((e) => e.id === id) ? `[${id}](#${id})` : match,
                        )}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <span className="thinking-dots">
                      <i />
                      <i />
                      <i />
                    </span>
                  )}
                </article>
              ))}
              {tools.length > 0 && (
                <div className="tool-trace">
                  <div className="trace-title">
                    <Layers3 size={12} />
                    本轮工具记录
                  </div>
                  {tools.map((tool, i) => (
                    <div className={`tool-event ${tool.status}`} key={i}>
                      {tool.status === 'running' ? (
                        <LoaderCircle size={12} className="spin" />
                      ) : tool.status === 'done' ? (
                        <Check size={12} />
                      ) : (
                        <X size={12} />
                      )}
                      <span>{tool.detail}</span>
                    </div>
                  ))}
                </div>
              )}
              <div ref={chatBottom} />
            </div>
            <form
              className="chat-composer"
              onSubmit={(e) => {
                e.preventDefault();
                void ask();
              }}
            >
              <label className="sr-only" htmlFor="question">
                向网页提问
              </label>
              <textarea
                id="question"
                placeholder={
                  report
                    ? '关于这个网页，你想了解什么？'
                    : ai
                      ? '直接提问，或发送网址让 Agent 分析…'
                      : '先设置模型，即可开始 Agent 对话…'
                }
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={!!busy}
                maxLength={4000}
                rows={2}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void ask();
                  }
                }}
              />
              <div className="composer-bottom">
                <span>{ai ? '工具驱动 · 有据可循' : '打开模型设置，保存 Key 即可对话'}</span>
                <button
                  type={busy === 'chat' ? 'button' : 'submit'}
                  disabled={busy !== 'chat' && (!!busy || !draft.trim())}
                  onClick={busy === 'chat' ? () => abort.current?.abort() : undefined}
                  aria-label={busy === 'chat' ? '停止回答' : '发送问题'}
                >
                  {busy === 'chat' ? <Square size={14} /> : <ArrowRight size={18} />}
                </button>
              </div>
            </form>
            <div className="chat-disclaimer">
              {ai
                ? 'AI 可能出错，请核对原始证据。'
                : '当前未调用模型，回答由证据检索与检测工具生成。'}
            </div>
          </aside>
        </div>
        <footer className="page-footer">
          <span>BUILT FOR THE CURIOUS.</span>
          <span>SiteLens / 网页分析 Agent</span>
        </footer>
      </div>
      <button className="mobile-chat-toggle" onClick={() => setChatOpen(true)}>
        <MessageSquareText size={19} /> 和网页聊聊
      </button>
      {showModels && (
        <ModelSettingsModal
          settings={modelSettings}
          onSave={updateModels}
          close={() => setShowModels(false)}
        />
      )}
      {help && <HelpModal close={() => setHelp(false)} ai={ai} />}
    </div>
  );
}
