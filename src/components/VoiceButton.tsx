import { useRef, useState } from 'react'
import type { VoiceDir } from '../types'

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="21" />
    </svg>
  )
}

interface VoiceButtonProps {
  listening: boolean
  onStart: () => void
  onStop: () => void
  onCancel: () => void
  /** 拖拽方向决定松手后的动作：上=对话框，左=批注，左上=取消 */
  onDir: (dir: VoiceDir) => void
}

/** 按住该时长后才真正开始语音输入；轻点不触发任何动作 */
const HOLD_START_MS = 280

/**
 * 右下角语音按钮：
 * 按住 HOLD_START_MS 后开始识别并出现扇形指示（按钮左上方，第二象限）；
 * 向上拖插入对话框；向左拖插入批注；向左上（扇形中间）取消；轻点无动作。
 */
export default function VoiceButton({ listening, onStart, onStop, onCancel, onDir }: VoiceButtonProps) {
  const [dir, setDir] = useState<VoiceDir>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const activeRef = useRef(false) // 已激活（识别中）
  const holdTimerRef = useRef<number | null>(null)
  // ref 同步保存方向，避免松手/移出时读到旧 state
  const dirRef = useRef<VoiceDir>(null)

  const detect = (dx: number, dy: number): VoiceDir => {
    const dist = Math.hypot(dx, dy)
    if (dist < 18) return null
    // 屏幕坐标：y 向下为正；第二象限（左上）为取消
    if (dx < 0 && dy < 0) {
      const ax = Math.abs(dx)
      const ay2 = Math.abs(dy)
      if (ax > 28 && ay2 > 28 && Math.abs(ax - ay2) < 22) return 'cancel'
      if (ay2 > ax) return 'up'
      return 'left'
    }
    if (dy < 0 && Math.abs(dy) > 24) return 'up'
    if (dx < 0 && Math.abs(dx) > 24) return 'left'
    return null
  }

  const clearHold = () => {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
    }
  }

  const handleDown = (e: React.PointerEvent) => {
    startRef.current = { x: e.clientX, y: e.clientY }
    dirRef.current = null
    setDir(null)
    // 捕获指针：拖出按钮范围时仍能持续跟踪方向
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* noop */
    }
    // 按住 HOLD_START_MS 后才激活；轻点（在此之前松手）什么都不发生
    clearHold()
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null
      activeRef.current = true
      onStart()
    }, HOLD_START_MS)
  }

  const handleMove = (e: React.PointerEvent) => {
    if (!startRef.current) return
    const dx = e.clientX - startRef.current.x
    const dy = e.clientY - startRef.current.y
    const d = detect(dx, dy)
    dirRef.current = d
    setDir(d)
  }

  const handleUp = () => {
    const wasActive = activeRef.current
    activeRef.current = false
    startRef.current = null
    clearHold()
    if (!wasActive) return // 轻点：无动作
    const d = dirRef.current
    dirRef.current = null
    setDir(null)
    if (d === 'cancel') {
      onCancel()
      return
    }
    // 先按方向落位（打开对话页 / 新建批注并放置光标），再交付识别文本——
    // 这样语音文本会按光标规则进入刚创建的目标
    if (d) onDir(d)
    onStop()
  }

  return (
    <div className={`voice-btn-wrap ${listening ? 'voice-btn-listening' : ''}`}>
      {/* 扇形指示区（按钮左上方，第二象限） */}
      {listening && (
        <div className={`voice-fan ${dir ? `voice-fan-${dir}` : ''}`} aria-hidden>
          <span className="voice-fan-sector voice-fan-up">对话框</span>
          <span className="voice-fan-sector voice-fan-left">批注</span>
          <span className="voice-fan-sector voice-fan-cancel">取消</span>
        </div>
      )}
      <button
        className={`voice-fab ${listening ? 'mic-on' : ''}`}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerLeave={() => startRef.current && handleUp()}
        onContextMenu={(e) => e.preventDefault()}
        aria-label="按住说话"
      >
        <MicIcon />
      </button>
    </div>
  )
}
