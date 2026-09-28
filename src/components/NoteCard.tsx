import { useEffect, useRef } from 'react'
import type { NoteTab } from '../types'

interface NoteCardProps {
  note: NoteTab
  active: boolean
  cursorPos: number | null
  onChange: (id: string, text: string, cursor: number | null) => void
  onFocus: (id: string, cursor: number | null) => void
  /** 用户真实点击卡片（区别于程序化聚焦）：点亮圈选印记 */
  onTap: (id: string) => void
  onDelete: (id: string) => void
  onCollapse: (id: string) => void
}

/**
 * 批注标签页：仅展示文本，右上角删除 + 缩小。
 * 文本区内可编辑；光标位置由父组件统一管理（全局唯一）。
 */
export default function NoteCard({ note, active, cursorPos, onChange, onFocus, onTap, onDelete, onCollapse }: NoteCardProps) {
  const ref = useRef<HTMLTextAreaElement>(null)

  // 外部光标同步（延迟到当前按键事件结束之后，避免 Enter 被新聚焦的文本区接收）
  useEffect(() => {
    if (cursorPos === null || !ref.current) return
    const el = ref.current
    const t = window.setTimeout(() => {
      el.focus({ preventScroll: true })
      el.setSelectionRange(cursorPos, cursorPos)
    }, 60)
    return () => window.clearTimeout(t)
  }, [cursorPos])

  const handleSelect = () => {
    const el = ref.current
    if (!el) return
    onFocus(note.id, el.selectionStart)
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const el = e.target
    onChange(note.id, el.value, el.selectionStart)
  }

  return (
    <div className={`note-card ${active ? 'note-card-active' : ''}`} data-note-id={note.id} onClick={() => onTap(note.id)}>
      <div className="note-head">
        <span className="note-quote">{note.blockExcerpt}</span>
        <span className="note-head-btns">
          <button className="note-btn" onClick={() => onDelete(note.id)} aria-label="删除批注">
            <TrashIcon />
          </button>
          <button className="note-btn" onClick={() => onCollapse(note.id)} aria-label="缩小批注">
            <MinIcon />
          </button>
        </span>
      </div>
      <textarea
        ref={ref}
        className="note-text"
        value={note.text}
        placeholder="批注内容…"
        rows={2}
        onChange={handleChange}
        onSelect={handleSelect}
        onFocus={handleSelect}
        onBlur={() => onFocus(note.id, null)}
      />
    </div>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
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
