import { useEffect, useRef } from 'react'
import type { Point } from '../types'

interface CircleLayerProps {
  active?: boolean
  /** 留存的圈选印记（用户手绘轨迹，滚动内容坐标系） */
  mark: Point[] | null
  /** 印记是否褪色（完成创建后褪色，点击恢复） */
  dim?: boolean
  onComplete?: (points: Point[]) => void
  onCancel?: () => void
}

/** 中点二次贝塞尔平滑路径 */
function tracePath(ctx: CanvasRenderingContext2D, pts: Point[]) {
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2
    const my = (pts[i].y + pts[i + 1].y) / 2
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my)
  }
  const last = pts[pts.length - 1]
  ctx.lineTo(last.x, last.y)
}

function drawStroke(ctx: CanvasRenderingContext2D, pts: Point[], closed: boolean, w: number, h: number, dim = false) {
  ctx.clearRect(0, 0, w, h)
  if (pts.length < 2) return
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const alpha = dim ? 0.22 : 1
  // 底层“墨水洇开”光晕
  ctx.strokeStyle = `rgba(245, 64, 1, ${0.22 * alpha})`
  ctx.lineWidth = 10
  tracePath(ctx, pts)
  ctx.stroke()
  // 主笔触
  ctx.strokeStyle = closed ? `rgba(245, 64, 1, ${alpha})` : `rgba(245, 64, 1, ${0.92 * alpha})`
  ctx.lineWidth = 3.5
  tracePath(ctx, pts)
  ctx.stroke()
}

/** 射线法判断点是否在多边形内 */
export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x
    const yi = poly[i].y
    const xj = poly[j].x
    const yj = poly[j].y
    const intersect = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/**
 * 命中检测：找出被圈住的最佳 block。
 * 得分 = 交集面积比 + 中心点入圈加成。
 * points 与 container 使用同一坐标系（滚动内容坐标）。
 */
export function findHitBlock(points: Point[], container: HTMLElement): string | null {
  if (points.length < 8) return null
  const cRect = container.getBoundingClientRect()
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  const pathW = maxX - minX
  const pathH = maxY - minY
  if (pathW < 24 || pathH < 24) return null
  const pathArea = pathW * pathH

  let bestId: string | null = null
  let bestScore = 0
  container.querySelectorAll<HTMLElement>('[data-block-id]').forEach((el) => {
    const r = el.getBoundingClientRect()
    const bx = r.left - cRect.left
    const by = r.top - cRect.top
    const ix = Math.max(0, Math.min(maxX, bx + r.width) - Math.max(minX, bx))
    const iy = Math.max(0, Math.min(maxY, by + r.height) - Math.max(minY, by))
    const inter = ix * iy
    if (inter <= 0) return
    const blockArea = r.width * r.height
    let score = inter / Math.min(blockArea, pathArea)
    const center: Point = { x: bx + r.width / 2, y: by + r.height / 2 }
    if (pointInPolygon(center, points)) score += 0.6
    if (score > bestScore) {
      bestScore = score
      bestId = el.dataset.blockId ?? null
    }
  })
  return bestScore > 0.28 ? bestId : null
}

/** 圈选印记层（只读渲染，pointer-events: none） */
export default function CircleLayer({ mark, dim = false }: CircleLayerProps) {
  const markCanvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = markCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const parent = canvas.parentElement!
    const dpr = window.devicePixelRatio || 1
    const rect = parent.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, rect.width, rect.height)
    if (mark && mark.length > 1) {
      drawStroke(ctx, mark, true, rect.width, rect.height, dim)
    }
  }, [mark, dim])

  return (
    <canvas
      ref={markCanvasRef}
      className="circle-mark-layer"
      style={{ display: mark ? 'block' : 'none' }}
      aria-hidden
    />
  )
}

/** 长按激活圈选的时长 */
const LONG_PRESS_MS = 450

interface CirclePadProps {
  enabled: boolean
  onComplete: (points: Point[]) => void
}

/**
 * 常驻圈选垫：监听父容器（.doc-scroll-inner）的指针事件，
 * 长按 LONG_PRESS_MS 且未明显移动后进入画圈；松手成型（轨迹原样保留）。
 * 画布只负责显示，不拦截事件，因此不影响页面滚动、点击与批注交互。
 */
export function CirclePad({ enabled, onComplete }: CirclePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ptsRef = useRef<Point[]>([])
  const drawingRef = useRef(false)
  const pressTimerRef = useRef<number | null>(null)
  const pressStartRef = useRef<Point | null>(null)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !enabled) return
    const parent = canvas.parentElement!
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const w = parent.scrollWidth
      const h = parent.scrollHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    const toLocal = (e: PointerEvent): Point => {
      const rect = parent.getBoundingClientRect()
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }

    const redraw = () => {
      drawStroke(ctx, ptsRef.current, false, canvas.width, canvas.height)
    }

    const clearPress = () => {
      if (pressTimerRef.current) {
        window.clearTimeout(pressTimerRef.current)
        pressTimerRef.current = null
      }
      pressStartRef.current = null
    }

    const clearCanvas = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return
      // 落在交互控件上的按压不参与圈选
      const t = e.target as HTMLElement
      if (t.closest('button, textarea, input, a, .note-anchor, .chat-panel, .chat-mini, .dock-zone, .panel-drawer')) return
      pressStartRef.current = toLocal(e)
      drawingRef.current = false
      pressTimerRef.current = window.setTimeout(() => {
        pressTimerRef.current = null
        drawingRef.current = true
        resize()
        ptsRef.current = pressStartRef.current ? [pressStartRef.current] : []
        redraw()
      }, LONG_PRESS_MS)
    }

    // 长按圈选期间屏蔽系统右键/长按菜单与默认选中行为
    const onContextMenu = (e: Event) => {
      if (pressTimerRef.current || drawingRef.current) e.preventDefault()
    }

    const onMove = (e: PointerEvent) => {
      const p = toLocal(e)
      // 长按期间移动超过阈值 → 视为滚动/查看，放弃本次圈选
      if (pressTimerRef.current && pressStartRef.current) {
        const d = Math.hypot(p.x - pressStartRef.current.x, p.y - pressStartRef.current.y)
        if (d > 12) {
          clearPress()
          drawingRef.current = false
          ptsRef.current = []
          return
        }
      }
      if (!drawingRef.current) return
      const pts = ptsRef.current
      const last = pts[pts.length - 1]
      if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 3) {
        pts.push(p)
        redraw()
      }
    }

    const onUp = () => {
      if (pressTimerRef.current) {
        // 未达到长按时长：什么都不发生
        clearPress()
        return
      }
      clearPress()
      if (!drawingRef.current) return
      drawingRef.current = false
      const pts = ptsRef.current
      ptsRef.current = []
      clearCanvas()
      if (pts.length >= 8) onCompleteRef.current(pts)
    }

    parent.addEventListener('pointerdown', onDown)
    parent.addEventListener('contextmenu', onContextMenu)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      parent.removeEventListener('pointerdown', onDown)
      parent.removeEventListener('contextmenu', onContextMenu)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      clearPress()
      clearCanvas()
    }
  }, [enabled])

  return <canvas ref={canvasRef} className="circle-pad" aria-hidden />
}
