export type BlockType = 'h1' | 'h2' | 'p' | 'li' | 'tr'

export interface DocComment {
  id: string
  blockId: string
  blockExcerpt: string
  text: string
  time: string
}

export interface Block {
  id: string
  type: BlockType
  /** 文本型 block 的内容（支持 **粗体**） */
  text: string
  /** tr 型 block 的单元格 */
  cells?: string[]
  /** 预设改写变体：formal / concise / detailed / casual / polish */
  variants?: Record<string, string>
  cellVariants?: Record<string, string[]>
  emphasized?: boolean
  deleted?: boolean
  /** 刚被 AI 修改，触发荧光笔动画 */
  justChanged?: boolean
  /** 正在处理中 */
  processing?: boolean
}

export interface Activity {
  id: string
  kind: 'generate' | 'edit' | 'comment' | 'delete'
  text: string
  quote?: string
  time: string
}

export type Phase = 'intro' | 'generating' | 'ready'
export type Mode = 'idle' | 'circling' | 'acting' | 'commenting'

export interface Point {
  x: number
  y: number
}

/** 语音拖拽方向 */
export type VoiceDir = 'up' | 'left' | 'cancel' | null

/** 批注标签页 */
export interface NoteTab {
  id: string
  blockId: string
  blockExcerpt: string
  /** 圈选印记点（内容坐标系） */
  mark: Point[]
  text: string
  collapsed: boolean
  /** 是否为最近创建（新创建时展开+带光标） */
  fresh: boolean
  /** 创建时间（侧栏展示） */
  time: string
  /** 浮窗锚点（滚动内容坐标系，一般为圈选轨迹外接框左下角下方） */
  anchor: Point
}

/** 输入光标：全局唯一 */
export interface CursorState {
  target: 'note' | 'chat'
  noteId?: string
  /** 在文本中的位置 */
  pos: number
}
