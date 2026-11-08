import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CornerDownLeft, Slash, Square } from 'lucide-react';
import { matchingCommands, slashCommands, type SlashCommand } from '../slash-commands';

export function AgentComposer({
  value,
  onChange,
  onSend,
  onStop,
  busy,
  chatting,
  hasPage,
  ai,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  busy: boolean;
  chatting: boolean;
  hasPage: boolean;
  ai: boolean;
  error?: string;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const root = useRef<HTMLFormElement>(null);
  const [index, setIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [forced, setForced] = useState(false);
  const items = forced ? [...slashCommands] : matchingCommands(value);
  const open = !busy && !dismissed && items.length > 0;
  const selectedIndex = Math.min(index, Math.max(0, items.length - 1));
  const chosen = slashCommands.find((c) => value.startsWith(`/${c.name} `));
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        setDismissed(true);
        setForced(false);
      }
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  useEffect(() => {
    if (open)
      document
        .getElementById(`slash-${items[selectedIndex]?.id}`)
        ?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, open, items]);
  function select(command: SlashCommand) {
    onChange(`/${command.name} `);
    setDismissed(true);
    setForced(false);
    setIndex(0);
    input.current?.focus();
  }
  return (
    <form
      ref={root}
      className="chat-composer"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) onSend();
      }}
    >
      {open && (
        <div className="slash-menu">
          <div className="slash-menu-heading">
            <span>快捷命令</span>
            <small>↑↓ 选择 · Enter / Tab 插入 · Esc 关闭</small>
          </div>
          <div role="listbox" id="slash-options" aria-label="Agent 快捷命令">
            {items.map((command, i) => (
              <button
                key={command.id}
                id={`slash-${command.id}`}
                type="button"
                role="option"
                aria-selected={i === selectedIndex}
                className={i === selectedIndex ? 'selected' : ''}
                onPointerMove={() => setIndex(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(command)}
              >
                <span className="slash-command-icon">/</span>
                <span>
                  <strong>{command.name}</strong>
                  <small>{command.description}</small>
                </span>
                {i === selectedIndex && <CornerDownLeft size={13} />}
              </button>
            ))}
          </div>
          <div className="slash-menu-note">
            {hasPage ? '命令作用于当前分析网页' : '请先分析网页，再使用这些命令'}
          </div>
        </div>
      )}
      <label className="sr-only" htmlFor="question">
        向 Agent 提问，输入 / 打开快捷命令
      </label>
      <textarea
        ref={input}
        id="question"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? 'slash-options' : undefined}
        aria-activedescendant={open ? `slash-${items[selectedIndex]?.id}` : undefined}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setIndex(0);
          setDismissed(false);
          setForced(false);
        }}
        placeholder={
          hasPage
            ? '提问，或输入 / 使用快捷命令…'
            : ai
              ? '直接提问，或发送网址让 Agent 分析…'
              : '先设置模型，即可开始 Agent 对话…'
        }
        disabled={busy}
        maxLength={4000}
        rows={2}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (open && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) {
            if (e.key === 'Enter' && e.shiftKey) return;
            if (e.key === 'Tab' && e.shiftKey) {
              setDismissed(true);
              setForced(false);
              return;
            }
            e.preventDefault();
            if (e.key === 'Escape') {
              setDismissed(true);
              setForced(false);
            } else if (e.key === 'ArrowDown') setIndex((selectedIndex + 1) % items.length);
            else if (e.key === 'ArrowUp')
              setIndex((selectedIndex - 1 + items.length) % items.length);
            else select(items[selectedIndex]);
            return;
          }
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
      />
      {error && (
        <div className="slash-argument-hint" role="alert">
          {error}
        </div>
      )}
      {chosen?.argument && <div className="slash-argument-hint">{chosen.argument}</div>}
      <div className="composer-bottom">
        <button
          type="button"
          className="slash-trigger"
          title="快捷命令"
          aria-label="打开快捷命令菜单"
          aria-expanded={open}
          disabled={busy}
          onClick={() => {
            setDismissed(open);
            setForced(!open);
            setIndex(0);
            input.current?.focus();
          }}
        >
          <Slash size={13} />
        </button>
        <span>{ai ? '工具驱动 · 有据可循' : '设置模型，解锁 Agent'}</span>
        <button
          type={chatting ? 'button' : 'submit'}
          disabled={!chatting && (busy || !value.trim())}
          onClick={chatting ? onStop : undefined}
          aria-label={chatting ? '停止回答' : '发送问题'}
        >
          {chatting ? <Square size={14} /> : <ArrowRight size={18} />}
        </button>
      </div>
    </form>
  );
}
