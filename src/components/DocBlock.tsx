import type { Block } from '../types'

/** markdown-lite：仅支持 **粗体** */
function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="doc-strong">
          {part.slice(2, -2)}
        </strong>
      )
    }
    return <span key={i}>{part}</span>
  })
}

interface DocBlockProps {
  block: Block
  selected: boolean
  flash?: boolean
  commentCount: number
  onCommentTap: (blockId: string) => void
}

export default function DocBlock({ block, selected, flash, commentCount, onCommentTap }: DocBlockProps) {
  const cls = [
    'doc-block',
    `doc-${block.type}`,
    selected ? 'doc-selected' : '',
    block.processing ? 'doc-processing' : '',
    block.justChanged || flash ? 'doc-changed' : '',
    block.emphasized ? 'doc-em' : '',
    block.deleted ? 'doc-deleted' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={cls} data-block-id={block.id}>
      {block.type === 'tr' ? (
        <div className="doc-tr-grid">
          <span className="doc-tr-name">{renderInline(block.cells?.[0] ?? '')}</span>
          <span className="doc-tr-num">{renderInline(block.cells?.[1] ?? '')}</span>
          <span className="doc-tr-note">{renderInline(block.cells?.[2] ?? '')}</span>
        </div>
      ) : (
        renderInline(block.text)
      )}

      {/* AI 处理中：扫描微光 */}
      {block.processing && <span className="doc-shimmer" aria-hidden />}

      {/* 评论角标 */}
      {commentCount > 0 && !block.deleted && (
        <button
          className="doc-comment-badge"
          onClick={(e) => {
            e.stopPropagation()
            onCommentTap(block.id)
          }}
          aria-label={`${commentCount} 条批注`}
        >
          {commentCount}
        </button>
      )}
    </div>
  )
}
