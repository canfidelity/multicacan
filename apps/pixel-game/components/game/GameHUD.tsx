'use client'

import { useRef, useEffect } from 'react'

// ── Exported types (used by MMORPGGame) ───────────────────────────────────────
export interface SkillHud {
  key: string
  name: string
  cd: number
  cdMax: number
}

export interface ItemHud {
  id: number
  name: string
  type: 'weapon' | 'armor' | 'potion' | 'gem'
  rarity: 'common' | 'rare' | 'epic'
  color: string
}

export interface EnemyHud {
  x: number
  y: number
  state: string
  kind: string
}

export interface DmgHud {
  id: number
  v: number
  c: string
  t: number
  screen?: { x: number; y: number }
}

export interface HudState {
  hp: number; maxHp: number
  mp: number; maxMp: number
  xp: number; xpNext: number
  level: number
  gold: number
  cls: string
  name: string
  skills: SkillHud[]
  inventory: (ItemHud | null)[]
  inventoryOpen: boolean
  playerX: number; playerY: number
  mapW: number; mapH: number
  enemies: EnemyHud[]
  chat: { name: string; text: string; c: string; age: number }[]
  dead: boolean
  respTimer: number
  dmg: DmgHud[]
  npcMsg: string | null
}

interface Props {
  hud: HudState
  canvasW: number
  canvasH: number
}

// ── Minimap ───────────────────────────────────────────────────────────────────
function Minimap({ hud }: { hud: HudState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const SIZE = 120

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const sw = SIZE / hud.mapW
    const sh = SIZE / hud.mapH

    ctx.fillStyle = '#0a0a1e'
    ctx.fillRect(0, 0, SIZE, SIZE)

    // Draw map tiles
    const TILE_COLORS: Record<number, string> = {
      0: '#2a5a1a', 1: '#0a2050', 2: '#907060',
      3: '#1a4a0a', 4: '#4a3a2a', 5: '#c4a340',
      6: '#2a5a1a', 7: '#5a5050', 8: '#1a1a2a',
    }
    for (let ty = 0; ty < hud.mapH; ty++) {
      for (let tx = 0; tx < hud.mapW; tx++) {
        // We can't read the map array here, so we use simplified colors
        const px = tx * sw, py = ty * sh
        // Draw based on region (approximation for minimap)
        if (ty < 2) ctx.fillStyle = '#1a4a0a'
        else if (ty >= 2 && ty < 12 && tx >= 8 && tx < 32) ctx.fillStyle = '#5a5050'
        else if (ty >= 22 && ty < 28 && tx >= 12 && tx < 28) ctx.fillStyle = '#1a1a2a'
        else if (ty >= 19 && ty <= 20) ctx.fillStyle = '#0a2050'
        else if (ty >= 28) ctx.fillStyle = '#c4a340'
        else ctx.fillStyle = '#2a5a1a'
        ctx.fillRect(Math.floor(px), Math.floor(py), Math.max(1, Math.floor(sw)), Math.max(1, Math.floor(sh)))
      }
    }

    // Enemies (red dots)
    ctx.fillStyle = '#ff2222'
    for (const en of hud.enemies) {
      if (en.state === 'dead') continue
      ctx.fillRect(
        Math.floor(en.x * sw) - 1,
        Math.floor(en.y * sh) - 1,
        2, 2
      )
    }

    // Player (bright green dot)
    ctx.fillStyle = '#00ff88'
    const px = Math.floor(hud.playerX * sw)
    const py = Math.floor(hud.playerY * sh)
    ctx.fillRect(px - 2, py - 2, 5, 5)

    // Player outline
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1
    ctx.strokeRect(px - 2, py - 2, 5, 5)
  })

  return (
    <div
      style={{
        position: 'absolute', top: 8, right: 8,
        border: '2px solid #7c3aed',
        background: 'rgba(0,0,0,0.85)',
      }}
    >
      <div style={{ color: '#9333ea', fontFamily: '"Press Start 2P",monospace', fontSize: 6, padding: '2px 4px', textAlign: 'center', borderBottom: '1px solid #7c3aed' }}>
        MAP
      </div>
      <canvas ref={canvasRef} width={SIZE} height={SIZE} style={{ display: 'block', imageRendering: 'pixelated' }} />
    </div>
  )
}

// ── Skill hotbar ──────────────────────────────────────────────────────────────
function SkillBar({ skills }: { skills: SkillHud[] }) {
  return (
    <div
      style={{
        position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 6,
        background: 'rgba(0,0,0,0.82)', border: '1px solid #7c3aed', padding: '5px 8px',
      }}
    >
      {skills.map((sk) => {
        const pct = sk.cdMax > 0 ? (sk.cd / sk.cdMax) : 0
        return (
          <div key={sk.key} style={{ position: 'relative', width: 46, height: 46 }}>
            {/* Slot background */}
            <div style={{
              width: 46, height: 46,
              background: '#1a1a2a',
              border: `2px solid ${pct > 0 ? '#444' : '#9333ea'}`,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            }}>
              {/* Key label */}
              <div style={{ color: pct > 0 ? '#666' : '#f0d020', fontFamily: '"Press Start 2P",monospace', fontSize: 9, fontWeight: 'bold' }}>
                {sk.key}
              </div>
              {/* Skill name */}
              <div style={{ color: pct > 0 ? '#555' : '#aaa', fontFamily: 'monospace', fontSize: 7, textAlign: 'center', marginTop: 2, lineHeight: 1.1, maxWidth: 40, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {sk.name}
              </div>
            </div>
            {/* Cooldown overlay */}
            {pct > 0 && (
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                height: `${pct * 100}%`,
                background: 'rgba(0,0,0,0.65)',
                pointerEvents: 'none',
              }} />
            )}
            {pct > 0 && (
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#ff8844', fontFamily: '"Press Start 2P",monospace', fontSize: 7,
                pointerEvents: 'none',
              }}>
                {Math.ceil(sk.cd)}s
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Inventory panel ───────────────────────────────────────────────────────────
function InventoryPanel({ inventory }: { inventory: (ItemHud | null)[] }) {
  const rarityColors: Record<string, string> = {
    common: '#aaaaaa', rare: '#60d0ff', epic: '#aa22ff',
  }
  const typeIcons: Record<string, string> = {
    weapon: '⚔', armor: '🛡', potion: '🧪', gem: '💎',
  }
  return (
    <div
      style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        background: 'rgba(0,0,0,0.92)', border: '2px solid #7c3aed',
        padding: 12, minWidth: 280,
      }}
    >
      <div style={{ color: '#f0d020', fontFamily: '"Press Start 2P",monospace', fontSize: 9, marginBottom: 10, textAlign: 'center' }}>
        INVENTORY — [I] to close
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
        {inventory.map((item, i) => (
          <div
            key={i}
            title={item ? `${item.name} (${item.rarity})` : 'Empty'}
            style={{
              width: 44, height: 44,
              background: '#0a0a1e',
              border: `2px solid ${item ? rarityColors[item.rarity] : '#333'}`,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              cursor: item ? 'pointer' : 'default',
            }}
          >
            {item && (
              <>
                <div style={{ fontSize: 18, lineHeight: 1 }}>{typeIcons[item.type] ?? '?'}</div>
                <div style={{ color: item.color, fontFamily: 'monospace', fontSize: 6, textAlign: 'center', marginTop: 2, overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: 40, textOverflow: 'ellipsis' }}>
                  {item.name.split(' ')[0]}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Stats panel ───────────────────────────────────────────────────────────────
function StatsPanel({ hud }: { hud: HudState }) {
  const hpPct = (hud.hp / hud.maxHp) * 100
  const mpPct = (hud.mp / hud.maxMp) * 100
  const xpPct = (hud.xp / hud.xpNext) * 100
  const hpCol = hud.hp / hud.maxHp > 0.5 ? '#22cc44' : hud.hp / hud.maxHp > 0.25 ? '#ddaa00' : '#cc2222'
  const clsColors: Record<string, string> = {
    warrior: '#60a0ff', mage: '#cc66ff', rogue: '#44ff88', archer: '#ffcc44', paladin: '#f0d020',
  }
  const clsCol = clsColors[hud.cls] ?? '#ffffff'

  return (
    <div
      style={{
        position: 'absolute', top: 8, left: 8,
        background: 'rgba(0,0,0,0.82)', border: '1px solid #7c3aed',
        padding: '8px 10px', minWidth: 200,
      }}
    >
      {/* Name & level */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ color: '#f0d020', fontFamily: '"Press Start 2P",monospace', fontSize: 7 }}>
          LV.{hud.level}
        </span>
        <span style={{ color: '#ffffff', fontFamily: '"Press Start 2P",monospace', fontSize: 7 }}>
          {hud.name}
        </span>
        <span style={{ color: clsCol, fontFamily: '"Press Start 2P",monospace', fontSize: 6 }}>
          [{hud.cls.toUpperCase()}]
        </span>
      </div>

      {/* HP bar */}
      <div style={{ marginBottom: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
          <span style={{ color: '#ff4444', fontFamily: 'monospace', fontSize: 8 }}>HP</span>
          <span style={{ color: '#ccc', fontFamily: 'monospace', fontSize: 8 }}>{hud.hp}/{hud.maxHp}</span>
        </div>
        <div style={{ background: '#300', width: 180, height: 10, border: '1px solid #444', position: 'relative' }}>
          <div style={{ background: hpCol, width: `${hpPct}%`, height: '100%', transition: 'width 0.12s' }} />
        </div>
      </div>

      {/* MP bar */}
      <div style={{ marginBottom: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
          <span style={{ color: '#4488ff', fontFamily: 'monospace', fontSize: 8 }}>MP</span>
          <span style={{ color: '#ccc', fontFamily: 'monospace', fontSize: 8 }}>{hud.mp}/{hud.maxMp}</span>
        </div>
        <div style={{ background: '#003', width: 180, height: 10, border: '1px solid #444' }}>
          <div style={{ background: '#2266ee', width: `${mpPct}%`, height: '100%', transition: 'width 0.12s' }} />
        </div>
      </div>

      {/* XP bar */}
      <div style={{ marginBottom: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
          <span style={{ color: '#aaaa00', fontFamily: 'monospace', fontSize: 8 }}>XP</span>
          <span style={{ color: '#ccc', fontFamily: 'monospace', fontSize: 8 }}>{hud.xp}/{hud.xpNext}</span>
        </div>
        <div style={{ background: '#220', width: 180, height: 8, border: '1px solid #444' }}>
          <div style={{ background: '#aaaa00', width: `${xpPct}%`, height: '100%', transition: 'width 0.12s' }} />
        </div>
      </div>

      {/* Gold */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <span style={{ color: '#f0d020', fontFamily: '"Press Start 2P",monospace', fontSize: 7 }}>
          💰 {hud.gold}G
        </span>
      </div>
    </div>
  )
}

// ── Chat box ──────────────────────────────────────────────────────────────────
function ChatBox({ chat }: { chat: HudState['chat'] }) {
  return (
    <div
      style={{
        position: 'absolute', bottom: 64, left: 8,
        background: 'rgba(0,0,0,0.72)', border: '1px solid #7c3aed',
        padding: '5px 8px', width: 300, maxHeight: 100, overflow: 'hidden',
      }}
    >
      {chat.slice(-6).map((m, i) => (
        <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 2, opacity: Math.min(1, (9 - m.age) / 3) }}>
          <span style={{ color: m.c, fontFamily: 'monospace', fontSize: 9, flexShrink: 0 }}>
            [{m.name}]
          </span>
          <span style={{ color: '#ddd', fontFamily: 'monospace', fontSize: 9 }}>
            {m.text.slice(0, 32)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Main HUD ──────────────────────────────────────────────────────────────────
export default function GameHUD({ hud, canvasW, canvasH }: Props) {
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ width: canvasW, height: canvasH, position: 'absolute', top: 0, left: 0 }}
    >
      {/* Stats panel — top left */}
      <StatsPanel hud={hud} />

      {/* Minimap — top right */}
      <Minimap hud={hud} />

      {/* Skill hotbar — bottom center */}
      <SkillBar skills={hud.skills} />

      {/* Chat — bottom left (above hotbar) */}
      <ChatBox chat={hud.chat} />

      {/* NPC dialog bubble */}
      {hud.npcMsg && (
        <div
          style={{
            position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.92)', border: '1px solid #f0d020',
            padding: '6px 14px', maxWidth: 320, textAlign: 'center',
          }}
        >
          <div style={{ color: '#f0d020', fontFamily: 'monospace', fontSize: 10 }}>💬 {hud.npcMsg}</div>
        </div>
      )}

      {/* Floating damage numbers */}
      {hud.dmg.map(d =>
        d.screen && (
          <div
            key={d.id}
            style={{
              position: 'absolute',
              left: d.screen.x,
              top: d.screen.y,
              color: d.c,
              fontFamily: '"Press Start 2P",monospace',
              fontSize: d.v > 60 ? 13 : d.v === 0 ? 10 : 10,
              fontWeight: 'bold',
              opacity: Math.min(1, d.t * 1.5),
              transform: 'translateX(-50%)',
              textShadow: '1px 1px 2px #000',
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {d.v === 0 ? (d.c === '#44ff88' ? '✨ITEM' : '💀DEAD') : d.c === '#44ff88' ? `+${d.v}HP` : d.c === '#f0d020' ? `+${d.v}XP` : `-${d.v}`}
          </div>
        )
      )}

      {/* Inventory panel (toggle with I) */}
      {hud.inventoryOpen && (
        <div className="pointer-events-auto">
          <InventoryPanel inventory={hud.inventory} />
        </div>
      )}

      {/* Death overlay */}
      {hud.dead && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ background: 'rgba(160,0,0,0.48)' }}
        >
          <div style={{ color: '#ff4444', fontFamily: '"Press Start 2P",monospace', fontSize: 26, marginBottom: 14, textShadow: '2px 2px 6px #000' }}>
            YOU DIED
          </div>
          <div style={{ color: '#ffaaaa', fontFamily: '"Press Start 2P",monospace', fontSize: 10 }}>
            Respawning in {Math.ceil(Math.max(0, hud.respTimer))}s...
          </div>
        </div>
      )}

      {/* Controls hint — bottom right */}
      <div
        style={{
          position: 'absolute', bottom: 8, right: 8,
          background: 'rgba(0,0,0,0.6)', padding: '4px 8px', border: '1px solid #333',
        }}
      >
        <span style={{ color: '#666', fontFamily: 'monospace', fontSize: 8 }}>
          WASD:Move · SPACE:Attack · Q/W/E/R:Skills · I:Inventory
        </span>
      </div>
    </div>
  )
}
