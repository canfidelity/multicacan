'use client'

import { useState, useCallback } from 'react'

interface WalletButtonProps {
  compact?: boolean
  large?: boolean
}

type WalletState = 'disconnected' | 'connecting' | 'connected'

export default function WalletButton({ compact = false, large = false }: WalletButtonProps) {
  const [state, setState] = useState<WalletState>('disconnected')
  const [address, setAddress] = useState<string>('')
  const [error, setError] = useState<string>('')

  const connectWallet = useCallback(async () => {
    setError('')
    if (typeof window === 'undefined') return

    const ethereum = (window as { ethereum?: { request: (args: { method: string }) => Promise<string[]> } }).ethereum
    if (!ethereum) {
      setError('Install MetaMask!')
      return
    }

    setState('connecting')
    try {
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' })
      if (accounts.length > 0) {
        setAddress(accounts[0])
        setState('connected')
      }
    } catch {
      setState('disconnected')
      setError('Rejected!')
    }
  }, [])

  const disconnect = useCallback(() => {
    setState('disconnected')
    setAddress('')
  }, [])

  const shortAddress = address ? `${address.slice(0, 4)}...${address.slice(-4)}` : ''

  const sizeClass = large
    ? 'px-8 py-4 text-sm'
    : compact
    ? 'px-3 py-2 text-xs'
    : 'px-6 py-3 text-xs'

  if (state === 'connected') {
    return (
      <button
        onClick={disconnect}
        className={`pixel-btn pixel-btn-secondary font-pixel ${sizeClass} flex items-center gap-2`}
      >
        <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
        <span>{shortAddress}</span>
      </button>
    )
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        onClick={connectWallet}
        disabled={state === 'connecting'}
        className={`pixel-btn pixel-btn-primary font-pixel ${sizeClass} disabled:opacity-60 disabled:cursor-not-allowed`}
      >
        {state === 'connecting' ? (
          <span className="flex items-center gap-2">
            <span className="animate-pixel-blink">▮</span>
            CONNECTING
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <WalletIcon />
            {compact ? 'CONNECT' : 'CONNECT WALLET'}
          </span>
        )}
      </button>
      {error && (
        <span className="text-red-400 text-xs font-pixel">{error}</span>
      )}
    </div>
  )
}

function WalletIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" style={{ imageRendering: 'pixelated' }}>
      <rect x="1" y="2" width="10" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="7" y="4" width="4" height="4" rx="1" fill="currentColor" />
      <rect x="8" y="5" width="2" height="2" fill="#000" rx="0.5" />
    </svg>
  )
}
