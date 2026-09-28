import type { ReactNode } from 'react'

interface PhoneFrameProps {
  folded: boolean
  children: ReactNode
}

export default function PhoneFrame({ folded, children }: PhoneFrameProps) {
  return (
    <div className={`phone-shell ${folded ? 'phone-folded' : 'phone-unfolded'}`}>
      {/* 侧边按键 */}
      <span className="phone-key phone-key-power" aria-hidden />
      <span className="phone-key phone-key-vol" aria-hidden />

      <div className="phone-screen">
        {/* 状态栏 */}
        <div className="phone-statusbar">
          <span className="sb-time">9:41</span>
          <span className="sb-icons">
            <svg viewBox="0 0 20 14" width="16" height="12" fill="currentColor" aria-hidden>
              <rect x="0" y="9" width="3" height="5" rx="1" />
              <rect x="5" y="6" width="3" height="8" rx="1" />
              <rect x="10" y="3" width="3" height="11" rx="1" />
              <rect x="15" y="0" width="3" height="14" rx="1" opacity="0.35" />
            </svg>
            <svg viewBox="0 0 24 18" width="16" height="12" fill="currentColor" aria-hidden>
              <path d="M12 15.2 9.6 12.6a3.6 3.6 0 0 1 4.8 0L12 15.2z" />
              <path d="M6.7 9.8a8 8 0 0 1 10.6 0l-1.9 2a5.4 5.4 0 0 0-6.8 0l-1.9-2z" opacity="0.75" />
              <path d="M3.8 6.6a12.4 12.4 0 0 1 16.4 0l-1.9 2a9.8 9.8 0 0 0-12.6 0l-1.9-2z" opacity="0.45" />
            </svg>
            <svg viewBox="0 0 28 14" width="22" height="12" fill="none" stroke="currentColor" aria-hidden>
              <rect x="1" y="1.5" width="22" height="11" rx="3" strokeWidth="1.4" />
              <rect x="3" y="3.5" width="14" height="7" rx="1.6" fill="currentColor" stroke="none" />
              <rect x="24.5" y="5" width="2.6" height="4" rx="1.2" fill="currentColor" stroke="none" opacity="0.5" />
            </svg>
          </span>
        </div>

        {/* 展开态铰链 */}
        {!folded && <span className="phone-hinge" aria-hidden />}

        {children}
      </div>
    </div>
  )
}
