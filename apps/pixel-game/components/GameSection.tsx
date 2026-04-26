'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import type { HUDState, MobileInput } from './game/PhaserGame'

const PhaserGame = dynamic(() => import('./game/PhaserGame'), { ssr: false })
const PhaserHUD = dynamic(() => import('./game/PhaserHUD'), { ssr: false })
const AevenGame = dynamic(() => import('./game/AevenGame'), { ssr: false })
const DemonicStonesGame = dynamic(() => import('./game/DemonicStonesGame'), { ssr: false })

type GameState = 'idle' | 'name' | 'class' | 'loading' | 'playing'
type GameEngine = 'phaser' | 'aeven' | 'demonic-stones'
type WalletState = { address: string | null }

const CLASSES = [
  { id: 'warrior', label: 'WARRIOR', icon: '⚔', desc: 'Tank & melee damage', stats: { STR: 5, AGI: 2, INT: 1 }, color: '#60a0ff', border: '#3060cc' },
  { id: 'mage',    label: 'MAGE',    icon: '🔮', desc: 'AOE magic, high burst', stats: { STR: 1, AGI: 2, INT: 5 }, color: '#cc66ff', border: '#8822cc' },
  { id: 'rogue',   label: 'ROGUE',   icon: '🗡', desc: 'Fast crit strikes', stats: { STR: 3, AGI: 5, INT: 2 }, color: '#44ff88', border: '#22aa55' },
  { id: 'archer',  label: 'ARCHER',  icon: '🏹', desc: 'Long range attacks', stats: { STR: 2, AGI: 4, INT: 3 }, color: '#ffcc44', border: '#aa8800' },
  { id: 'knight',  label: 'KNIGHT',  icon: '🛡', desc: 'Heavy armor, stun', stats: { STR: 4, AGI: 2, INT: 1 }, color: '#ff8844', border: '#cc4400' },
]

// Pixel portrait SVG per class
function ClassPortrait({ cls, size = 80 }: { cls: string; size?: number }) {
  const portraits: Record<string, string> = {
    warrior: `
      <rect x="24" y="4" width="32" height="4" fill="#888"/>
      <rect x="20" y="8" width="40" height="8" fill="#aaa"/>
      <rect x="24" y="16" width="32" height="20" fill="#f5c580"/>
      <rect x="28" y="24" width="8" height="6" fill="#3355cc"/>
      <rect x="44" y="24" width="8" height="6" fill="#3355cc"/>
      <rect x="32" y="32" width="16" height="4" fill="#f5c580"/>
      <rect x="20" y="36" width="40" height="24" fill="#c0c0c0"/>
      <rect x="20" y="56" width="40" height="4" fill="#8a5520"/>
      <rect x="28" y="56" width="24" height="4" fill="#f0c030"/>
      <rect x="16" y="40" width="8" height="16" fill="#b0b0b0"/>
      <rect x="56" y="40" width="8" height="16" fill="#b0b0b0"/>
    `,
    mage: `
      <rect x="20" y="0" width="40" height="8" fill="#4a1a8a"/>
      <rect x="28" y="8" width="24" height="6" fill="#4a1a8a"/>
      <rect x="36" y="4" width="8" height="4" fill="#f0d020"/>
      <rect x="24" y="14" width="32" height="20" fill="#f5c580"/>
      <rect x="28" y="22" width="8" height="6" fill="#aa22ee"/>
      <rect x="44" y="22" width="8" height="6" fill="#aa22ee"/>
      <rect x="32" y="30" width="16" height="4" fill="#f5c580"/>
      <rect x="16" y="34" width="48" height="26" fill="#7a20dd"/>
      <rect x="24" y="36" width="32" height="16" fill="#9a40ff"/>
      <rect x="12" y="34" width="8" height="20" fill="#7a20dd"/>
      <rect x="60" y="34" width="8" height="20" fill="#7a20dd"/>
    `,
    rogue: `
      <rect x="20" y="4" width="40" height="8" fill="#1a1a2e"/>
      <rect x="24" y="12" width="32" height="20" fill="#f5c580"/>
      <rect x="28" y="20" width="8" height="6" fill="#22ee60"/>
      <rect x="44" y="20" width="8" height="6" fill="#22ee60"/>
      <rect x="32" y="28" width="16" height="4" fill="#f5c580"/>
      <rect x="20" y="32" width="40" height="6" fill="#1a1a2e"/>
      <rect x="16" y="36" width="48" height="24" fill="#1a1a2e"/>
      <rect x="16" y="16" width="8" height="24" fill="#c0c0c0"/>
      <rect x="56" y="16" width="8" height="24" fill="#c0c0c0"/>
    `,
    archer: `
      <rect x="16" y="4" width="48" height="8" fill="#1a5a20"/>
      <rect x="20" y="12" width="40" height="6" fill="#1a5a20"/>
      <rect x="24" y="16" width="32" height="18" fill="#f5c580"/>
      <rect x="28" y="22" width="8" height="6" fill="#333"/>
      <rect x="44" y="22" width="8" height="6" fill="#333"/>
      <rect x="32" y="30" width="16" height="4" fill="#f5c580"/>
      <rect x="20" y="34" width="40" height="26" fill="#1a6a20"/>
      <rect x="12" y="20" width="8" height="28" fill="#8a5520"/>
      <rect x="60" y="26" width="8" height="20" fill="#8a5520"/>
    `,
    knight: `
      <rect x="20" y="4" width="40" height="32" fill="#888"/>
      <rect x="16" y="8" width="8" height="20" fill="#777"/>
      <rect x="56" y="8" width="8" height="20" fill="#777"/>
      <rect x="28" y="20" width="24" height="8" fill="#555"/>
      <rect x="24" y="14" width="12" height="10" fill="#aaa"/>
      <rect x="44" y="14" width="12" height="10" fill="#aaa"/>
      <rect x="20" y="36" width="40" height="24" fill="#999"/>
      <rect x="16" y="38" width="8" height="18" fill="#888"/>
      <rect x="56" y="38" width="8" height="18" fill="#888"/>
      <rect x="28" y="36" width="24" height="4" fill="#f0c030"/>
    `,
  }
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" style={{ imageRendering: 'pixelated', display: 'block' }}>
      <rect width="80" height="80" fill="#0a0a18" />
      <g dangerouslySetInnerHTML={{ __html: portraits[cls] || portraits.warrior }} />
    </svg>
  )
}

function StatBar({ val, max = 5, color }: { val: number; max?: number; color: string }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {Array.from({ length: max }).map((_, i) => (
        <div key={i} style={{ width: 12, height: 6, background: i < val ? color : 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }} />
      ))}
    </div>
  )
}

function LoadingScreen({ name, cls, onDone }: { name: string; cls: string; onDone: () => void }) {
  const [progress, setProgress] = useState(0)
  const [tip] = useState(() => {
    const tips = [
      'Explore villages, complete quests and become the strongest hero!',
      'Attack enemies with SPACE or click them. Use Q/E skills for combos.',
      'Dungeon portals lead to boss chambers. Be prepared!',
      'Earn $VOX tokens by defeating monsters and completing quests.',
      'Guild raids start every midnight. Join to earn bonus rewards!',
    ]
    return tips[Math.floor(Math.random() * tips.length)]
  })

  useEffect(() => {
    let p = 0
    const interval = setInterval(() => {
      p += Math.random() * 18 + 4
      if (p >= 100) { p = 100; clearInterval(interval); setTimeout(onDone, 400) }
      setProgress(Math.min(100, p))
    }, 120)
    return () => clearInterval(interval)
  }, [onDone])

  const clsInfo = CLASSES.find(c => c.id === cls) || CLASSES[0]

  return (
    <div style={{ minHeight: 520, background: 'radial-gradient(ellipse at center, #1a0e2e 0%, #050308 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, position: 'relative', overflow: 'hidden' }}>
      {/* Background texture */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 20% 80%, rgba(60,20,100,0.3) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(20,60,100,0.2) 0%, transparent 50%)' }} />

      {/* Logo */}
      <div style={{ position: 'relative', textAlign: 'center', marginBottom: 28 }}>
        <div style={{ fontSize: 10, fontFamily: '"Press Start 2P",monospace', color: '#cc88ff', marginBottom: 6, letterSpacing: 4 }}>⚔ &nbsp; PIXELREALMS &nbsp; ⚔</div>
        <div style={{ fontSize: 36, fontFamily: '"Press Start 2P",monospace', background: 'linear-gradient(180deg, #FFE066 0%, #CC8800 50%, #FF6600 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 12px rgba(255,160,0,0.6))', lineHeight: 1 }}>PIXEL</div>
        <div style={{ fontSize: 36, fontFamily: '"Press Start 2P",monospace', background: 'linear-gradient(180deg, #88aaff 0%, #4466dd 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: 1 }}>REALMS</div>
        <div style={{ fontSize: 9, fontFamily: '"Press Start 2P",monospace', color: '#8866cc', marginTop: 4, letterSpacing: 2 }}>MEDIEVAL FANTASY RPG</div>
      </div>

      {/* Character preview */}
      <div style={{ position: 'relative', textAlign: 'center', marginBottom: 24 }}>
        <div style={{ width: 80, height: 80, margin: '0 auto', filter: 'drop-shadow(0 0 12px rgba(255,160,0,0.5))' }}>
          <ClassPortrait cls={cls} size={80} />
        </div>
        {/* Walking animation dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 6 }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{ width: 4, height: 4, borderRadius: 2, background: '#5a9e3a', opacity: (progress / 25 + i) % 4 < 1 ? 1 : 0.3, transition: 'opacity 0.1s' }} />
          ))}
        </div>
      </div>

      {/* Loading text */}
      <div style={{ fontFamily: '"Press Start 2P",monospace', fontSize: 11, color: '#FFD700', marginBottom: 14 }}>
        Loading Adventure...
      </div>

      {/* Progress bar */}
      <div style={{ width: 320, position: 'relative', marginBottom: 8 }}>
        <div style={{ width: '100%', height: 22, background: '#1a1030', border: '2px solid #8844aa', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg, #c87000, #FFD700, #f0a020)', transition: 'width 0.1s', borderRadius: 2 }} />
          <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(90deg, transparent 0, transparent 18px, rgba(0,0,0,0.15) 18px, rgba(0,0,0,0.15) 20px)' }} />
        </div>
        <div style={{ position: 'absolute', right: -34, top: 0, fontSize: 18 }}>🎁</div>
      </div>
      <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#cc9933', marginBottom: 24 }}>
        {Math.round(progress)}%
      </div>

      {/* Spawning text */}
      <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#888', marginBottom: 28 }}>
        Spawning <span style={{ color: clsInfo.color }}>{name || 'HERO'}</span> the <span style={{ color: clsInfo.color }}>{clsInfo.label}</span>...
      </div>

      {/* Tip box */}
      <div style={{ width: 340, background: 'rgba(20,12,8,0.8)', border: '1px solid #4a3010', padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ fontSize: 18, flexShrink: 0 }}>💡</div>
        <div>
          <div style={{ fontFamily: '"Press Start 2P",monospace', fontSize: 8, color: '#FFD700', marginBottom: 6 }}>TIP</div>
          <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#ccbbaa', lineHeight: 1.5 }}>{tip}</div>
        </div>
        <div style={{ flexShrink: 0, fontSize: 28 }}>🏡</div>
      </div>
    </div>
  )
}

export default function GameSection() {
  const [gameState, setGameState] = useState<GameState>('idle')
  const [gameEngine, setGameEngine] = useState<GameEngine>('aeven')
  const [playerName, setPlayerName] = useState('')
  const [selectedClass, setSelectedClass] = useState('warrior')
  const [hudState, setHudState] = useState<HUDState | null>(null)
  const [wallet, setWallet] = useState<WalletState>({ address: null })
  const [isMobile, setIsMobile] = useState(false)
  const mobileInputRef = useRef<MobileInput>({ dx: 0, dy: 0, attack: false, skills: [false, false, false, false] })

  useEffect(() => {
    setIsMobile('ontouchstart' in window || window.innerWidth <= 900)
  }, [])

  const handleHUDUpdate = useCallback((state: HUDState) => {
    setHudState(state)
  }, [])

  const handleConnectWallet = useCallback(async () => {
    if (typeof window === 'undefined') return
    const eth = (window as Window & { ethereum?: { request: (args: { method: string }) => Promise<string[]> } }).ethereum
    if (!eth) { alert('MetaMask not found. Please install MetaMask.'); return }
    try {
      const accounts = await eth.request({ method: 'eth_requestAccounts' })
      if (accounts[0]) setWallet({ address: accounts[0] })
    } catch {
      // user rejected
    }
  }, [])

  const handleMintNFT = useCallback(() => {
    if (!wallet.address) return
    alert('Minting Character NFT... (demo)')
  }, [wallet.address])

  return (
    <section id="game" className="relative py-24 px-4">
      <div className="absolute inset-0 bg-gradient-to-b from-[#0F0A1E] to-[#1a0a2e]" />
      <div className="absolute inset-0 bg-pixel-grid opacity-20" />

      <div className="relative z-10 max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <div className="inline-block px-3 py-1 border border-red-700 text-red-400 text-xs mb-4" style={{ fontSize: '10px' }}>
            START YOUR ADVENTURE
          </div>
          <h2 className="font-pixel text-xl md:text-2xl text-white mb-4">
            PLAY <span className="text-yellow-400">NOW</span>
          </h2>
          <div className="w-24 h-1 bg-gradient-to-r from-transparent via-red-400 to-transparent mx-auto" />
        </div>

        {/* IDLE */}
        {gameState === 'idle' && (
          <div className="pixel-card p-8 border-2 border-yellow-700 max-w-2xl mx-auto" style={{ boxShadow: '0 0 40px rgba(245,158,11,0.3)' }}>
            <PixelPreview />
            <p className="text-gray-400 text-xs leading-relaxed mb-6 mt-6 text-center" style={{ fontFamily: 'monospace', fontSize: '12px' }}>
              A real pixel MMORPG — explore the world, battle monsters, earn $VOX tokens. No download needed.
            </p>

            {/* Engine selector */}
            <div className="mb-6">
              <div className="font-pixel text-center text-gray-600 mb-3" style={{ fontSize: '8px' }}>SELECT ENGINE</div>
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => setGameEngine('aeven')}
                  className="p-3 flex flex-col items-center gap-1 transition-all"
                  style={{
                    background: gameEngine === 'aeven' ? 'rgba(20,10,40,0.95)' : 'rgba(10,8,20,0.6)',
                    border: `2px solid ${gameEngine === 'aeven' ? '#8844cc' : 'rgba(80,60,120,0.4)'}`,
                    boxShadow: gameEngine === 'aeven' ? '0 0 16px rgba(140,60,220,0.35)' : 'none',
                  }}
                >
                  <span style={{ fontSize: 22 }}>🏰</span>
                  <span className="font-pixel text-purple-300" style={{ fontSize: '7px' }}>AEVEN MMO</span>
                  <span className="text-gray-600" style={{ fontFamily: 'monospace', fontSize: '9px' }}>Isometric · Multiplayer</span>
                </button>
                <button
                  onClick={() => setGameEngine('phaser')}
                  className="p-3 flex flex-col items-center gap-1 transition-all"
                  style={{
                    background: gameEngine === 'phaser' ? 'rgba(10,20,10,0.95)' : 'rgba(10,8,20,0.6)',
                    border: `2px solid ${gameEngine === 'phaser' ? '#448844' : 'rgba(80,60,120,0.4)'}`,
                    boxShadow: gameEngine === 'phaser' ? '0 0 16px rgba(60,160,60,0.3)' : 'none',
                  }}
                >
                  <span style={{ fontSize: 22 }}>⚔️</span>
                  <span className="font-pixel text-green-400" style={{ fontSize: '7px' }}>PIXEL RPG</span>
                  <span className="text-gray-600" style={{ fontFamily: 'monospace', fontSize: '9px' }}>Top-down · Phaser 3</span>
                </button>
                <button
                  onClick={() => setGameEngine('demonic-stones')}
                  className="p-3 flex flex-col items-center gap-1 transition-all"
                  style={{
                    background: gameEngine === 'demonic-stones' ? 'rgba(30,5,5,0.95)' : 'rgba(10,8,20,0.6)',
                    border: `2px solid ${gameEngine === 'demonic-stones' ? '#882222' : 'rgba(80,60,120,0.4)'}`,
                    boxShadow: gameEngine === 'demonic-stones' ? '0 0 16px rgba(180,40,40,0.35)' : 'none',
                  }}
                >
                  <span style={{ fontSize: 22 }}>🪨</span>
                  <span className="font-pixel text-red-400" style={{ fontSize: '7px' }}>DEMONIC STONES</span>
                  <span className="text-gray-600" style={{ fontFamily: 'monospace', fontSize: '9px' }}>Godot 4 · Action RPG</span>
                </button>
              </div>
            </div>

            <button
              onClick={() => (gameEngine === 'aeven' || gameEngine === 'demonic-stones') ? setGameState('playing') : setGameState('name')}
              className="pixel-btn pixel-btn-primary font-pixel px-8 py-4 text-sm w-full"
            >
              ▶ ENTER THE REALM
            </button>
          </div>
        )}

        {/* NAME INPUT */}
        {gameState === 'name' && (
          <div className="pixel-card p-8 border-2 border-purple-700 max-w-xl mx-auto">
            <h3 className="font-pixel text-purple-400 text-center mb-6" style={{ fontSize: '10px' }}>ENTER HERO NAME</h3>
            <input
              type="text"
              value={playerName}
              onChange={e => setPlayerName(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12))}
              placeholder="HERO NAME..."
              maxLength={12}
              className="w-full bg-black border-2 border-purple-700 text-white font-pixel text-center py-4 px-4 focus:outline-none focus:border-yellow-500 text-xs mb-4"
              style={{ caretColor: '#F59E0B' }}
              onKeyDown={e => e.key === 'Enter' && playerName.length >= 3 && setGameState('class')}
              autoFocus
            />
            <div className="text-gray-600 text-xs text-center mb-6" style={{ fontFamily: 'monospace', fontSize: '10px' }}>
              {playerName.length}/12 — min 3 characters
            </div>
            <div className="flex gap-3">
              <button onClick={() => setGameState('idle')} className="pixel-btn pixel-btn-secondary font-pixel px-6 py-3 text-xs flex-1">◀ BACK</button>
              <button onClick={() => setGameState('class')} disabled={playerName.length < 3} className="pixel-btn pixel-btn-primary font-pixel px-6 py-3 text-xs flex-1 disabled:opacity-40">NEXT ▶</button>
            </div>
          </div>
        )}

        {/* CLASS SELECT — Vox Arena style */}
        {gameState === 'class' && (
          <div className="pixel-card p-6 border-2 border-purple-700 max-w-4xl mx-auto">
            <h3 className="font-pixel text-purple-400 text-center mb-6" style={{ fontSize: '10px' }}>CHOOSE YOUR CLASS</h3>

            {/* Portrait cards row */}
            <div className="flex gap-3 justify-center mb-6 flex-wrap">
              {CLASSES.map(cls => (
                <button
                  key={cls.id}
                  onClick={() => setSelectedClass(cls.id)}
                  style={{
                    width: 120, padding: '12px 8px', background: 'rgba(10,8,20,0.9)',
                    border: `2px solid ${selectedClass === cls.id ? cls.border : 'rgba(80,60,120,0.5)'}`,
                    boxShadow: selectedClass === cls.id ? `0 0 18px ${cls.color}55, inset 0 0 12px ${cls.color}22` : 'none',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                    transition: 'all 0.15s', cursor: 'pointer',
                  }}
                >
                  <div style={{ border: `2px solid ${selectedClass === cls.id ? cls.border : '#333'}`, padding: 2 }}>
                    <ClassPortrait cls={cls.id} size={76} />
                  </div>
                  <div style={{ fontFamily: '"Press Start 2P",monospace', fontSize: 7, color: selectedClass === cls.id ? cls.color : '#aaaacc' }}>
                    {cls.label}
                  </div>
                </button>
              ))}
            </div>

            {/* Selected class details */}
            {(() => {
              const cls = CLASSES.find(c => c.id === selectedClass)!
              return (
                <div style={{ background: 'rgba(10,8,20,0.85)', border: `1px solid ${cls.border}`, padding: '16px 20px', marginBottom: 20, display: 'flex', gap: 20, alignItems: 'center' }}>
                  {/* Portrait vs Enemy */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
                    <div style={{ textAlign: 'center' }}>
                      <ClassPortrait cls={cls.id} size={64} />
                      <div style={{ fontFamily: 'monospace', fontSize: 10, color: cls.color, marginTop: 4 }}>{cls.label}</div>
                    </div>
                    <div style={{ fontFamily: '"Press Start 2P",monospace', fontSize: 9, color: '#ff4444' }}>VS</div>
                    <div style={{ textAlign: 'center' }}>
                      <svg width={64} height={64} viewBox="0 0 64 64" style={{ imageRendering: 'pixelated', display: 'block' }}>
                        <rect width="64" height="64" fill="#0a0a18" />
                        <rect x="20" y="8" width="24" height="16" fill="#e8e8d0" />
                        <rect x="24" y="14" width="6" height="5" fill="#cc2222" />
                        <rect x="34" y="14" width="6" height="5" fill="#cc2222" />
                        <rect x="18" y="24" width="28" height="18" fill="#d8d8c0" />
                        <rect x="14" y="26" width="8" height="8" fill="#d8d8c0" />
                        <rect x="42" y="26" width="8" height="8" fill="#d8d8c0" />
                        <rect x="46" y="18" width="4" height="24" fill="#b0b0b0" />
                        <rect x="24" y="42" width="8" height="14" fill="#d8d8c0" />
                        <rect x="32" y="42" width="8" height="14" fill="#d8d8c0" />
                      </svg>
                      <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#ddddaa', marginTop: 4 }}>Skeleton</div>
                    </div>
                  </div>

                  {/* Stats */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: '"Press Start 2P",monospace', fontSize: 8, color: cls.color, marginBottom: 10 }}>{cls.label}</div>
                    <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#aaa', marginBottom: 10 }}>{cls.desc}</div>
                    {Object.entries(cls.stats).map(([stat, val]) => (
                      <div key={stat} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 9, color: '#888', width: 32 }}>{stat}</span>
                        <StatBar val={val} color={cls.color} />
                      </div>
                    ))}
                  </div>

                  {/* Live badge */}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontFamily: '"Press Start 2P",monospace', fontSize: 8, color: '#44ff88' }}>● LIVE</div>
                    <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#666', marginTop: 4 }}>Medieval Fantasy RPG</div>
                  </div>
                </div>
              )
            })()}

            <div className="flex gap-3">
              <button onClick={() => setGameState('name')} className="pixel-btn pixel-btn-secondary font-pixel px-6 py-3 text-xs flex-1">◀ BACK</button>
              <button onClick={() => setGameState('loading')} className="pixel-btn pixel-btn-primary font-pixel px-6 py-3 text-xs flex-1">ENTER WORLD ▶</button>
            </div>
          </div>
        )}

        {/* LOADING */}
        {gameState === 'loading' && (
          <div className="pixel-card border-2 border-yellow-700 max-w-2xl mx-auto overflow-hidden">
            <LoadingScreen name={playerName || 'HERO'} cls={selectedClass} onDone={() => setGameState('playing')} />
          </div>
        )}

        {/* PLAYING */}
        {gameState === 'playing' && (
          <div
            className="pixel-card border-2 border-yellow-600 overflow-hidden relative"
            style={{ boxShadow: '0 0 50px rgba(245,158,11,0.4)' }}
          >
            {gameEngine === 'aeven' ? (
              /* Aeven isometric MMO */
              <AevenGame onExit={() => setGameState('idle')} />
            ) : gameEngine === 'demonic-stones' ? (
              /* Demonic Stones Godot 4 action RPG */
              <DemonicStonesGame onExit={() => setGameState('idle')} />
            ) : (
              <>
            {/* Phaser 3 game canvas */}
            <PhaserGame
              playerName={playerName || 'HERO'}
              playerClass={selectedClass}
              onHUDUpdate={handleHUDUpdate}
              mobileInputRef={isMobile ? mobileInputRef : undefined}
            />
            {/* React HUD overlay */}
            <PhaserHUD
              hud={hudState}
              walletAddress={wallet.address}
              onConnectWallet={handleConnectWallet}
              onMintNFT={handleMintNFT}
              onExit={() => setGameState('idle')}
              mobileInputRef={isMobile ? mobileInputRef : undefined}
            />
              </>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

function LaunchTimer({ onDone }: { onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 1800); return () => clearTimeout(t) }, [onDone])
  return null
}

function PixelPreview() {
  return (
    <svg viewBox="0 0 240 130" className="w-full max-w-sm mx-auto block" style={{ imageRendering: 'pixelated' }}>
      <rect width="240" height="130" fill="#0a1008" />
      {/* Sky/fog */}
      <rect width="240" height="60" fill="#0a0818" />
      {/* Stars */}
      {[15,40,70,100,130,160,195,220].map((x,i)=><rect key={x} x={x} y={[8,4,12,6,10,3,9,5][i]} width="2" height="2" fill="white" opacity="0.7"/>)}
      {/* Ground — bright grass */}
      <rect x="0" y="60" width="240" height="70" fill="#5a9e3a"/>
      {/* Sandy village path */}
      <rect x="60" y="60" width="120" height="70" fill="#c8944a"/>
      {/* Stone road */}
      <rect x="112" y="60" width="16" height="70" fill="#a09060"/>
      {/* Trees */}
      <rect x="0" y="40" width="20" height="90" fill="#2a5a14"/>
      <rect x="2" y="48" width="16" height="42" fill="#3a7a18"/>
      <rect x="5" y="42" width="10" height="12" fill="#4a9a28"/>
      <rect x="220" y="45" width="20" height="85" fill="#2a5a14"/>
      <rect x="222" y="53" width="16" height="38" fill="#3a7a18"/>
      {/* Buildings */}
      <rect x="20" y="62" width="40" height="38" fill="#8B5A2B"/>
      <rect x="18" y="56" width="44" height="10" fill="#8B1A1A"/>
      <rect x="28" y="70" width="12" height="10" fill="rgba(255,180,60,0.8)"/>
      <rect x="44" y="70" width="12" height="10" fill="rgba(255,180,60,0.8)"/>
      {/* Player */}
      <rect x="115" y="80" width="10" height="16" fill="#c0c0c0"/>
      <rect x="116" y="74" width="8" height="8" fill="#f5c580"/>
      <rect x="116" y="73" width="8" height="4" fill="#888"/>
      {/* Slime enemy */}
      <rect x="160" y="85" width="14" height="10" fill="#20cc40"/>
      <rect x="163" y="86" width="4" height="4" fill="#fff"/>
      <rect x="169" y="86" width="4" height="4" fill="#fff"/>
      <rect x="164" y="87" width="2" height="2" fill="#000"/>
      <rect x="170" y="87" width="2" height="2" fill="#000"/>
      {/* HP bar */}
      <rect x="160" y="81" width="14" height="3" fill="#300"/>
      <rect x="160" y="81" width="9" height="3" fill="#0f0"/>
      {/* Portal */}
      <rect x="108" y="52" width="24" height="20" fill="rgba(150,50,255,0.5)"/>
      <rect x="112" y="50" width="16" height="4" fill="#aa44ff"/>
      <rect x="116" y="56" width="8" height="8" fill="rgba(255,255,255,0.7)"/>
      {/* Damage */}
      <text x="148" y="78" fill="#ff4444" fontSize="6" fontFamily="monospace" fontWeight="bold">-24</text>
      {/* $VOX reward */}
      <text x="80" y="70" fill="#cc88ff" fontSize="5" fontFamily="monospace">+0.5 $VOX</text>
      {/* Chat bubble */}
      <rect x="130" y="55" width="65" height="14" fill="#1a1020"/>
      <text x="133" y="65" fill="#60ff80" fontSize="5" fontFamily="monospace">Eeyo: LFG raid!</text>
    </svg>
  )
}
