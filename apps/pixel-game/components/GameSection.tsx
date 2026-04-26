'use client'

import { useState } from 'react'

type GameState = 'idle' | 'starting' | 'playing'

export default function GameSection() {
  const [gameState, setGameState] = useState<GameState>('idle')
  const [playerName, setPlayerName] = useState('')
  const [selectedClass, setSelectedClass] = useState('warrior')
  const [step, setStep] = useState<'name' | 'class' | 'launch'>('name')

  const handleStart = () => {
    setGameState('starting')
    setStep('name')
  }

  const handleNameNext = () => {
    if (playerName.trim().length >= 3) setStep('class')
  }

  const handleLaunch = () => {
    setStep('launch')
    setTimeout(() => setGameState('playing'), 2000)
  }

  return (
    <section id="game" className="relative py-24 px-4">
      <div className="absolute inset-0 bg-gradient-to-b from-[#0F0A1E] to-[#1a0a2e]" />
      <div className="absolute inset-0 bg-pixel-grid opacity-30" />

      <div className="relative z-10 max-w-4xl mx-auto text-center">
        <div className="text-center mb-12">
          <div className="inline-block px-3 py-1 border border-red-700 text-red-400 text-xs mb-4" style={{ fontSize: '10px' }}>
            START YOUR ADVENTURE
          </div>
          <h2 className="font-pixel text-xl md:text-2xl text-white mb-4">
            PLAY <span className="text-yellow-400">NOW</span>
          </h2>
          <div className="w-24 h-1 bg-gradient-to-r from-transparent via-red-400 to-transparent mx-auto" />
        </div>

        {gameState === 'idle' && (
          <div className="pixel-card p-8 border-2 border-yellow-700 max-w-xl mx-auto" style={{ boxShadow: '0 0 40px rgba(245, 158, 11, 0.3)' }}>
            {/* Animated pixel game preview */}
            <div className="mb-8">
              <PixelGamePreview />
            </div>
            <p className="text-gray-400 text-xs leading-relaxed mb-8" style={{ fontFamily: 'monospace', fontSize: '12px' }}>
              No download required. Play directly in your browser. Connect your wallet to save progress and earn $PIXEL tokens.
            </p>
            <button
              onClick={handleStart}
              className="pixel-btn pixel-btn-primary font-pixel px-10 py-4 text-sm w-full"
            >
              ▶ START GAME — FREE
            </button>
            <p className="text-gray-600 text-xs mt-3" style={{ fontFamily: 'monospace', fontSize: '10px' }}>
              No wallet required to start
            </p>
          </div>
        )}

        {gameState === 'starting' && step === 'name' && (
          <div className="pixel-card p-8 border-2 border-purple-700 max-w-xl mx-auto animate-fade-in">
            <h3 className="font-pixel text-purple-400 text-xs mb-6" style={{ fontSize: '10px' }}>ENTER HERO NAME</h3>
            <div className="mb-6">
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value.toUpperCase().slice(0, 12))}
                placeholder="ENTER NAME..."
                maxLength={12}
                className="w-full bg-black border-2 border-purple-700 text-white font-pixel text-center py-4 px-4 focus:outline-none focus:border-yellow-500 text-xs"
                style={{ caretColor: '#F59E0B' }}
                onKeyDown={(e) => e.key === 'Enter' && handleNameNext()}
              />
              <div className="text-gray-600 text-xs mt-2" style={{ fontFamily: 'monospace', fontSize: '10px' }}>
                {playerName.length}/12 characters
              </div>
            </div>
            <button
              onClick={handleNameNext}
              disabled={playerName.trim().length < 3}
              className="pixel-btn pixel-btn-primary font-pixel px-8 py-3 text-xs w-full disabled:opacity-40"
            >
              NEXT ▶
            </button>
          </div>
        )}

        {gameState === 'starting' && step === 'class' && (
          <div className="pixel-card p-8 border-2 border-purple-700 max-w-2xl mx-auto animate-fade-in">
            <h3 className="font-pixel text-purple-400 text-xs mb-6" style={{ fontSize: '10px' }}>
              CHOOSE CLASS — {playerName}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {[
                { id: 'warrior', label: 'WARRIOR', icon: '⚔', desc: 'Tank & melee' },
                { id: 'mage', label: 'MAGE', icon: '🔮', desc: 'Magic & AOE' },
                { id: 'rogue', label: 'ROGUE', icon: '🗡', desc: 'Stealth & crit' },
                { id: 'archer', label: 'ARCHER', icon: '🏹', desc: 'Range & trap' },
              ].map((cls) => (
                <button
                  key={cls.id}
                  onClick={() => setSelectedClass(cls.id)}
                  className={`p-4 border-2 font-pixel transition-all ${
                    selectedClass === cls.id
                      ? 'border-yellow-500 bg-yellow-500/10 text-yellow-400'
                      : 'border-gray-700 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  <div className="text-2xl mb-2">{cls.icon}</div>
                  <div className="text-xs mb-1" style={{ fontSize: '8px' }}>{cls.label}</div>
                  <div className="text-xs text-gray-500" style={{ fontFamily: 'monospace', fontSize: '10px' }}>{cls.desc}</div>
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep('name')} className="pixel-btn pixel-btn-secondary font-pixel px-6 py-3 text-xs flex-1">
                ◀ BACK
              </button>
              <button onClick={handleLaunch} className="pixel-btn pixel-btn-primary font-pixel px-6 py-3 text-xs flex-1">
                LAUNCH ▶
              </button>
            </div>
          </div>
        )}

        {gameState === 'starting' && step === 'launch' && (
          <div className="pixel-card p-12 border-2 border-yellow-600 max-w-xl mx-auto">
            <div className="text-4xl mb-4 animate-pixel-float">⚔</div>
            <div className="font-pixel text-yellow-400 text-xs mb-4">LOADING WORLD...</div>
            <div className="w-full h-4 bg-gray-900 border border-gray-700 mb-2">
              <div className="h-full bg-yellow-500 animate-pulse" style={{ width: '70%' }} />
            </div>
            <div className="text-gray-500 text-xs" style={{ fontFamily: 'monospace', fontSize: '11px' }}>
              Spawning {playerName} the {selectedClass}...
            </div>
          </div>
        )}

        {gameState === 'playing' && (
          <div className="pixel-card border-2 border-yellow-600 overflow-hidden" style={{ boxShadow: '0 0 40px rgba(245, 158, 11, 0.4)' }}>
            <PixelGameCanvas playerName={playerName} playerClass={selectedClass} />
          </div>
        )}
      </div>
    </section>
  )
}

function PixelGamePreview() {
  // Static pixel art scene
  return (
    <svg viewBox="0 0 120 80" className="w-full max-w-xs mx-auto" style={{ imageRendering: 'pixelated' }}>
      {/* Sky */}
      <rect width="120" height="80" fill="#0F0A1E" />
      {/* Stars */}
      <rect x="10" y="5" width="1" height="1" fill="white" opacity="0.8" />
      <rect x="30" y="3" width="1" height="1" fill="white" opacity="0.6" />
      <rect x="60" y="8" width="1" height="1" fill="white" opacity="0.9" />
      <rect x="90" y="4" width="1" height="1" fill="white" opacity="0.7" />
      <rect x="110" y="10" width="1" height="1" fill="white" />
      {/* Moon */}
      <rect x="95" y="5" width="8" height="8" fill="#FEF3C7" rx="1" />
      {/* Ground */}
      <rect x="0" y="65" width="120" height="15" fill="#14532d" />
      <rect x="0" y="63" width="120" height="3" fill="#166534" />
      {/* Path */}
      <rect x="50" y="63" width="20" height="17" fill="#92400e" />
      {/* Castle/dungeon */}
      <rect x="5" y="35" width="30" height="30" fill="#1F2937" />
      <rect x="8" y="32" width="8" height="10" fill="#374151" />
      <rect x="19" y="30" width="8" height="12" fill="#374151" />
      <rect x="15" y="52" width="8" height="13" fill="#111827" />
      <rect x="10" y="40" width="4" height="5" fill="#F59E0B" opacity="0.7" />
      <rect x="21" y="43" width="4" height="4" fill="#F59E0B" opacity="0.5" />
      {/* Trees */}
      <rect x="42" y="50" width="4" height="14" fill="#92400e" />
      <rect x="38" y="38" width="12" height="16" fill="#15803d" />
      <rect x="40" y="34" width="8" height="8" fill="#16a34a" />
      {/* Hero character */}
      <rect x="56" y="52" width="8" height="12" fill="#C0C0C0" />
      <rect x="56" y="47" width="8" height="7" fill="#FBBF24" />
      <rect x="55" y="45" width="10" height="4" fill="#78350F" />
      {/* Enemy */}
      <rect x="80" y="55" width="8" height="8" fill="#7C3AED" />
      <rect x="81" y="52" width="6" height="5" fill="#EF4444" />
      <rect x="82" y="53" width="1" height="1" fill="#FEF3C7" />
      <rect x="85" y="53" width="1" height="1" fill="#FEF3C7" />
      {/* Health bars */}
      <rect x="54" y="44" width="12" height="2" fill="#DC2626" />
      <rect x="54" y="44" width="10" height="2" fill="#16A34A" />
      <rect x="78" y="51" width="12" height="2" fill="#DC2626" />
      <rect x="78" y="51" width="6" height="2" fill="#DC2626" opacity="0.8" />
      {/* Spell effect */}
      <rect x="66" y="56" width="3" height="3" fill="#06B6D4" opacity="0.8" />
      <rect x="70" y="54" width="2" height="2" fill="#06B6D4" opacity="0.6" />
      <rect x="74" y="55" width="2" height="2" fill="#06B6D4" opacity="0.4" />
      {/* Floating XP */}
      <text x="75" y="50" fill="#FCD34D" fontSize="4" fontFamily="monospace">+25 XP</text>
    </svg>
  )
}

function PixelGameCanvas({ playerName, playerClass }: { playerName: string; playerClass: string }) {
  const classColor: Record<string, string> = {
    warrior: '#C0C0C0',
    mage: '#7C3AED',
    rogue: '#1F2937',
    archer: '#065F46',
  }

  return (
    <div className="relative" style={{ background: '#0F0A1E', minHeight: '400px' }}>
      {/* Game UI Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-800 bg-black/40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 border-2 border-yellow-600 flex items-center justify-center" style={{ background: classColor[playerClass] }}>
            <span className="text-xs font-pixel" style={{ fontSize: '8px' }}>{playerClass[0].toUpperCase()}</span>
          </div>
          <div>
            <div className="font-pixel text-yellow-400 text-xs" style={{ fontSize: '9px' }}>{playerName}</div>
            <div className="text-gray-500 text-xs capitalize" style={{ fontFamily: 'monospace', fontSize: '10px' }}>Lv.1 {playerClass}</div>
          </div>
        </div>
        <div className="flex gap-4 text-xs" style={{ fontFamily: 'monospace', fontSize: '10px' }}>
          <span className="text-green-400">HP: 100/100</span>
          <span className="text-blue-400">MP: 50/50</span>
          <span className="text-yellow-400">$PIXEL: 0</span>
        </div>
      </div>

      {/* Main game view - simplified pixel world */}
      <div className="flex flex-col items-center justify-center p-8" style={{ minHeight: '280px' }}>
        <svg viewBox="0 0 200 120" className="w-full max-w-lg" style={{ imageRendering: 'pixelated' }}>
          {/* World */}
          <rect width="200" height="120" fill="#0a1628" />
          {/* Floor tiles */}
          {Array.from({ length: 25 }, (_, i) => (
            <rect key={i} x={(i % 5) * 40} y={80 + Math.floor(i / 5) * 20} width="40" height="20" fill={i % 2 === 0 ? '#1a2e1a' : '#163a16'} stroke="#0f1f0f" strokeWidth="0.5" />
          ))}
          {/* Walls */}
          <rect x="0" y="0" width="200" height="80" fill="#1e2a3d" />
          {/* Wall tiles */}
          {Array.from({ length: 20 }, (_, i) => (
            <rect key={i} x={(i % 10) * 20} y={Math.floor(i / 10) * 40} width="20" height="40" fill={i % 3 === 0 ? '#263347' : '#1e2a3d'} stroke="#141e2d" strokeWidth="0.5" />
          ))}
          {/* Torches */}
          <rect x="28" y="25" width="4" height="8" fill="#92400e" />
          <rect x="27" y="20" width="6" height="6" fill="#F59E0B" opacity="0.9" />
          <rect x="28" y="18" width="4" height="4" fill="#FCD34D" opacity="0.7" />
          <rect x="158" y="25" width="4" height="8" fill="#92400e" />
          <rect x="157" y="20" width="6" height="6" fill="#F59E0B" opacity="0.9" />
          {/* Door */}
          <rect x="88" y="60" width="24" height="20" fill="#78350F" />
          <rect x="90" y="62" width="20" height="18" fill="#92400e" />
          <rect x="97" y="68" width="3" height="3" fill="#FCD34D" />
          {/* Player character */}
          <rect x="93" y="88" width="8" height="10" fill={classColor[playerClass]} />
          <rect x="94" y="83" width="6" height="7" fill="#FBBF24" />
          <rect x="93" y="81" width="8" height="4" fill="#78350F" />
          {/* Player shadow */}
          <ellipse cx="97" cy="99" rx="5" ry="2" fill="black" opacity="0.4" />
          {/* Chat bubble */}
          <rect x="103" y="75" width="40" height="12" fill="#1F2937" rx="1" />
          <rect x="103" y="86" width="5" height="3" fill="#1F2937" />
          <text x="107" y="84" fill="#E5E7EB" fontSize="5" fontFamily="monospace">Hello world!</text>
          {/* Chest */}
          <rect x="155" y="90" width="14" height="10" fill="#92400e" />
          <rect x="155" y="90" width="14" height="5" fill="#78350F" />
          <rect x="160" y="92" width="4" height="3" fill="#FCD34D" />
          {/* Mini-map corner */}
          <rect x="170" y="5" width="24" height="24" fill="#0a1628" stroke="#374151" strokeWidth="1" />
          <rect x="178" y="14" width="3" height="3" fill="#EF4444" />
          <rect x="171" y="6" width="22" height="2" fill="#164e63" opacity="0.5" />
          <text x="171" y="32" fill="#6B7280" fontSize="4" fontFamily="monospace">MAP</text>
        </svg>

        <div className="text-center mt-4">
          <p className="text-gray-500 text-xs" style={{ fontFamily: 'monospace', fontSize: '11px' }}>
            Use WASD to move • Click to attack • Press I for inventory
          </p>
          <div className="mt-2 text-yellow-400 text-xs font-pixel animate-pixel-blink" style={{ fontSize: '9px' }}>
            ▲▼◀▶ CONTROLS ENABLED
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div className="border-t border-gray-800 p-3 bg-black/40 flex items-center justify-between">
        <div className="flex gap-2">
          {['⚔ ATTACK', '🛡 DEFEND', '💊 POTION', '⚡ SKILL'].map((action) => (
            <button
              key={action}
              className="px-3 py-1 border border-gray-700 hover:border-yellow-600 text-gray-400 hover:text-yellow-400 transition-colors"
              style={{ fontFamily: 'monospace', fontSize: '10px' }}
            >
              {action}
            </button>
          ))}
        </div>
        <div className="text-gray-600 text-xs font-pixel" style={{ fontSize: '8px' }}>
          STARTER ZONE · LEVEL 1-10
        </div>
      </div>
    </div>
  )
}
