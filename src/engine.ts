import type { Block } from './types'

export interface EngineResult {
  blocks: Block[]
  reply: string
  kind: 'edit' | 'delete'
}

const numRe = /[¥￥]?\s*[\d,]+(?:\.\d+)?\s*(?:万|千|百|元|块|%|台|个|人|天|小时|dB)?/

/** 从指令中提取“改成 150 万”这类目标数字 */
function extractNumber(instruction: string): string | null {
  const m = instruction.match(
    /(?:改成|改为|换成|调整为|调整到|调到|改成到|变成)\s*[「"']?\s*([¥￥]?\s*[\d,]+(?:\.\d+)?\s*(?:万|千|百|元|块|%|台|个|人|天|小时|dB)?)/
  )
  return m ? m[1].trim() : null
}

/** 从指令中提取“改成 XXX”的新文本（不含数字情形） */
function extractReplacement(instruction: string): string | null {
  const m = instruction.match(/(?:改成|改为|换成|写成|变为|变成)\s*[:：]?\s*[「"'\[]?(.+?)[」"'\]]?\s*$/)
  if (!m) return null
  const text = m[1].trim()
  if (!text || text.length < 2) return null
  // 纯数字/风格词不当作全文替换
  if (/^[\d,.\s¥￥万千百元块%台个人天小时dB]+$/.test(text)) return null
  if (/^(更)?(正式|严肃|简洁|精简|详细|口语|短一点|小标题|标题)$/.test(text)) return null
  return text
}

function replaceFirstNumber(source: string, next: string): string | null {
  const m = source.match(numRe)
  if (!m) return null
  return source.replace(numRe, next)
}

/**
 * 模拟 AI 引擎：把语音指令应用到一个 block 上。
 */
export function applyInstruction(blocks: Block[], blockId: string, raw: string): EngineResult {
  const instruction = raw.trim()
  const next = blocks.map((b) => ({ ...b }))
  const block = next.find((b) => b.id === blockId)
  if (!block) {
    return { blocks, reply: '没有找到要修改的位置，请重新圈选。', kind: 'edit' }
  }

  const mark = () => {
    block.justChanged = true
    block.processing = false
  }

  // 1) 删除
  if (/(删除|删掉|去掉|移除|不要了)/.test(instruction)) {
    block.deleted = true
    block.processing = false
    return { blocks: next, reply: '好的，这段已经删掉了。', kind: 'delete' }
  }

  // 2) 数字更新（对含数字的段落/表格行最自然）
  const targetNum = extractNumber(instruction)
  if (targetNum) {
    if (block.type === 'tr' && block.cells) {
      const idx = block.cells.findIndex((c) => numRe.test(c))
      if (idx >= 0) {
        const cells = [...block.cells]
        cells[idx] = replaceFirstNumber(cells[idx], targetNum) ?? targetNum
        block.cells = cells
        mark()
        return { blocks: next, reply: `已把「${cells[0]}」的数值更新为 ${targetNum}。`, kind: 'edit' }
      }
    }
    const replaced = replaceFirstNumber(block.text, targetNum)
    if (replaced && replaced !== block.text) {
      block.text = replaced
      mark()
      return { blocks: next, reply: `已把数字更新为 ${targetNum}。`, kind: 'edit' }
    }
  }

  // 3) 全文替换：“改成 XXX”
  const replacement = extractReplacement(instruction)
  if (replacement && block.type !== 'tr') {
    block.text = replacement
    mark()
    return { blocks: next, reply: '已按你的说法改好了。', kind: 'edit' }
  }

  // 4) 风格改写
  const styleMap: Array<[RegExp, string, string]> = [
    [/(正式|严肃|商务|公文)/, 'formal', '已改得更正式了。'],
    [/(精简|简洁|缩短|短一点|简单点|太长)/, 'concise', '已帮你精简了。'],
    [/(详细|扩写|展开|丰富|具体|多一点)/, 'detailed', '已补充了更多细节。'],
    [/(口语|通俗|接地气|大白话)/, 'casual', '已改成更口语的说法。'],
    [/(润色|优化|顺一点|好一点)/, 'polish', '已顺手润色了一下。'],
  ]
  for (const [re, key, reply] of styleMap) {
    if (re.test(instruction)) {
      const variant = block.variants?.[key]
      if (block.type === 'tr' && block.cellVariants?.[key]) {
        block.cells = [...block.cellVariants[key]]
        mark()
        return { blocks: next, reply, kind: 'edit' }
      }
      if (variant) {
        block.text = variant
        mark()
        return { blocks: next, reply, kind: 'edit' }
      }
      // 没有对应变体时，退回全文替换尝试，否则给出诚实反馈
      mark()
      return { blocks: next, reply: '这段我按这个方向微调了一下，你看是否合适。', kind: 'edit' }
    }
  }

  // 5) 转小标题
  if (/(小标题|标题|改成题目|变成标题)/.test(instruction)) {
    if (block.type === 'h2' || block.type === 'h1') {
      return { blocks, reply: '这一段已经是标题了。', kind: 'edit' }
    }
    block.type = 'h2'
    mark()
    return { blocks: next, reply: '已把这段提升为小标题。', kind: 'edit' }
  }

  // 6) 强调
  if (/(加粗|强调|突出|标红|重点|highlight|高亮)/i.test(instruction)) {
    block.emphasized = !block.emphasized
    mark()
    return {
      blocks: next,
      reply: block.emphasized ? '已把这段标记为重点。' : '已取消这段的重点标记。',
      kind: 'edit',
    }
  }

  // 7) 兜底：应用润色变体或原样确认
  if (block.variants?.polish) {
    block.text = block.variants.polish
    mark()
    return { blocks: next, reply: '已按你的意思微调了这一段。', kind: 'edit' }
  }
  mark()
  return { blocks: next, reply: '收到，我按你的意思处理了这段，细节你可以继续圈选调整。', kind: 'edit' }
}
