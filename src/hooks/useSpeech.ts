import { useCallback, useEffect, useRef, useState } from 'react'

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((e: any) => void) | null
  onend: (() => void) | null
  onerror: ((e: any) => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
}

export interface SpeechState {
  supported: boolean
  listening: boolean
  interim: string
  error: string | null
  start: () => void
  stop: () => void
  cancel: () => void
}

/** 流式模拟：真实语音不可用时的演示模式 */
const MOCK_TEXT = '这一段再精简一些，把数字改成 150 万'
const MOCK_SLICE_MS = 150

export function useSpeech(onFinal: (text: string) => void): SpeechState {
  const [supported] = useState(
    () => typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  )
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)

  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const finalRef = useRef('')
  const interimRef = useRef('')
  const cancelledRef = useRef(false)
  const mockTimerRef = useRef<number | null>(null)
  const watchdogRef = useRef<number | null>(null)
  const mockModeRef = useRef(false)
  const onFinalRef = useRef(onFinal)
  onFinalRef.current = onFinal

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current) {
      window.clearTimeout(watchdogRef.current)
      watchdogRef.current = null
    }
  }, [])

  const clearMock = useCallback(() => {
    if (mockTimerRef.current) {
      window.clearInterval(mockTimerRef.current)
      mockTimerRef.current = null
    }
    mockModeRef.current = false
  }, [])

  const cleanup = useCallback(() => {
    clearMock()
    clearWatchdog()
    if (recRef.current) {
      recRef.current.onresult = null
      recRef.current.onend = null
      recRef.current.onerror = null
      try {
        recRef.current.abort()
      } catch {
        /* noop */
      }
      recRef.current = null
    }
  }, [clearMock])

  useEffect(() => cleanup, [cleanup])

  const startMock = useCallback(() => {
    mockModeRef.current = true
    setListening(true)
    setInterim('')
    let i = 0
    mockTimerRef.current = window.setInterval(() => {
      i += 1
      const next = MOCK_TEXT.slice(0, i)
      interimRef.current = next
      setInterim(next)
      if (i >= MOCK_TEXT.length && mockTimerRef.current) {
        window.clearInterval(mockTimerRef.current)
        mockTimerRef.current = null
      }
    }, MOCK_SLICE_MS)
  }, [])

  /** 无声/演示环境：放弃真实引擎，进入模拟流式 */
  const fallbackToMock = useCallback(() => {
    if (recRef.current) {
      recRef.current.onresult = null
      recRef.current.onend = null
      recRef.current.onerror = null
      try {
        recRef.current.abort()
      } catch {
        /* noop */
      }
      recRef.current = null
    }
    cancelledRef.current = false
    startMock()
  }, [startMock])

  const stopMock = useCallback(() => {
    if (!mockModeRef.current) return
    clearMock()
    setListening(false)
    // 松手即“识别完成”：流式预览定格为完整识别结果（同真实 STT 的 final 修正）
    const text = MOCK_TEXT.trim()
    interimRef.current = ''
    setInterim('')
    if (!cancelledRef.current && text) onFinalRef.current(text)
    cancelledRef.current = false
  }, [clearMock])

  const cancelMock = useCallback(() => {
    if (!mockModeRef.current) return
    cancelledRef.current = true
    clearMock()
    setListening(false)
    interimRef.current = ''
    setInterim('')
  }, [clearMock])

  const start = useCallback(() => {
    if (recRef.current || mockModeRef.current) return
    if (!supported) {
      cancelledRef.current = false
      startMock()
      return
    }
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition
    const rec = new Ctor!()
    rec.lang = 'zh-CN'
    rec.continuous = false
    rec.interimResults = true
    rec.maxAlternatives = 1
    finalRef.current = ''
    interimRef.current = ''
    cancelledRef.current = false
    setInterim('')
    setError(null)

    rec.onresult = (e: any) => {
      clearWatchdog()
      let interimText = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) finalRef.current += r[0].transcript
        else interimText += r[0].transcript
      }
      interimRef.current = interimText
      setInterim(interimText)
    }
    rec.onend = () => {
      clearWatchdog()
      const text = (finalRef.current || interimRef.current || '').trim()
      recRef.current = null
      setListening(false)
      setInterim('')
      interimRef.current = ''
      if (!cancelledRef.current && text) onFinalRef.current(text)
      cancelledRef.current = false
    }
    rec.onerror = (e: any) => {
      clearWatchdog()
      recRef.current = null
      setListening(false)
      if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') {
        setError('麦克风权限被拒绝，已切换为演示模式')
        cancelledRef.current = false
        startMock()
      } else if (e?.error === 'no-speech') {
        setError('没有听到声音，再试一次？')
      } else if (e?.error !== 'aborted') {
        setError('语音识别暂不可用，已切换为演示模式')
        cancelledRef.current = false
        startMock()
      }
    }

    recRef.current = rec
    try {
      rec.start()
      setListening(true)
      // 看门狗：真实引擎在无麦克风/无声环境下可能既不回调也不报错，
      // 900ms 内没有任何识别事件就切换为演示模式
      clearWatchdog()
      watchdogRef.current = window.setTimeout(() => {
        if (recRef.current && !finalRef.current && !interimRef.current) {
          setError('未检测到语音输入，已切换为演示模式')
          fallbackToMock()
        }
      }, 900)
    } catch {
      recRef.current = null
      setError('语音识别启动失败，已切换为演示模式')
      cancelledRef.current = false
      startMock()
    }
  }, [supported, startMock, fallbackToMock, clearWatchdog])

  const stop = useCallback(() => {
    if (mockModeRef.current) {
      stopMock()
      return
    }
    if (recRef.current) {
      // 快速点按且没有任何识别结果：按演示模式交付模拟文本
      if (!finalRef.current && !interimRef.current && !cancelledRef.current) {
        fallbackToMock()
        // 立刻结算一次（以完整模拟文本）
        interimRef.current = MOCK_TEXT
        setInterim(MOCK_TEXT)
        stopMock()
        return
      }
      try {
        recRef.current.stop()
      } catch {
        /* noop */
      }
    }
  }, [stopMock, fallbackToMock])

  const cancel = useCallback(() => {
    clearWatchdog()
    if (mockModeRef.current) {
      cancelMock()
      return
    }
    cancelledRef.current = true
    if (recRef.current) {
      try {
        recRef.current.abort()
      } catch {
        /* noop */
      }
      recRef.current = null
    }
    setListening(false)
    setInterim('')
  }, [cancelMock])

  return { supported, listening, interim, error, start, stop, cancel }
}
