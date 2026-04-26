'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'

const GameCanvas = dynamic(() => import('./game/ThreeGame'), { ssr: false })

type GameState = 'idle' | 'name' | 'class' | 'launch' | 'playing'

export default function GameSection() {
  const [gameState, setGameState] = useState<GameState>('idle')
  const [playerName, setPlayerName] = useState('')
  const [selectedClass, setSelectedClass] = useState('warrior')

  return (
    <section id="game" className="relative py-24 px-4">
      <div className="absolute inset-0 bg-gradient-to-b from-[#0F0A1E] to-[#1a0a2e]" />
      <div className="absolute inset-0 bg-pixel-grid opacity-30" />

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
            <p className="text-gray-400 text-xs leading-relaxed mb-8 mt-6 text-center" style={{ fontFamily: 'monospace', fontSize: '12px' }}>
              A real pixel MMORPG — explore the world, battle monsters, earn $PIXEL tokens. No download needed.
            </p>
            <div className="grid grid-cols-3 gap-4 mb-8 text-center">
              {[['WASD', 'Move'], ['SPACE', 'Attack'], ['Click', 'Target Enemy']].map(([k, v]) => (
                <div key={k} className="border border-gray-700 p-3">
                  <div className="text-yellow-400 font-pixel text-xs mb-1" style={{ fontSize: '9px' }}>{k}</div>
                  <div className="text-gray-500 text-xs" style={{ fontFamily: 'monospace', fontSize: '11px' }}>{v}</div>
                </div>
              ))}
            </div>
            <button onClick={() => setGameState('name')} className="pixel-btn pixel-btn-primary font-pixel px-8 py-4 text-sm w-full">
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

        {/* CLASS SELECT */}
        {gameState === 'class' && (
          <div className="pixel-card p-8 border-2 border-purple-700 max-w-2xl mx-auto">
            <h3 className="font-pixel text-purple-400 text-center mb-6" style={{ fontSize: '10px' }}>CHOOSE YOUR CLASS — {playerName}</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {[
                { id: 'warrior', icon: '⚔', label: 'WARRIOR', desc: 'Tank & melee damage', stats: 'STR●●●●● AGI●●○○○' },
                { id: 'mage',    icon: '🔮', label: 'MAGE',    desc: 'AOE magic, high damage', stats: 'INT●●●●● STR●○○○○' },
                { id: 'rogue',   icon: '🗡', label: 'ROGUE',   desc: 'Fast crit strikes', stats: 'AGI●●●●● STR●●●○○' },
                { id: 'archer',  icon: '🏹', label: 'ARCHER',  desc: 'Long range attacks', stats: 'AGI●●●●○ INT●●●○○' },
              ].map(cls => (
                <button
                  key={cls.id}
                  onClick={() => setSelectedClass(cls.id)}
                  className={`p-4 border-2 font-pixel text-left transition-all ${selectedClass === cls.id ? 'border-yellow-500 bg-yellow-500/10' : 'border-gray-700 hover:border-gray-500'}`}
                >
                  <div className="text-3xl mb-2">{cls.icon}</div>
                  <div className={`text-xs mb-1 ${selectedClass === cls.id ? 'text-yellow-400' : 'text-gray-300'}`} style={{ fontSize: '8px' }}>{cls.label}</div>
                  <div className="text-gray-500 text-xs mb-2" style={{ fontFamily: 'monospace', fontSize: '10px' }}>{cls.desc}</div>
                  <div className="text-gray-600" style={{ fontFamily: 'monospace', fontSize: '9px' }}>{cls.stats}</div>
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setGameState('name')} className="pixel-btn pixel-btn-secondary font-pixel px-6 py-3 text-xs flex-1">◀ BACK</button>
              <button onClick={() => { setGameState('launch') }} className="pixel-btn pixel-btn-primary font-pixel px-6 py-3 text-xs flex-1">ENTER WORLD ▶</button>
            </div>
          </div>
        )}

        {/* LAUNCHING */}
        {gameState === 'launch' && (
          <div className="pixel-card p-12 border-2 border-yellow-600 max-w-xl mx-auto text-center">
            <div className="text-4xl mb-4 animate-pixel-float">⚔</div>
            <div className="font-pixel text-yellow-400 text-xs mb-4">LOADING WORLD...</div>
            <div className="w-full h-4 bg-gray-900 border border-gray-700 mb-4">
              <div className="h-full bg-yellow-500 animate-pulse" style={{ width: '85%' }} />
            </div>
            <div className="text-gray-500 text-xs" style={{ fontFamily: 'monospace', fontSize: '11px' }}>
              Spawning {playerName} the {selectedClass}...
            </div>
            {/* Auto-advance after a tick */}
            <LaunchTimer onDone={() => setGameState('playing')} />
          </div>
        )}

        {/* PLAYING — real game */}
        {gameState === 'playing' && (
          <div className="pixel-card border-2 border-yellow-600 overflow-hidden" style={{ boxShadow: '0 0 50px rgba(245,158,11,0.4)' }}>
            {/* Game header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-black/50">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                <span className="text-green-400 font-pixel" style={{ fontSize: '8px' }}>LIVE — PixelRealms Alpha</span>
              </div>
              <div className="flex items-center gap-4 text-gray-500" style={{ fontFamily: 'monospace', fontSize: '10px' }}>
                <span className="text-green-400">● 1,284 online</span>
                <button
                  onClick={() => setGameState('idle')}
                  className="text-gray-600 hover:text-red-400 transition-colors"
                  style={{ fontSize: '10px', fontFamily: 'monospace' }}
                >
                  ✕ EXIT
                </button>
              </div>
            </div>

            {/* Canvas game */}
            <div className="relative">
              <GameCanvas playerName={playerName || 'HERO'} playerClass={selectedClass} />
            </div>

            {/* Skill bar */}
            <div className="border-t border-gray-800 bg-black/50 px-4 py-2 flex items-center justify-between">
              <div className="flex gap-2">
                {[
                  { key: 'SPACE', label: 'Attack', icon: '⚔' },
                  { key: 'Q', label: 'Skill 1', icon: '💥' },
                  { key: 'E', label: 'Skill 2', icon: '🔮' },
                  { key: 'R', label: 'Potion', icon: '💊' },
                ].map(s => (
                  <div key={s.key} className="flex flex-col items-center border border-gray-700 p-1 w-12">
                    <span className="text-xs">{s.icon}</span>
                    <span className="text-gray-600" style={{ fontFamily: 'monospace', fontSize: '8px' }}>{s.key}</span>
                  </div>
                ))}
              </div>
              <div className="text-gray-600 font-pixel" style={{ fontSize: '7px' }}>
                STARTER ZONE · WASD TO MOVE · SPACE TO ATTACK
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function LaunchTimer({ onDone }: { onDone: () => void }) {
  // Use a ref-based timer to avoid state on parent
  const { useEffect } = require('react') as typeof import('react')
  useEffect(() => {
    const t = setTimeout(onDone, 1800)
    return () => clearTimeout(t)
  }, [onDone])
  return null
}

function PixelPreview() {
  return (
    <svg viewBox="0 0 200 110" className="w-full max-w-sm mx-auto block" style={{ imageRendering: 'pixelated' }}>
      {/* Sky */}
      <rect width="200" height="110" fill="#0F0A1E" />
      {/* Stars */}
      {[10,30,60,90,110,140,170,190].map((x, i) => (
        <rect key={x} x={x} y={[5,12,3,8,15,4,10,7][i]} width="1" height="1" fill="white" opacity="0.8" />
      ))}
      {/* Ground tiles */}
      <rect x="0" y="75" width="200" height="35" fill="#2a5c23" />
      <rect x="0" y="73" width="200" height="3" fill="#326b2a" />
      {/* Stone path */}
      <rect x="80" y="73" width="40" height="37" fill="#7a7272" />
      {/* Castle */}
      <rect x="10" y="30" width="50" height="45" fill="#4a3a30" />
      <rect x="10" y="28" width="12" height="18" fill="#5a4a40" />
      <rect x="26" y="24" width="12" height="22" fill="#5a4a40" />
      <rect x="42" y="28" width="12" height="18" fill="#5a4a40" />
      <rect x="22" y="55" width="14" height="20" fill="#0a0a1e" />
      <rect x="15" y="40" width="6" height="8" fill="#f0d020" opacity="0.7" />
      <rect x="38" y="42" width="6" height="7" fill="#f0d020" opacity="0.5" />
      {/* Trees */}
      <rect x="68" y="50" width="6" height="25" fill="#6a3a10" />
      <rect x="62" y="35" width="18" height="20" fill="#1a5c14" />
      <rect x="66" y="29" width="10" height="10" fill="#2a7a20" />
      <rect x="142" y="52" width="6" height="23" fill="#6a3a10" />
      <rect x="136" y="37" width="18" height="18" fill="#1a5c14" />
      {/* Player */}
      <rect x="97" y="57" width="10" height="18" fill="#c0c0c0" />
      <rect x="98" y="51" width="8" height="8" fill="#f5c580" />
      <rect x="97" y="49" width="10" height="4" fill="#888" />
      <rect x="93" y="58" width="5" height="10" fill="#1a4aaa" />
      <rect x="105" y="55" width="2" height="14" fill="#a0a0a0" />
      {/* Slime enemy */}
      <rect x="130" y="70" width="16" height="12" fill="#20cc40" />
      <rect x="133" y="71" width="4" height="4" fill="#fff" />
      <rect x="139" y="71" width="4" height="4" fill="#fff" />
      <rect x="134" y="72" width="2" height="2" fill="#000" />
      <rect x="140" y="72" width="2" height="2" fill="#000" />
      {/* HP bar above slime */}
      <rect x="130" y="66" width="16" height="3" fill="#300" />
      <rect x="130" y="66" width="10" height="3" fill="#0f0" />
      {/* Damage number */}
      <text x="145" y="64" fill="#ff4444" fontSize="6" fontFamily="monospace" fontWeight="bold">-12</text>
      {/* XP text */}
      <text x="82" y="46" fill="#f0d020" fontSize="5" fontFamily="monospace">+15 XP</text>
      {/* Skeleton in castle */}
      <rect x="32" y="43" width="8" height="12" fill="#e8e8d0" />
      <rect x="33" y="44" width="2" height="2" fill="#cc2222" />
      <rect x="37" y="44" width="2" height="2" fill="#cc2222" />
      {/* Chat bubble */}
      <rect x="112" y="42" width="55" height="16" fill="#1a1a2e" rx="2" />
      <text x="115" y="52" fill="#60ff80" fontSize="5" fontFamily="monospace">DragonSlyr: LFG!</text>
    </svg>
  )
}
