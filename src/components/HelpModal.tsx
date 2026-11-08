import { useEffect, useRef } from 'react';
import { X, Radar, ArrowRight } from 'lucide-react';

export function HelpModal({ close, ai }: { close: () => void; ai: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div className="modal-backdrop" onClick={close}>
      <div
        className="help-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        ref={ref}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key !== 'Tab') return;
          const nodes = ref.current?.querySelectorAll<HTMLElement>(
            'button,a,input,textarea,[tabindex="0"]',
          );
          if (!nodes?.length) return;
          const first = nodes[0];
          const last = nodes[nodes.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }}
      >
        <button className="icon-button modal-close" aria-label="关闭使用说明" onClick={close}>
          <X size={20} />
        </button>
        <span className="modal-logo">
          <Radar size={30} />
        </span>
        <div className="small-eyebrow">A FIELD GUIDE TO SITELENS</div>
        <h2 id="help-title">从一个问题开始。</h2>
        <p>
          SiteLens 是一个开源网页分析
          Agent。它提取当前页面的证据，调用真实检测工具，再帮助你理解发现。
        </p>
        <ol>
          <li>
            <strong>输入公开网址</strong>
            <span>支持 HTTP / HTTPS，自动渲染页面并提取内容。无法渲染时会标注 HTML 模式。</span>
          </li>
          <li>
            <strong>探索结果或直接提问</strong>
            <span>
              查看正文、技术栈、SEO 和安全头。抓取完成后自动运行
              Lighthouse；切换设备自动补测，也可以在对话中请求。
            </span>
          </li>
          <li>
            <strong>核对证据，导出报告</strong>
            <span>对话引用 [E1] 等正文编号；性能报告可导出原始 Lighthouse HTML / JSON。</span>
          </li>
        </ol>
        <div className="help-mode">
          <strong>{ai ? 'Agent 已启用' : '当前为免密钥证据模式'}</strong>
          <p>
            {ai
              ? '模型可以按问题自主选择工具，并结合多轮上下文回答。'
              : '可以体验真实抓取、检索和检测。要启用模型对话，点击右侧模型设置，选择服务商并保存 API Key 即可启用，无需重启服务。'}
          </p>
        </div>
        <p className="help-limit">
          CrUX 需单独配置 CRUX_API_KEY。真实用户 INP 无法通过 Lighthouse
          加载检测得出。报告仅分析当前页面；服务端快照约一小时过期，历史列表只在本机保存网址。
        </p>
        <button className="primary-button" onClick={close}>
          开始探索 <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
