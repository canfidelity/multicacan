'use client'

import type { HUDState } from './MMORPGGame'

interface Props {
  hud: HUDState | null
  walletAddress: string | null
  onConnectWallet: () => void
  onMintNFT: () => void
  onExit: () => void
}

const CLASS_ICONS: Record<string, string> = {
  warrior: '⚔️',
  mage: '🔮',
  rogue: '🗡️',
  archer: '🏹',
  paladin: '🛡️',
}

const SKILL_ICONS = ['⚔️', '💥', '🔮', '🛡️']
const SKILL_KEYS = ['Q', 'E', 'R', 'F']

function Bar({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  const pct = Math.max(0, Math.min(1, value / max)) * 100
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-gray-400 font-mono text-[10px] w-6 shrink-0">{label}</span>
      <div className="flex-1 h-3 bg-black/60 border border-black/40 rounded-sm overflow-hidden">
        <div
          className="h-full transition-all duration-100 rounded-sm"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="text-[9px] font-mono w-12 text-right shrink-0" style={{ color }}>
        {Math.floor(value)}/{max}
      </span>
    </div>
  )
}

export default function GameHUD({ hud, walletAddress, onConnectWallet, onMintNFT, onExit }: Props) {
  if (!hud) return null

  return (
    <div className="absolute inset-0 pointer-events-none select-none overflow-hidden">

      {/* ── Top-left: Player Stats Panel ──────────────────────────── */}
      <div className="absolute top-3 left-3 pointer-events-auto"
        style={{ width: 220, background: 'rgba(8,5,20,0.88)', border: '1px solid #6a4010', boxShadow: '0 0 12px rgba(200,120,0,0.3)' }}>
        {/* Header */}
        <div className="px-2 py-1.5 border-b border-yellow-900/50 flex items-center gap-2">
          <span className="text-lg leading-none">{CLASS_ICONS[hud.playerClass] || '⚔️'}</span>
          <div>
            <div className="font-mono text-yellow-300 text-[11px] font-bold leading-tight truncate max-w-[130px]">
              {hud.playerName}
            </div>
            <div className="font-mono text-[9px] text-purple-400 uppercase leading-tight">
              {hud.playerClass} · Lv.{hud.level}
            </div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-[9px] font-mono text-green-400">● LIVE</div>
            <div className="text-[8px] font-mono text-gray-600">{hud.enemyCount} enemies</div>
          </div>
        </div>

        {/* Bars */}
        <div className="px-2 py-1.5 space-y-1">
          <Bar value={hud.hp} max={hud.maxHp} color="#dd2222" label="HP" />
          <Bar value={hud.mp} max={hud.maxMp} color="#2255cc" label="MP" />
          <Bar value={hud.xp} max={hud.xpNext} color="#cc8800" label="XP" />
        </div>

        {/* Resources */}
        <div className="px-2 pb-2 flex gap-2">
          <div className="flex items-center gap-1">
            <span className="text-[11px]">🪙</span>
            <span className="text-yellow-400 font-mono text-[10px]">{hud.gold}</span>
          </div>
          <div className="flex items-center gap-1 ml-auto">
            <span className="text-[11px]">👥</span>
            <span className="text-green-400 font-mono text-[10px]">1,284</span>
          </div>
        </div>
      </div>

      {/* ── Top-right: Wallet + Exit ────────────────────────────────── */}
      <div className="absolute top-3 right-3 flex flex-col items-end gap-2 pointer-events-auto">
        {walletAddress ? (
          <div style={{ background: 'rgba(8,5,20,0.9)', border: '1px solid #6a4010' }}
            className="px-3 py-1.5 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400" />
            <span className="font-mono text-[10px] text-green-300">
              {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
            </span>
            <button
              onClick={onMintNFT}
              className="ml-2 px-2 py-0.5 text-[9px] font-mono text-purple-300 border border-purple-700 hover:bg-purple-900/50 transition-colors"
            >
              MINT NFT
            </button>
          </div>
        ) : (
          <button
            onClick={onConnectWallet}
            style={{ background: 'rgba(8,5,20,0.9)', border: '1px solid #6a4010' }}
            className="px-3 py-1.5 text-[10px] font-mono text-yellow-400 hover:text-yellow-200 hover:border-yellow-600 transition-colors"
          >
            🦊 Connect Wallet
          </button>
        )}
        <button
          onClick={onExit}
          style={{ background: 'rgba(8,5,20,0.9)', border: '1px solid #441010' }}
          className="px-3 py-1 text-[9px] font-mono text-red-500 hover:text-red-300 transition-colors"
        >
          ✕ EXIT
        </button>
      </div>

      {/* ── Bottom-center: Skill Hotbar ──────────────────────────────── */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
        {/* Attack */}
        <div style={{ background: 'rgba(8,5,20,0.9)', border: '1px solid #8B6020', width: 52, height: 52 }}
          className="flex flex-col items-center justify-center relative overflow-hidden">
          <span className="text-xl leading-none">⚔️</span>
          <span className="text-[8px] font-mono text-yellow-600 mt-0.5">SPACE</span>
        </div>

        {SKILL_ICONS.map((icon, i) => {
          const cd = hud.skillCooldowns[i]
          const onCd = cd > 0
          return (
            <div key={i}
              style={{
                background: 'rgba(8,5,20,0.9)',
                border: `1px solid ${onCd ? '#333' : '#8B6020'}`,
                width: 52, height: 52,
                opacity: onCd ? 0.7 : 1,
              }}
              className="flex flex-col items-center justify-center relative overflow-hidden">
              <span className="text-xl leading-none" style={{ opacity: onCd ? 0.4 : 1 }}>{icon}</span>
              <span className="text-[8px] font-mono mt-0.5" style={{ color: onCd ? '#666' : '#c89030' }}>
                {SKILL_KEYS[i]}
              </span>
              {onCd && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[11px] font-mono text-white font-bold">{cd.toFixed(1)}</span>
                </div>
              )}
              {onCd && (
                <div className="absolute bottom-0 left-0 right-0 bg-blue-900/40"
                  style={{ height: `${(cd / [3, 8, 5, 12][i]) * 100}%` }} />
              )}
            </div>
          )
        })}
      </div>

      {/* ── Bottom-left: Chat ────────────────────────────────────────── */}
      <div className="absolute bottom-4 left-3"
        style={{ width: 280, background: 'rgba(8,5,20,0.82)', border: '1px solid #4a3010' }}>
        <div className="px-2 py-1 border-b border-yellow-900/30">
          <span className="text-[9px] font-mono text-yellow-700">WORLD CHAT</span>
        </div>
        <div className="px-2 py-1 space-y-0.5 max-h-[90px] overflow-hidden">
          {hud.chatMessages.slice(-6).map((m, i) => (
            <div key={i} className="flex gap-1 text-[9px] font-mono leading-tight"
              style={{ opacity: Math.min(1, (10 - m.age) / 3) }}>
              <span style={{ color: m.color }} className="shrink-0">[{m.name}]</span>
              <span className="text-gray-400 truncate">{m.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Bottom-right: Minimap ────────────────────────────────────── */}
      <div className="absolute bottom-4 right-3"
        style={{ width: 110, height: 110, background: 'rgba(8,5,20,0.9)', border: '1px solid #8B6020' }}>
        <div className="absolute top-1 left-1.5 text-[8px] font-mono text-yellow-700">MAP</div>
        {/* Zones */}
        <svg viewBox="0 0 40 40" className="w-full h-full" style={{ imageRendering: 'pixelated' }}>
          {/* Background */}
          <rect width="40" height="40" fill="#2a5a18" />
          {/* Town */}
          <rect x="16" y="16" width="8" height="8" fill="#888070" />
          {/* Roads */}
          <rect x="0" y="19" width="40" height="2" fill="#c8904a" opacity="0.7" />
          <rect x="19" y="0" width="2" height="40" fill="#c8904a" opacity="0.7" />
          {/* Dungeon */}
          <rect x="26" y="0" width="14" height="10" fill="#18102a" />
          {/* Forest */}
          <rect x="0" y="0" width="14" height="14" fill="#1a4a10" />
          <rect x="26" y="26" width="14" height="14" fill="#1a4a10" />
          {/* Water */}
          <circle cx="7" cy="30" r="5" fill="#2060a0" opacity="0.8" />
          {/* Portal */}
          <circle cx="30" cy="5" r="1.5" fill="#cc44ff" />
          {/* Player dot */}
          <rect x="19" y="19" width="2.5" height="2.5" fill="#ffd700" />
          {/* Enemy dots */}
          <circle cx="5" cy="5" r="1" fill="#ff4444" />
          <circle cx="8" cy="3" r="1" fill="#ff4444" />
          <circle cx="10" cy="8" r="1" fill="#ff4444" />
          <circle cx="30" cy="3" r="1" fill="#44ff44" />
          <circle cx="28" cy="28" r="1" fill="#ff8844" />
          <circle cx="3" cy="28" r="1" fill="#ff8844" />
        </svg>
      </div>

      {/* ── Controls hint ───────────────────────────────────────────── */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2"
        style={{ background: 'rgba(8,5,20,0.8)', border: '1px solid #4a3010', padding: '4px 12px' }}>
        <span className="font-mono text-[9px] text-gray-500">WASD · SPACE attack · Q/E/R/F skills · I inventory</span>
      </div>

      {/* ── Death Screen ────────────────────────────────────────────── */}
      {hud.dead && (
        <div className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ background: 'rgba(120,0,0,0.5)' }}>
          <div className="font-mono text-5xl text-red-400 font-bold mb-4"
            style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 28, textShadow: '0 0 20px #ff0000' }}>
            YOU DIED
          </div>
          <div className="font-mono text-sm text-red-300">
            Respawning in {Math.ceil(hud.respTimer)}s...
          </div>
        </div>
      )}

    </div>
  )
}
