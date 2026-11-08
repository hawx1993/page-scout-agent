import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, LoaderCircle, Settings2, X } from 'lucide-react';
import {
  modelConfigSchema,
  providerBaseUrl,
  providers,
  type ProviderId,
} from '../../shared/models';
import { newProfile, type ModelSettings } from '../model-settings';

export function ModelSettingsModal({
  settings,
  onSave,
  close,
}: {
  settings: ModelSettings;
  onSave: (next: ModelSettings) => void;
  close: () => void;
}) {
  const [draft, setDraft] = useState(() =>
    settings.active === 'server'
      ? newProfile('deepseek')
      : settings.profiles[settings.active] || newProfile(settings.active),
  );
  const [visible, setVisible] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    panel.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', key);
    return () => {
      controller.current?.abort();
      document.removeEventListener('keydown', key);
      before?.focus();
    };
  }, [close]);
  function validate() {
    const config = modelConfigSchema.parse(draft);
    providerBaseUrl(config);
    return config;
  }
  function save() {
    try {
      validate();
      onSave({
        active: draft.provider,
        profiles: { ...settings.profiles, [draft.provider]: draft },
      });
      close();
    } catch {
      setSuccess(false);
      setMessage('保存失败，请检查 Key、模型标识、接口地址及浏览器存储权限。');
    }
  }
  async function test() {
    try {
      const config = validate();
      setTesting(true);
      setMessage('');
      controller.current = new AbortController();
      const response = await fetch('/api/models/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(config),
        signal: controller.current.signal,
      });
      const result = await response.json();
      setSuccess(response.ok);
      setMessage(result.message || result.error || '测试未完成');
    } catch {
      setSuccess(false);
      setMessage('连接失败，请检查配置和网络。');
    } finally {
      setTesting(false);
    }
  }
  return (
    <div className="modal-backdrop" onClick={close}>
      <div
        className="help-modal model-settings"
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="model-settings-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key !== 'Tab') return;
          const nodes = panel.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input,select,a[href]',
          );
          if (!nodes?.length) return;
          const first = nodes[0],
            last = nodes[nodes.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }}
      >
        <button className="icon-button modal-close" onClick={close} aria-label="关闭模型设置">
          <X size={20} />
        </button>
        <span className="modal-logo">
          <Settings2 size={28} />
        </span>
        <div className="small-eyebrow">YOUR MODEL. YOUR CHOICE.</div>
        <h2 id="model-settings-title">模型与 API Key</h2>
        <p>为不同服务商分别保存配置，切换后即用于右侧 Agent 对话。</p>
        <label className="settings-field">
          服务商
          <select
            value={draft.provider}
            disabled={testing}
            onChange={(e) => {
              const id = e.target.value as ProviderId;
              setDraft(settings.profiles[id] || newProfile(id));
              setVisible(false);
              setMessage('');
            }}
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="settings-field">
          模型标识
          <input
            list="provider-models"
            value={draft.model}
            disabled={testing}
            onChange={(e) => {
              setDraft({ ...draft, model: e.target.value });
              setMessage('');
            }}
            placeholder="选择或填写模型标识"
          />
          <datalist id="provider-models">
            {providers
              .find((p) => p.id === draft.provider)
              ?.models.map((model) => (
                <option key={model} value={model} />
              ))}
          </datalist>
        </label>
        <label className="settings-field">
          API Key
          <div className="key-input">
            <input
              type={visible ? 'text' : 'password'}
              value={draft.apiKey}
              disabled={testing}
              onChange={(e) => {
                setDraft({ ...draft, apiKey: e.target.value });
                setMessage('');
              }}
              autoComplete="off"
              spellCheck={false}
              placeholder="填写该服务商的 API Key"
            />
            <button
              type="button"
              aria-label={visible ? '隐藏 Key' : '显示 Key'}
              onClick={() => setVisible(!visible)}
            >
              {visible ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </label>
        <label className="settings-field">
          Base URL
          <input
            value={
              draft.provider === 'custom'
                ? draft.baseUrl || ''
                : providers.find((p) => p.id === draft.provider)!.baseUrl
            }
            readOnly={draft.provider !== 'custom'}
            disabled={testing}
            onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
            placeholder="https://your-provider.example/v1"
          />
        </label>
        <p className="settings-provider-note">
          {providers.find((p) => p.id === draft.provider)?.note}{' '}
          {providers.find((p) => p.id === draft.provider)?.docs && (
            <a
              href={providers.find((p) => p.id === draft.provider)?.docs}
              target="_blank"
              rel="noreferrer"
            >
              官方文档 ↗
            </a>
          )}
        </p>
        <label className="remember-key">
          <input
            type="checkbox"
            checked={draft.rememberKey}
            disabled={testing}
            onChange={(e) => setDraft({ ...draft, rememberKey: e.target.checked })}
          />
          在此浏览器记住 Key
        </label>
        <p className="settings-privacy">
          勾选后 Key
          保存在当前浏览器的本地存储中，未加密；不勾选则只保留在当前页面内存。请求时经本站后端转发到所选服务商，不写入服务器配置或报告。共享设备使用后请删除
          Key。
        </p>
        {message && (
          <div className={success ? 'settings-result success' : 'settings-result'} role="status">
            {message}
          </div>
        )}
        <div className="settings-actions">
          <button
            className="outline-button"
            disabled={testing || !draft.apiKey || !draft.model}
            onClick={() => void test()}
          >
            {testing && <LoaderCircle size={14} className="spin" />}
            {testing ? '测试中…' : '测试连接（少量 Token）'}
          </button>
          <button className="primary-button" disabled={testing} onClick={save}>
            保存并使用
          </button>
        </div>
        <button
          className="forget-key"
          disabled={testing}
          onClick={() => {
            const clean = { ...draft, apiKey: '' };
            try {
              onSave({ ...settings, profiles: { ...settings.profiles, [draft.provider]: clean } });
              setDraft(clean);
              setSuccess(true);
              setMessage('该服务商的 Key 已从浏览器与当前页面配置中删除。');
            } catch {
              setMessage('删除失败，请检查浏览器存储权限。');
            }
          }}
        >
          删除此服务商的 Key
        </button>
      </div>
    </div>
  );
}
