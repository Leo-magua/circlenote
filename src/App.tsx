import { useEffect, useRef, useState } from 'react'
import type { Activity, Block, CursorState, NoteTab, Phase, Point, VoiceDir } from './types'
import { buildSeedBlocks, nowTime, SEED_DOC_TITLE } from './data/doc'
import { applyInstruction } from './engine'
import { useSpeech } from './hooks/useSpeech'
import CircleLayer, { CirclePad, findHitBlock } from './components/CircleLayer'
import DocBlock from './components/DocBlock'
import SidePanel from './components/SidePanel'
import PhoneFrame from './components/PhoneFrame'
import VoiceButton from './components/VoiceButton'
import ChatPanel from './components/ChatPanel'
import NoteCard from './components/NoteCard'

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="21" />
    </svg>
  )
}

let seq = 0
const nid = () => `id-${Date.now()}-${++seq}`

function useNarrowScreen() {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 760)
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 760)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return narrow
}

function excerptOf(block: Block, n = 16): string {
  const t = block.type === 'tr' ? (block.cells ?? []).join(' ') : block.text
  const clean = t.replace(/\*\*/g, '')
  return clean.length > n ? `${clean.slice(0, n)}…` : clean
}

/** 全局语音/对话指令 → 目标 block */
function globalRoute(text: string): string | null {
  const rules: Array<[RegExp, string]> = [
    [/渠道投放/, 'b6'],
    [/内容制作/, 'b7'],
    [/线下|活动预算/, 'b8'],
    [/机动|预留/, 'b9'],
    [/备货|库存|供货/, 'b11'],
    [/竞品|降噪|续航/, 'b12'],
    [/KOL|报价|名单/i, 'b14'],
    [/直播|脚本/, 'b15'],
    [/终审|财务/, 'b16'],
    [/标题|题目/, 'b1'],
    [/导语|开头|第一段/, 'b2'],
    [/节奏/, 'b4'],
    [/预算/, 'b6'],
  ]
  for (const [re, id] of rules) if (re.test(text)) return id
  return null
}

/** 在文本的指定位置插入字符串 */
function insertAt(text: string, pos: number, insert: string): string {
  return text.slice(0, pos) + insert + text.slice(pos)
}

/** 点到线段的最短距离 */
function distToSeg(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** 点击位置是否落在某条圈选印记的笔触附近 */
function hitMarkId(p: Point, notes: NoteTab[]): string | null {
  for (let i = notes.length - 1; i >= 0; i--) {
    const mark = notes[i].mark
    if (mark.length < 2) continue
    for (let j = 0; j < mark.length - 1; j++) {
      if (distToSeg(p, mark[j], mark[j + 1]) < 14) return notes[i].id
    }
  }
  return null
}

/** 语音按下时的输入目标快照：识别流式文本都基于它计算，避免互相污染 */
interface VoiceBase {
  target: 'note' | 'chat'
  noteId?: string
  pos: number
  text: string
  /** 快照时不存在光标（对话页情形）：识别约 2 秒后才展开对话页 */
  noCursor?: boolean
}

/** 无光标时，按住语音按钮约 2 秒后展开对话页 */
const CHAT_REVEAL_MS = 2000

export default function App() {
  const narrow = useNarrowScreen()
  const [folded, setFolded] = useState(true)
  const [phase, setPhase] = useState<Phase>('intro')
  const [blocks, setBlocks] = useState<Block[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [revealCount, setRevealCount] = useState(0)
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null)
  const [flashId, setFlashId] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)

  // 批注标签页
  const [notes, setNotes] = useState<NoteTab[]>([])
  // 被“点亮”的批注印记（点击恢复颜色，全局最多一个）
  const [litNoteId, setLitNoteId] = useState<string | null>(null)
  // 对话页
  const [chatOpen, setChatOpen] = useState(false)
  const [chatCollapsed, setChatCollapsed] = useState(false)
  const [chatMessages, setChatMessages] = useState<Array<{ id: string; role: 'user' | 'ai'; text: string }>>([])
  const [chatDraft, setChatDraft] = useState('')
  // 全局唯一输入光标
  const [cursor, setCursor] = useState<CursorState | null>(null)
  // 最近编辑的 note 用于新批注默认插入
  const lastNoteIdRef = useRef<string | null>(null)

  const viewportRef = useRef<HTMLDivElement>(null)
  const blocksRef = useRef(blocks)
  blocksRef.current = blocks
  const notesRef = useRef(notes)
  notesRef.current = notes
  const chatDraftRef = useRef(chatDraft)
  chatDraftRef.current = chatDraft
  const cursorRef = useRef(cursor)
  cursorRef.current = cursor
  const selectedIdRef = useRef<string | null>(null)
  // 最近一次圈选命中的 block（供语音左拖新建批注）
  const lastCircledIdRef = useRef<string | null>(null)
  const voiceIntentRef = useRef<'generate' | 'voice'>('generate')
  const revealTimerRef = useRef<number | null>(null)
  const cursorIdleTimerRef = useRef<number | null>(null)
  // 语音输入目标快照与“无光标 2 秒展开对话页”计时器
  const voiceBaseRef = useRef<VoiceBase | null>(null)
  const chatRevealTimerRef = useRef<number | null>(null)

  const showToast = (text: string) => setToast({ id: Date.now(), text })

  const pushActivity = (a: Omit<Activity, 'id' | 'time'>) =>
    setActivities((prev) => [...prev, { ...a, id: nid(), time: nowTime() }])

  // ---------- 光标管理 ----------
  const clearCursorIdle = () => {
    if (cursorIdleTimerRef.current) {
      window.clearTimeout(cursorIdleTimerRef.current)
      cursorIdleTimerRef.current = null
    }
  }
  const setCursorWithIdle = (next: CursorState | null) => {
    clearCursorIdle()
    setCursor(next)
    cursorRef.current = next
    if (next) {
      // 8 秒无操作自动隐藏
      cursorIdleTimerRef.current = window.setTimeout(() => {
        setCursor(null)
        cursorRef.current = null
        cursorIdleTimerRef.current = null
      }, 8000)
    }
  }

  // ---------- 语音目标快照 ----------
  const clearChatReveal = () => {
    if (chatRevealTimerRef.current) {
      window.clearTimeout(chatRevealTimerRef.current)
      chatRevealTimerRef.current = null
    }
  }

  const snapshotVoiceBase = () => {
    const cur = cursorRef.current
    if (cur?.target === 'note' && cur.noteId) {
      const n = notesRef.current.find((x) => x.id === cur.noteId)
      if (n) {
        voiceBaseRef.current = { target: 'note', noteId: n.id, pos: cur.pos, text: n.text }
        return
      }
    }
    if (cur?.target === 'chat') {
      voiceBaseRef.current = { target: 'chat', pos: cur.pos, text: chatDraftRef.current }
      return
    }
    // 无光标：暂存对话输入框现状，流式文本追加其后；约 2 秒后展开对话页
    voiceBaseRef.current = { target: 'chat', pos: chatDraftRef.current.length, text: chatDraftRef.current, noCursor: true }
    clearChatReveal()
    chatRevealTimerRef.current = window.setTimeout(() => {
      chatRevealTimerRef.current = null
      setChatOpen(true)
      setChatCollapsed(false)
    }, CHAT_REVEAL_MS)
  }

  /** 放弃本次语音的流式预览，把目标文本还原到按下前的样子 */
  const restoreVoiceBase = () => {
    const base = voiceBaseRef.current
    if (!base) return
    if (base.target === 'note' && base.noteId) {
      setNotes((prev) => prev.map((n) => (n.id === base.noteId ? { ...n, text: base.text } : n)))
    } else {
      setChatDraft(base.text)
    }
    voiceBaseRef.current = null
  }

  // ---------- 语音 ----------
  const handleVoiceFinal = (text: string) => {
    const intent = voiceIntentRef.current
    if (intent === 'generate') return startGenerate(text)
    clearChatReveal()
    const base = voiceBaseRef.current
    voiceBaseRef.current = null
    if (base?.target === 'note' && base.noteId) {
      // 在批注光标处落字（替换流式预览）
      setNotes((prev) => prev.map((n) => (n.id === base.noteId ? { ...n, text: insertAt(base.text, base.pos, text) } : n)))
      setCursorWithIdle({ target: 'note', noteId: base.noteId, pos: base.pos + text.length })
      pushActivity({ kind: 'comment', text: '语音写入批注', quote: text })
    } else if (base) {
      // 对话页：插入快照光标处并确保展开
      setChatOpen(true)
      setChatCollapsed(false)
      setChatDraft(insertAt(base.text, base.pos, text))
      setCursorWithIdle({ target: 'chat', pos: base.pos + text.length })
    }
  }

  const speech = useSpeech(handleVoiceFinal)

  // 演示模式提示：3 秒自动消失，避免反复遮挡
  const [speechErr, setSpeechErr] = useState<string | null>(null)
  useEffect(() => {
    if (!speech.error) return
    setSpeechErr(speech.error)
    const t = window.setTimeout(() => setSpeechErr(null), 3000)
    return () => window.clearTimeout(t)
  }, [speech.error])

  // 语音流式预览：按住期间把识别中的文本实时显示到目标位置
  useEffect(() => {
    if (!speech.listening || voiceIntentRef.current !== 'voice') return
    const base = voiceBaseRef.current
    if (!base) return
    const live = speech.interim
    if (base.target === 'note' && base.noteId) {
      setNotes((prev) => prev.map((n) => (n.id === base.noteId ? { ...n, text: insertAt(base.text, base.pos, live) } : n)))
    } else {
      setChatDraft(insertAt(base.text, base.pos, live))
    }
  }, [speech.interim, speech.listening])

  const voiceStart = (intent: typeof voiceIntentRef.current) => {
    voiceIntentRef.current = intent
    if (intent === 'voice') snapshotVoiceBase()
    speech.start()
  }

  const handleVoiceCancel = () => {
    clearChatReveal()
    restoreVoiceBase()
    speech.cancel()
  }

  // ---------- 生成 ----------
  const startGenerate = (quote: string) => {
    if (revealTimerRef.current) window.clearInterval(revealTimerRef.current)
    const seed = buildSeedBlocks()
    setBlocks(seed)
    setActivities([])
    setSelectedId(null)
    selectedIdRef.current = null
    setNotes([])
    setLitNoteId(null)
    setChatMessages([])
    setChatDraft('')
    setCursorWithIdle(null)
    setRevealCount(0)
    setPhase('generating')
    let i = 0
    revealTimerRef.current = window.setInterval(() => {
      i += 1
      setRevealCount(i)
      if (i >= seed.length) {
        if (revealTimerRef.current) window.clearInterval(revealTimerRef.current)
        revealTimerRef.current = null
        setPhase('ready')
        pushActivity({ kind: 'generate', text: `已生成《${SEED_DOC_TITLE}》初稿`, quote })
        showToast('初稿好了。长按页面圈出不满意的地方，再按住语音按钮说想法。')
      }
    }, 130)
  }

  useEffect(
    () => () => {
      if (revealTimerRef.current) window.clearInterval(revealTimerRef.current)
      clearCursorIdle()
      clearChatReveal()
    },
    []
  )

  // ---------- 圈选（长按页面即触发，无需按钮） ----------
  const handleCircleComplete = (points: Point[]) => {
    const viewport = viewportRef.current
    const inner = viewport?.querySelector<HTMLElement>('.doc-scroll-inner')
    if (!inner) return
    const hit = findHitBlock(points, inner)
    if (!hit) {
      showToast('没圈到内容——把段落整个圈进去试试。')
      return
    }
    const block = blocksRef.current.find((b) => b.id === hit)
    if (!block || block.deleted) {
      showToast('这段已删除，圈别处试试。')
      return
    }
    setSelectedId(hit)
    selectedIdRef.current = hit
    lastCircledIdRef.current = hit

    // 印记 = 用户手绘轨迹原样保留；浮窗锚点取轨迹外接框左下方
    let minX = Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const p of points) {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxY = Math.max(maxY, p.y)
    }
    const innerW = inner.clientWidth || 366
    const anchor: Point = {
      x: Math.max(8, Math.min(minX, innerW - 252)),
      y: maxY + 12,
    }

    // 圈选完成即创建批注浮窗：默认展开并插入输入光标
    const newNote: NoteTab = {
      id: nid(),
      blockId: block.id,
      blockExcerpt: excerptOf(block),
      mark: points,
      text: '',
      collapsed: false,
      fresh: true,
      time: nowTime(),
      anchor,
    }
    setNotes((prev) => [...prev.map((n) => ({ ...n, fresh: false })), newNote])
    lastNoteIdRef.current = newNote.id
    setLitNoteId(newNote.id)
    setCursorWithIdle({ target: 'note', noteId: newNote.id, pos: 0 })
    // 创建完成后印记稍作停留即褪色，待用户点击恢复
    window.setTimeout(() => {
      setLitNoteId((cur) => (cur === newNote.id ? null : cur))
    }, 2200)
  }

  // ---------- 修改 ----------
  const applyToBlock = (blockId: string, text: string) => {
    setBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, processing: true } : b)))
    window.setTimeout(() => {
      const res = applyInstruction(blocksRef.current, blockId, text)
      setBlocks(res.blocks)
      showToast(res.reply)
      pushActivity({
        kind: res.kind,
        text: res.kind === 'delete' ? '删除了一处内容' : '按指令修改了一处内容',
        quote: text,
      })
      window.setTimeout(() => {
        setBlocks((prev) => prev.map((b) => (b.justChanged ? { ...b, justChanged: false } : b)))
      }, 2400)
    }, 780)
  }

  // ---------- 批注 ----------
  /** 语音左拖：为最近圈选的 block 新建一个批注浮窗 */
  const createNoteForBlock = (block: Block, text: string) => {
    const inner = viewportRef.current?.querySelector<HTMLElement>('.doc-scroll-inner')
    const el = inner?.querySelector<HTMLElement>(`[data-block-id="${block.id}"]`)
    let anchor: Point = { x: 12, y: 12 }
    if (inner && el) {
      const ir = inner.getBoundingClientRect()
      const r = el.getBoundingClientRect()
      anchor = {
        x: Math.max(8, Math.min(r.left - ir.left, (inner.clientWidth || 366) - 252)),
        y: r.bottom - ir.top + 12,
      }
    }
    const excerpt = excerptOf(block)
    const newNote: NoteTab = {
      id: nid(),
      blockId: block.id,
      blockExcerpt: excerpt,
      mark: [],
      text,
      collapsed: false,
      fresh: true,
      time: nowTime(),
      anchor,
    }
    setNotes((prev) => [...prev.map((n) => ({ ...n, fresh: false })), newNote])
    lastNoteIdRef.current = newNote.id
    setLitNoteId(newNote.id)
    setCursorWithIdle({ target: 'note', noteId: newNote.id, pos: text.length })
    pushActivity({ kind: 'comment', text: `在「${excerpt}」处添加批注`, quote: text })
  }

  const updateNote = (id: string, text: string, cursorPos: number | null) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, text } : n)))
    if (cursorPos !== null) setCursorWithIdle({ target: 'note', noteId: id, pos: cursorPos })
  }

  const focusNote = (id: string, cursorPos: number | null) => {
    if (cursorPos !== null) setCursorWithIdle({ target: 'note', noteId: id, pos: cursorPos })
  }

  // 用户主动点击批注卡片/图标 → 恢复其圈选印记颜色
  const tapNote = (id: string) => {
    setLitNoteId(id)
  }

  const deleteNote = (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id))
    if (lastNoteIdRef.current === id) lastNoteIdRef.current = null
    if (litNoteId === id) setLitNoteId(null)
    if (cursorRef.current?.noteId === id) setCursorWithIdle(null)
  }

  const collapseNote = (id: string) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, collapsed: true } : n)))
    if (cursorRef.current?.noteId === id) setCursorWithIdle(null)
  }

  const expandNote = (id: string) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, collapsed: false } : n)))
    // 重新展开不带光标，需用户点击文本位置；印记恢复颜色
    setLitNoteId(id)
  }

  // ---------- 对话页 ----------
  const sendChat = (text: string) => {
    const v = text.trim()
    if (!v) return
    setChatDraft('')
    setChatMessages((prev) => [...prev, { id: nid(), role: 'user', text: v }])
    pushActivity({ kind: 'edit', text: '通过对话页发送指令', quote: v })
    const target = globalRoute(v)
    if (target && blocksRef.current.some((b) => b.id === target && !b.deleted)) {
      applyToBlock(target, v)
      window.setTimeout(() => {
        setChatMessages((prev) => [...prev, { id: nid(), role: 'ai', text: '已按你的要求修改对应段落。' }])
      }, 700)
    } else {
      window.setTimeout(() => {
        setChatMessages((prev) => [...prev, { id: nid(), role: 'ai', text: '收到，我按你的意思处理。' }])
      }, 600)
    }
  }

  // ---------- 语音按钮拖拽 ----------
  const handleVoiceDir = (dir: VoiceDir) => {
    clearChatReveal()
    if (dir === 'up') {
      // 上拖 = 插入对话框：放弃原位置预览，目标切换为对话输入框末尾
      restoreVoiceBase()
      setChatOpen(true)
      setChatCollapsed(false)
      setCursorWithIdle({ target: 'chat', pos: chatDraftRef.current.length })
      snapshotVoiceBase()
    } else if (dir === 'left') {
      // 左拖 = 插入批注：放弃原位置预览，为最近圈选的 block 新建批注并作为新目标
      restoreVoiceBase()
      const sid = selectedIdRef.current ?? lastCircledIdRef.current
      const block = blocksRef.current.find((b) => b.id === sid && !b.deleted)
      if (block) {
        selectedIdRef.current = block.id
        setSelectedId(block.id)
        createNoteForBlock(block, '')
        snapshotVoiceBase()
      } else {
        showToast('先圈选一段内容，再向左拖插入批注。')
        snapshotVoiceBase()
      }
    }
  }

  // ---------- 跳转 ----------
  const jumpTo = (blockId: string) => {
    setPanelOpen(false)
    const el = viewportRef.current?.querySelector(`[data-block-id="${blockId}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setFlashId(blockId)
    window.setTimeout(() => setFlashId(null), 1800)
  }

  // toast 自动消失
  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 4200)
    return () => window.clearTimeout(t)
  }, [toast])

  const commentCountByBlock = (id: string) => notes.filter((n) => n.blockId === id && !n.collapsed).length
  const noteComments = notes
    .filter((n) => n.text.trim())
    .map((n) => ({ id: n.id, blockId: n.blockId, blockExcerpt: n.blockExcerpt, text: n.text, time: n.time }))

  // ---------- 设备内的 App ----------
  const appInner = (
    <div className={`app ${folded || narrow ? '' : 'app-unfolded'}`}>
      <div className="appbar">
        <span className="appbar-back">‹</span>
        <span className="appbar-title">
          <span className="appbar-logo" />
          CircleNote
        </span>
        <span className="appbar-more">···</span>
      </div>

      <div className="app-main">
        <div className="doc-viewport" ref={viewportRef}>
          <div className="doc-scroll">
            <div
              className="doc-scroll-inner"
              onClick={(e) => {
                // 点击圈选印记 → 恢复该印记颜色；点空白处 → 全部褪色
                const el = e.target as HTMLElement
                if (el.closest('.note-anchor, button, textarea, input, a')) return
                const r = e.currentTarget.getBoundingClientRect()
                const hit = hitMarkId({ x: e.clientX - r.left, y: e.clientY - r.top }, notesRef.current)
                if (hit) {
                  setLitNoteId(hit)
                  const n = notesRef.current.find((x) => x.id === hit)
                  if (n?.collapsed) expandNote(hit)
                } else if (litNoteId) {
                  setLitNoteId(null)
                }
              }}
            >
              {phase === 'intro' ? (
                <div className="intro-canvas">
                  <p className="intro-kicker">AI 办公 · 结果可直接交互</p>
                  <h2 className="intro-title">
                    结果不是
                    <br />
                    「行 / 不行」，
                    <br />
                    而是<em>可以改</em>。
                  </h2>
                  <p className="intro-desc">
                    AI 生成的内容会呈现在这里。长按圈出不满意的地方，再按住语音按钮说一声，它就地修改。
                  </p>
                </div>
              ) : (
                <div className="doc-sheet">
                  <div className="doc-meta">
                    <span className="doc-meta-dot" />
                    AI 生成 · 可圈选修改
                  </div>
                  {blocks.slice(0, revealCount).map((b) => (
                    <div key={b.id} className="doc-appear">
                      <DocBlock
                        block={b}
                        selected={selectedId === b.id}
                        flash={flashId === b.id}
                        commentCount={commentCountByBlock(b.id)}
                        onCommentTap={(id) => {
                          if (!folded && !narrow) jumpTo(id)
                          else {
                            setPanelOpen(true)
                            jumpTo(id)
                          }
                        }}
                      />
                    </div>
                  ))}
                  {phase === 'ready' && <div className="doc-end">· 完 ·</div>}
                </div>
              )}

              {/* 各批注的圈选印记（用户手绘轨迹）：默认褪色，点击恢复 */}
              {notes.map(
                (n) =>
                  n.mark.length > 1 && (
                    <CircleLayer key={`mark-${n.id}`} mark={n.mark} dim={litNoteId !== n.id} />
                  )
              )}

              {/* 批注浮窗：锚定在圈选位置旁 */}
              {notes.map((n) => (
                <div
                  key={n.id}
                  className={`note-anchor ${n.collapsed ? 'note-anchor-collapsed' : ''}`}
                  style={{ left: n.anchor.x, top: n.anchor.y }}
                >
                  {n.collapsed ? (
                    <button
                      className="note-mini"
                      onClick={() => {
                        tapNote(n.id)
                        expandNote(n.id)
                      }}
                      aria-label="展开批注"
                    >
                      <NoteGlyph />
                    </button>
                  ) : (
                    <NoteCard
                      note={n}
                      active={cursor?.target === 'note' && cursor.noteId === n.id}
                      cursorPos={cursor?.target === 'note' && cursor.noteId === n.id ? cursor.pos : null}
                      onChange={updateNote}
                      onFocus={focusNote}
                      onTap={tapNote}
                      onDelete={deleteNote}
                      onCollapse={collapseNote}
                    />
                  )}
                </div>
              ))}

              {/* 常驻圈选垫：长按页面即画圈 */}
              <CirclePad enabled={phase === 'ready'} onComplete={handleCircleComplete} />
            </div>
          </div>

          {toast && (
            <div key={toast.id} className="ai-toast">
              <span className="ai-toast-dot">✦</span>
              {toast.text}
            </div>
          )}

          {panelOpen && (folded || narrow) && (
            <div className="panel-drawer">
              <button className="panel-drawer-close" onClick={() => setPanelOpen(false)} aria-label="关闭">
                ×
              </button>
              <SidePanel comments={noteComments} activities={activities} onJump={jumpTo} />
            </div>
          )}
          {/* 下拉式对话页 */}
          <ChatPanel
            open={chatOpen}
            collapsed={chatCollapsed}
            messages={chatMessages}
            draft={chatDraft}
            listening={speech.listening && voiceIntentRef.current === 'voice'}
            interim={speech.interim}
            onDraft={setChatDraft}
            onSend={sendChat}
            onCollapse={() => {
              setChatCollapsed(true)
              if (cursorRef.current?.target === 'chat') setCursorWithIdle(null)
            }}
            onExpand={() => {
              setChatCollapsed(false)
            }}
            onClose={() => {
              setChatOpen(false)
              if (cursorRef.current?.target === 'chat') setCursorWithIdle(null)
            }}
            cursorRef={cursorRef}
            setCursorWithIdle={setCursorWithIdle}
          />
        </div>

        {!folded && !narrow && phase !== 'intro' && (
          <aside className="app-side">
            <SidePanel comments={noteComments} activities={activities} onJump={jumpTo} />
          </aside>
        )}
      </div>

      <div className={`dock-zone ${phase === 'ready' ? 'dock-zone-overlay' : ''}`}>
        <div className="dock dock-intro">
          {phase === 'intro' ? (
            <>
              <p className="dock-title">想处理哪份文档？</p>
              <p className="dock-sub">按住下方按钮直接说，或点一个示例指令</p>
              <button
                className={`mic mic-hero ${speech.listening ? 'mic-on' : ''}`}
                onPointerDown={() => voiceStart('generate')}
                onPointerUp={speech.stop}
                onPointerLeave={speech.listening ? speech.stop : undefined}
                onContextMenu={(e) => e.preventDefault()}
                aria-label="按住说话"
              >
                <MicIcon />
              </button>
              {speech.listening && (
                <p className="dock-interim">
                  <span className="listening-dots">
                    <i />
                    <i />
                    <i />
                  </span>
                  {speech.interim || '正在聆听…'}
                </p>
              )}
              {speechErr && <p className="dock-error">{speechErr}</p>}
              <div className="chips chips-center">
                {['帮我整理 Q3 新品上市方案', '把会议记录整理成方案初稿', '生成一份上市计划文档'].map((c) => (
                  <button key={c} className="chip" onClick={() => startGenerate(c)}>
                    {c}
                  </button>
                ))}
              </div>
            </>
          ) : phase === 'generating' ? (
            <div className="dock-hint">
              <span className="listening-dots">
                <i />
                <i />
                <i />
              </span>
              AI 正在整理文档…
            </div>
          ) : (
            <>
              {speechErr && <p className="dock-error dock-error-float">{speechErr}</p>}
              <VoiceButton
                listening={speech.listening && voiceIntentRef.current === 'voice'}
                onStart={() => voiceStart('voice')}
                onStop={speech.stop}
                onCancel={handleVoiceCancel}
                onDir={handleVoiceDir}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )

  // ---------- 外层演示舞台 ----------
  if (narrow) {
    return <div className="phone-fullscreen">{appInner}</div>
  }

  return (
    <div className="stage">
      <header className="stage-head">
        <div className="stage-brand">
          <span className="stage-logo" />
          <div>
            <h1 className="stage-title">CircleNote</h1>
            <p className="stage-sub">圈一圈 · 说一声 · 就改好了</p>
          </div>
        </div>
        <button className="fold-toggle" onClick={() => setFolded((f) => !f)}>
          <span className={`fold-icon ${folded ? '' : 'fold-icon-open'}`}>
            <i />
          </span>
          {folded ? '展开大屏' : '折起'}
        </button>
      </header>

      <main className="stage-main">
        <PhoneFrame folded={folded}>{appInner}</PhoneFrame>
      </main>

      <footer className="stage-foot">
        <span>折叠屏 AI 办公 · 交互概念演示</span>
        <span className="stage-foot-sep">·</span>
        <span>Chrome / Edge 支持真实语音识别，其余浏览器为演示模式</span>
      </footer>
    </div>
  )
}

function NoteGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z" />
      <path d="M9 11h6M9 14h4" />
    </svg>
  )
}
