'use client'

import type { HUDState } from './PhaserGame'

interface Props {
  hud: HUDState | null
  walletAddress: string | null
  onConnectWallet: () => void
  onMintNFT: () => void
  onExit: () => void
}

const CLASS_ICONS: Record<string, string> = {
  warrior: '⚔️', mage: '🔮', rogue: '🗡️', archer: '🏹', paladin: '🛡️',
}
const SKILL_NAMES = ['Strike', 'Burst', 'Mystic', 'Ultimate']
const SKILL_KEYS = ['Q', 'E', 'R', 'F']
const SKILL_ICONS = ['💥', '🔥', '🔮', '⚡']
const SKILL_MAX_CD = [3, 8, 5, 12]

function Bar({ value, max, color, bg, label }: {
  value: number; max: number; color: string; bg: string; label: string
}) {
  const pct = Math.max(0, Math.min(1, max > 0 ? value / max : 0)) * 100
  return (
    <div className="flex items-center gap-1.5 w-full">
      <span className="font-mono text-[9px] text-gray-500 w-5 shrink-0 text-right">{label}</span>
      <div className="flex-1 h-[10px] rounded-sm overflow-hidden" style={{ background: bg }}>
        <div className="h-full transition-all duration-75 rounded-sm" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="font-mono text-[9px] w-[52px] text-right shrink-0" style={{ color }}>
        {Math.floor(value)}/{max}
      </span>
    </div>
  )
}

export default function PhaserHUD({ hud, walletAddress, onConnectWallet, onMintNFT, onExit }: Props) {
  if (!hud) return null

  return (
    <div className="absolute inset-0 pointer-events-none select-none">

      {/* ── Top-left: Player Panel ─────────────────────────────── */}
      <div
        className="absolute top-3 left-3 pointer-events-auto flex flex-col gap-0"
        style={{
          width: 230,
          background: 'rgba(6,4,16,0.92)',
          border: '1px solid #5a3a08',
          boxShadow: '0 0 16px rgba(200,120,0,0.2), inset 0 0 8px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-2 py-2 border-b border-yellow-900/30">
          <div
            className="w-8 h-8 flex items-center justify-center text-lg shrink-0"
            style={{ background: 'rgba(255,200,0,0.08)', border: '1px solid #5a3a08' }}
          >
            {CLASS_ICONS[hud.playerClass]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-mono text-yellow-300 text-[11px] font-bold truncate leading-tight">
              {hud.playerName}
            </div>
            <div className="font-mono text-[9px] text-purple-400 leading-tight uppercase">
              {hud.playerClass} · Lv.{hud.level}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="font-mono text-[8px] text-green-400">● ONLINE</div>
            <div className="font-mono text-[8px] text-gray-600">{hud.onlineCount}</div>
          </div>
        </div>

        {/* Bars */}
        <div className="px-2 py-1.5 space-y-1">
          <Bar value={hud.hp} max={hud.maxHp} color="#ee2222" bg="rgba(80,0,0,0.6)" label="HP" />
          <Bar value={hud.mp} max={hud.maxMp} color="#3366ee" bg="rgba(0,0,80,0.6)" label="MP" />
          <Bar value={hud.xp} max={hud.xpNext} color="#cc9900" bg="rgba(60,40,0,0.6)" label="XP" />
        </div>

        {/* Resources */}
        <div className="flex items-center gap-3 px-2 pb-2">
          <div className="flex items-center gap-1">
            <span className="text-[12px]">🪙</span>
            <span className="font-mono text-yellow-400 text-[10px] font-bold">{hud.gold}</span>
          </div>
          <div className="flex items-center gap-1 ml-auto">
            <span className="font-mono text-[9px] text-gray-600">ATK</span>
            <span className="font-mono text-[9px] text-red-400">{10 + hud.level * 3}</span>
          </div>
        </div>
      </div>

      {/* ── Top-right: Wallet + Exit ───────────────────────────── */}
      <div className="absolute top-3 right-3 flex flex-col items-end gap-2 pointer-events-auto">
        {walletAddress ? (
          <div
            className="flex items-center gap-2 px-3 py-1.5"
            style={{ background: 'rgba(6,4,16,0.92)', border: '1px solid #5a3a08' }}
          >
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="font-mono text-[10px] text-green-300">
              {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
            </span>
            <button
              onClick={onMintNFT}
              className="ml-2 px-2 py-0.5 font-mono text-[9px] text-purple-300 border border-purple-700/60 hover:bg-purple-900/40 transition-colors"
            >
              MINT NFT
            </button>
          </div>
        ) : (
          <button
            onClick={onConnectWallet}
            className="px-3 py-1.5 font-mono text-[10px] text-yellow-400 hover:text-yellow-200 transition-colors"
            style={{ background: 'rgba(6,4,16,0.92)', border: '1px solid #5a3a08' }}
          >
            🦊 Connect Wallet
          </button>
        )}
        <button
          onClick={onExit}
          className="px-3 py-1 font-mono text-[9px] text-red-500 hover:text-red-300 transition-colors"
          style={{ background: 'rgba(6,4,16,0.92)', border: '1px solid #440000' }}
        >
          ✕ EXIT
        </button>
      </div>

      {/* ── Top-center: Controls hint ──────────────────────────── */}
      <div
        className="absolute top-3 left-1/2 -translate-x-1/2"
        style={{ background: 'rgba(6,4,16,0.88)', border: '1px solid #3a2808', padding: '3px 12px' }}
      >
        <span className="font-mono text-[8px] text-gray-600">
          WASD move · SPACE attack · Q/E/R/F skills
        </span>
      </div>

      {/* ── Bottom-center: Skill Hotbar ────────────────────────── */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-end gap-1.5 pointer-events-auto">
        {/* Auto-attack */}
        <div
          className="flex flex-col items-center justify-center"
          style={{
            width: 50, height: 50,
            background: 'rgba(6,4,16,0.92)',
            border: '1px solid #8B6020',
            boxShadow: '0 0 8px rgba(200,120,0,0.15)',
          }}
        >
          <span className="text-[18px] leading-none">⚔️</span>
          <span className="font-mono text-[7px] text-yellow-600 mt-0.5">SPACE</span>
        </div>

        {SKILL_ICONS.map((icon, i) => {
          const cd = hud.skillCooldowns[i] ?? 0
          const onCd = cd > 0
          const cdPct = cd / SKILL_MAX_CD[i]
          return (
            <div
              key={i}
              className="flex flex-col items-center justify-center relative overflow-hidden"
              style={{
                width: 54, height: 54,
                background: onCd ? 'rgba(6,4,16,0.95)' : 'rgba(10,6,24,0.92)',
                border: `1px solid ${onCd ? '#333' : '#8B6020'}`,
                opacity: onCd ? 0.75 : 1,
                boxShadow: onCd ? 'none' : '0 0 8px rgba(200,120,0,0.12)',
              }}
            >
              {/* CD fill */}
              {onCd && (
                <div
                  className="absolute bottom-0 left-0 right-0"
                  style={{ height: `${cdPct * 100}%`, background: 'rgba(30,20,60,0.7)' }}
                />
              )}
              <span className="text-[20px] leading-none relative z-10" style={{ opacity: onCd ? 0.35 : 1 }}>
                {icon}
              </span>
              <span
                className="font-mono text-[7px] mt-0.5 relative z-10"
                style={{ color: onCd ? '#444' : '#c89030' }}
              >
                {SKILL_KEYS[i]}
              </span>
              {onCd && (
                <div className="absolute inset-0 flex items-center justify-center z-20">
                  <span className="font-mono text-[12px] text-white font-bold">{cd.toFixed(1)}</span>
                </div>
              )}
              {!onCd && (
                <div
                  className="absolute bottom-0 left-0 right-0 text-center"
                  style={{ fontSize: '6px', fontFamily: 'monospace', color: '#666', paddingBottom: 1 }}
                >
                  {SKILL_NAMES[i]}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Bottom-left: Chat ──────────────────────────────────── */}
      <div
        className="absolute bottom-3 left-3"
        style={{
          width: 270,
          background: 'rgba(6,4,16,0.88)',
          border: '1px solid #3a2808',
        }}
      >
        <div className="px-2 py-1 border-b border-yellow-900/20">
          <span className="font-mono text-[8px] text-yellow-800">💬 WORLD CHAT</span>
        </div>
        <div className="px-2 py-1 space-y-px" style={{ minHeight: 72 }}>
          {hud.chatMessages.slice(-5).map((m, i) => (
            <div key={i} className="flex gap-1 font-mono text-[8px] leading-snug"
              style={{ opacity: Math.min(1, (10 - m.age) / 2.5) }}>
              <span className="shrink-0" style={{ color: m.color }}>[{m.name}]</span>
              <span className="text-gray-400 truncate">{m.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Bottom-right: Minimap ──────────────────────────────── */}
      <div
        className="absolute bottom-3 right-3"
        style={{
          width: 120, height: 120,
          background: 'rgba(6,4,16,0.92)',
          border: '1px solid #8B6020',
        }}
      >
        <svg viewBox="0 0 50 50" className="w-full h-full" style={{ imageRendering: 'pixelated' }}>
          <rect width="50" height="50" fill="#2a5a18" />
          {/* Town */}
          <rect x="20" y="20" width="10" height="10" fill="#888070" />
          {/* Roads */}
          <rect x="0" y="24" width="50" height="2" fill="#c8904a" opacity="0.7" />
          <rect x="24" y="0" width="2" height="50" fill="#c8904a" opacity="0.7" />
          {/* Dungeon NE */}
          <rect x="32" y="0" width="18" height="14" fill="#18102a" />
          {/* Forest NW */}
          <rect x="0" y="0" width="18" height="18" fill="#1a4a10" />
          {/* SW swamp */}
          <rect x="0" y="32" width="18" height="18" fill="#2a4a10" />
          {/* SE lava */}
          <rect x="32" y="36" width="18" height="14" fill="#aa2200" opacity="0.7" />
          {/* Water */}
          <circle cx="9" cy="32" r="4" fill="#2060a0" />
          {/* Portal */}
          <circle cx="34" cy="7" r="1.5" fill="#cc44ff" />
          {/* Enemies (red dots) */}
          <circle cx="5" cy="5" r="1" fill="#ff4444" />
          <circle cx="9" cy="3" r="1" fill="#ff4444" />
          <circle cx="35" cy="3" r="1" fill="#ff4444" />
          <circle cx="6" cy="40" r="1" fill="#ff8844" />
          <circle cx="37" cy="40" r="1" fill="#ff8844" />
          <circle cx="37" cy="45" r="1.5" fill="#44ff44" />
          {/* Player */}
          <rect x="23.5" y="23.5" width="3" height="3" fill="#ffd700" />
        </svg>
        <div className="absolute top-1 left-1.5 font-mono text-[7px] text-yellow-700">MAP</div>
      </div>

      {/* ── Death screen ─────────────────────────────────────────── */}
      {hud.dead && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ background: 'rgba(100,0,0,0.55)', backdropFilter: 'blur(1px)' }}
        >
          <div
            className="font-mono text-red-400 font-bold mb-3"
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 26,
              textShadow: '0 0 24px #ff0000, 0 0 48px rgba(255,0,0,0.4)',
            }}
          >
            YOU DIED
          </div>
          <div className="font-mono text-sm text-red-300 mb-1">
            Respawning in {Math.ceil(Math.max(0, hud.respTimer))}s...
          </div>
          <div className="font-mono text-[10px] text-gray-600 mt-2">
            — return to town —
          </div>
        </div>
      )}

    </div>
  )
}
