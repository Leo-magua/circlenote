import { useRef, useState } from 'react'
import type { CursorState } from '../types'

interface ChatMessage {
  id: string
  role: 'user' | 'ai'
  text: string
}

interface ChatPanelProps {
  open: boolean
  collapsed: boolean
  messages: ChatMessage[]
  draft: string
  listening: boolean
  interim: string
  onDraft: (v: string) => void
  onSend: (v: string) => void
  onCollapse: () => void
  onExpand: () => void
  onClose: () => void
  cursorRef: React.MutableRefObject<CursorState | null>
  setCursorWithIdle: (c: CursorState | null) => void
}

/**
 * 下拉式对话页：从右上角下拉展开的 9:16 小浮窗（横向 9、纵向 16，手机比例缩小版）；
 * 底部输入框 + 发送；按住底边上拖等比放大、下拖缩小；右下角缩小为图标。
 */
export default function ChatPanel({
  open,
  collapsed,
  messages,
  draft,
  onDraft,
  onSend,
  onCollapse,
  onExpand,
  onClose,
  cursorRef,
  setCursorWithIdle,
}: ChatPanelProps) {
  const [scale, setScale] = useState(1) // 等比缩放系数（保持 9:16）
  const dragRef = useRef<{ startY: number; startScale: number } | null>(null)

  const onDragDown = (e: React.PointerEvent) => {
    dragRef.current = { startY: e.clientY, startScale: scale }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onDragMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    // 上拖放大、下拖缩小，纵横等比
    const delta = (dragRef.current.startY - e.clientY) / 360
    setScale(Math.min(1.55, Math.max(0.75, dragRef.current.startScale + delta)))
  }
  const onDragUp = () => {
    dragRef.current = null
  }

  if (!open) return null

  if (collapsed) {
    return (
      <button className="chat-mini" onClick={onExpand} aria-label="展开对话">
        <ChatGlyph />
      </button>
    )
  }

  return (
    <div className="chat-panel" style={{ width: `${Math.round(196 * scale)}px` }}>
      <div className="chat-head">
        <span className="chat-title">AI 对话</span>
        <span className="chat-head-btns">
          <button className="note-btn" onClick={onCollapse} aria-label="缩小对话">
            <MinIcon />
          </button>
          <button className="note-btn" onClick={onClose} aria-label="关闭对话">
            ×
          </button>
        </span>
      </div>

      <div className="chat-body">
        {messages.length === 0 ? (
          <p className="side-empty">按住右下角语音按钮说话，或在这里输入。</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`chat-msg chat-msg-${m.role}`}>
              {m.text}
            </div>
          ))
        )}
      </div>

      {/* 底边拖拽条：上拖等比放大、下拖等比缩小 */}
      <div
        className="chat-resize"
        onPointerDown={onDragDown}
        onPointerMove={onDragMove}
        onPointerUp={onDragUp}
        onPointerCancel={onDragUp}
        aria-label="拖动调整对话页大小"
      >
        <span className="chat-resize-bar" />
      </div>

      <div className="chat-bar">
        <input
          className="chat-input"
          value={draft}
          placeholder="输入修改指令或问题…"
          onChange={(e) => {
            onDraft(e.target.value)
            setCursorWithIdle({ target: 'chat', pos: e.target.selectionStart ?? e.target.value.length })
          }}
          onSelect={(e) => {
            const el = e.currentTarget
            setCursorWithIdle({ target: 'chat', pos: el.selectionStart ?? el.value.length })
          }}
          onFocus={(e) => {
            const el = e.currentTarget
            setCursorWithIdle({ target: 'chat', pos: el.selectionStart ?? el.value.length })
          }}
          onBlur={() => {
            if (cursorRef.current?.target === 'chat') setCursorWithIdle(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draft.trim()) onSend(draft)
          }}
        />
        <button className="chat-send" onClick={() => draft.trim() && onSend(draft)} disabled={!draft.trim()}>
          发送
        </button>
      </div>
    </div>
  )
}

function ChatGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z" />
      <path d="M9 11h6M9 14h4" />
    </svg>
  )
}

function MinIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="6" y1="12" x2="18" y2="12" />
    </svg>
  )
}
