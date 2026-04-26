'use client'

import { useEffect, useRef } from 'react'

interface Props {
  onExit: () => void
}

export default function DemonicStonesGame({ onExit }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Forward touch-triggered keyboard events into the iframe on mobile
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    const onLoad = () => {
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
  }, [])

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
    </div>
  )
}
