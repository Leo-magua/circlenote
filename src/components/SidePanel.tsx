import { useState } from 'react'
import type { Activity, DocComment } from '../types'

interface SidePanelProps {
  comments: DocComment[]
  activities: Activity[]
  onJump: (blockId: string) => void
}

function kindIcon(kind: Activity['kind']) {
  switch (kind) {
    case 'generate':
      return '✦'
    case 'edit':
      return '✎'
    case 'comment':
      return '❝'
    case 'delete':
      return '⌫'
  }
}

export default function SidePanel({ comments, activities, onJump }: SidePanelProps) {
  const [tab, setTab] = useState<'comments' | 'log'>('comments')

  return (
    <div className="side-panel">
      <div className="side-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'comments'}
          className={`side-tab ${tab === 'comments' ? 'side-tab-on' : ''}`}
          onClick={() => setTab('comments')}
        >
          批注
          {comments.length > 0 && <span className="side-count">{comments.length}</span>}
        </button>
        <button
          role="tab"
          aria-selected={tab === 'log'}
          className={`side-tab ${tab === 'log' ? 'side-tab-on' : ''}`}
          onClick={() => setTab('log')}
        >
          记录
        </button>
      </div>

      <div className="side-body">
        {tab === 'comments' ? (
          comments.length === 0 ? (
            <p className="side-empty">
              还没有批注。
              <br />
              圈出一处内容，选择「插入批注」，
              <br />
              想到什么直接说。
            </p>
          ) : (
            [...comments].reverse().map((c) => (
              <button key={c.id} className="comment-item" onClick={() => onJump(c.blockId)}>
                <span className="comment-quote">{c.blockExcerpt}</span>
                <span className="comment-text">{c.text}</span>
                <span className="comment-meta">我 · {c.time}</span>
              </button>
            ))
          )
        ) : activities.length === 0 ? (
          <p className="side-empty">暂无操作记录。</p>
        ) : (
          [...activities].reverse().map((a) => (
            <div key={a.id} className="log-item">
              <span className={`log-icon log-${a.kind}`}>{kindIcon(a.kind)}</span>
              <span className="log-main">
                <span className="log-text">{a.text}</span>
                {a.quote && <span className="log-quote">「{a.quote}」</span>}
              </span>
              <span className="log-time">{a.time}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
