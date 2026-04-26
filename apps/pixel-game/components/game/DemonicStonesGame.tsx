'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  onExit: () => void
}

export default function DemonicStonesGame({ onExit }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [started, setStarted] = useState(false)
  const [compiling, setCompiling] = useState(false)

  // Forward touch-triggered keyboard events into the iframe on mobile
  useEffect(() => {
    if (!started) return
    const iframe = iframeRef.current
    if (!iframe) return

    const onLoad = () => {
      setCompiling(false)
      try {
        const doc = iframe.contentDocument
        if (!doc) return
        const canvas = doc.querySelector('canvas') as HTMLCanvasElement | null
        if (!canvas) return

        // Mobile soft-keyboard fix (Godot WASM canvas)
        const kb = doc.createElement('input')
        kb.type = 'text'
        kb.setAttribute('autocomplete', 'off')
        kb.setAttribute('autocorrect', 'off')
        kb.setAttribute('autocapitalize', 'none')
        kb.setAttribute('spellcheck', 'false')
        kb.style.cssText =
          'position:fixed;left:-9999px;top:50%;width:1px;height:1px;' +
          'opacity:0;border:none;outline:none;background:transparent;'
        doc.body.appendChild(kb)

        canvas.addEventListener('touchend', () => {
          kb.value = ''
          kb.focus()
        }, { passive: true })

        const forwardKey = (type: string, e: KeyboardEvent) => {
          canvas.dispatchEvent(new KeyboardEvent(type, {
            key: e.key, code: e.code,
            keyCode: e.keyCode, which: e.which,
            shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, altKey: e.altKey,
            bubbles: true, cancelable: true,
          }))
        }
        kb.addEventListener('keydown',  e => forwardKey('keydown', e))
        kb.addEventListener('keyup',    e => forwardKey('keyup', e))
        kb.addEventListener('keypress', e => forwardKey('keypress', e))
        kb.addEventListener('input', (e) => {
          const chars = ((e as InputEvent).data ?? kb.value) + ''
          for (const c of chars) {
            for (const type of ['keydown', 'keypress', 'keyup']) {
              canvas.dispatchEvent(new KeyboardEvent(type, {
                key: c, code: 'Key' + c.toUpperCase(),
                keyCode: c.charCodeAt(0), which: c.charCodeAt(0),
                charCode: type === 'keypress' ? c.charCodeAt(0) : 0,
                bubbles: true, cancelable: true,
              }))
            }
          }
          kb.value = ''
        })
      } catch {
        // cross-origin guard — shouldn't happen since src is same-origin
      }
    }

    iframe.addEventListener('load', onLoad)
    return () => iframe.removeEventListener('load', onLoad)
  }, [started])

  return (
    <div style={{ position: 'relative', width: '100%', background: '#0a0008' }}>
      {/* Exit button overlay */}
      <button
        onClick={onExit}
        style={{
          position: 'absolute', top: 10, right: 10, zIndex: 20,
          padding: '4px 10px',
          background: 'rgba(60,0,0,0.85)',
          border: '1px solid #440000',
          color: '#ff5555',
          fontFamily: 'monospace',
          fontSize: 11,
          cursor: 'pointer',
        }}
      >
        ✕ EXIT
      </button>

      {/* Pre-load screen */}
      {!started && (
        <div style={{
          width: '100%',
          aspectRatio: '16 / 10',
          background: 'radial-gradient(ellipse at center, #1a0005 0%, #0a0008 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: 24,
        }}>
          <div style={{ fontSize: 48 }}>🪨</div>
          <div style={{
            fontFamily: '"Press Start 2P", monospace',
            fontSize: 10,
            color: '#cc4444',
            textAlign: 'center',
            lineHeight: 1.8,
          }}>
            DEMONIC STONES
          </div>
          <div style={{
            fontFamily: 'monospace',
            fontSize: 11,
            color: '#888',
            textAlign: 'center',
            lineHeight: 1.6,
            maxWidth: 280,
          }}>
            Godot 4 web export<br />
            ~55MB indirilecek<br />
            <span style={{ color: '#ff8844' }}>Mobilde 1-2 dk sürebilir</span>
          </div>
          <button
            onClick={() => { setStarted(true); setCompiling(true) }}
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 9,
              color: '#fff',
              background: 'linear-gradient(180deg, #8b0000, #500000)',
              border: '2px solid #cc2222',
              padding: '12px 24px',
              cursor: 'pointer',
              letterSpacing: 1,
            }}
          >
            ▶ YÜKLE
          </button>
        </div>
      )}

      {/* Loading overlay while WASM compiling */}
      {started && compiling && (
        <div style={{
          position: 'absolute',
          inset: 0,
          zIndex: 10,
          background: 'rgba(10,0,8,0.85)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          pointerEvents: 'none',
        }}>
          <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#cc8844' }}>
            İndiriliyor / Derleniyor...
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#666' }}>
            (mobilde 1-2 dk bekleyin)
          </div>
        </div>
      )}

      {/* Game iframe — only mounted after user taps YÜKLE */}
      {started && (
        <iframe
          ref={iframeRef}
          src="/demonic-stones/index.html"
          style={{
            display: 'block',
            width: '100%',
            aspectRatio: '16 / 10',
            border: 'none',
            background: '#0a0008',
          }}
          allow="autoplay"
          title="Demonic Stones"
        />
      )}
    </div>
  )
}
