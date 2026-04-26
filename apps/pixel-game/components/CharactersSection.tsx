'use client'

import { useState } from 'react'
import { WarriorSprite, MageSprite, RogueSprite, ArcherSprite } from './PixelCharacters'

const characters = [
  {
    id: 'warrior',
    name: 'WARRIOR',
    title: 'Iron Vanguard',
    element: '🔥 Fire',
    sprite: WarriorSprite,
    stats: { STR: 95, AGI: 45, INT: 30, DEF: 90, HP: 100 },
    rarity: 'COMMON',
    rarityColor: 'text-gray-300',
    description: 'Unstoppable front-line fighter. Masters of sword and shield. Tank entire dungeons solo.',
    skills: ['Shield Bash', 'Whirlwind Strike', 'War Cry', 'Iron Fortress'],
    color: 'border-red-700',
    glow: 'rgba(220, 38, 38, 0.3)',
    accentColor: 'text-red-400',
  },
  {
    id: 'mage',
    name: 'MAGE',
    title: 'Arcane Scholar',
    element: '⚡ Lightning',
    sprite: MageSprite,
    stats: { STR: 20, AGI: 55, INT: 100, DEF: 25, HP: 45 },
    rarity: 'RARE',
    rarityColor: 'text-blue-400',
    description: 'Wield ancient magic to devastate enemies. Summon familiars and bend reality itself.',
    skills: ['Fireball', 'Chain Lightning', 'Arcane Surge', 'Time Warp'],
    color: 'border-blue-600',
    glow: 'rgba(37, 99, 235, 0.3)',
    accentColor: 'text-blue-400',
  },
  {
    id: 'rogue',
    name: 'ROGUE',
    title: 'Shadow Blade',
    element: '🌑 Shadow',
    sprite: RogueSprite,
    stats: { STR: 65, AGI: 100, INT: 50, DEF: 40, HP: 60 },
    rarity: 'EPIC',
    rarityColor: 'text-purple-400',
    description: 'Strike from the shadows. Vanish, assassinate, and loot dungeons before others arrive.',
    skills: ['Shadowstep', 'Poison Blade', 'Evasion', 'Death Mark'],
    color: 'border-purple-600',
    glow: 'rgba(124, 58, 237, 0.3)',
    accentColor: 'text-purple-400',
  },
  {
    id: 'archer',
    name: 'ARCHER',
    title: 'Ranger Scout',
    element: '🌿 Nature',
    sprite: ArcherSprite,
    stats: { STR: 55, AGI: 85, INT: 60, DEF: 35, HP: 65 },
    rarity: 'UNCOMMON',
    rarityColor: 'text-green-400',
    description: 'Precise long-range damage and nature magic. Scout hidden areas and trap enemies.',
    skills: ['Arrow Rain', 'Eagle Eye', 'Ensnare', 'Nature\'s Blessing'],
    color: 'border-green-700',
    glow: 'rgba(5, 150, 105, 0.3)',
    accentColor: 'text-green-400',
  },
]

type StatKey = 'STR' | 'AGI' | 'INT' | 'DEF' | 'HP'

export default function CharactersSection() {
  const [selected, setSelected] = useState(characters[0].id)

  const activeChar = characters.find((c) => c.id === selected) ?? characters[0]
  const ActiveSprite = activeChar.sprite

  return (
    <section id="characters" className="relative py-24 px-4">
      <div className="absolute inset-0 bg-gradient-to-b from-[#0F0A1E] via-[#0a0618] to-[#0F0A1E]" />

      <div className="relative z-10 max-w-6xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-16">
          <div className="inline-block px-3 py-1 border border-yellow-700 text-yellow-400 text-xs mb-4" style={{ fontSize: '10px' }}>
            CHOOSE YOUR CLASS
          </div>
          <h2 className="font-pixel text-xl md:text-2xl text-white mb-4">
            HERO <span className="text-yellow-400">CLASSES</span>
          </h2>
          <div className="w-24 h-1 bg-gradient-to-r from-transparent via-yellow-400 to-transparent mx-auto" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* Class selector */}
          <div className="grid grid-cols-2 gap-3">
            {characters.map((char) => {
              const Sprite = char.sprite
              return (
                <button
                  key={char.id}
                  onClick={() => setSelected(char.id)}
                  className={`pixel-card p-4 border-2 text-left transition-all ${
                    selected === char.id ? char.color : 'border-gray-800'
                  } hover:border-gray-600`}
                  style={{
                    boxShadow: selected === char.id ? `0 0 20px ${char.glow}` : 'none',
                  }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div style={{ animationDelay: `${characters.indexOf(char) * 0.3}s` }} className="animate-pixel-float">
                      <Sprite className="w-10 h-10" />
                    </div>
                    <div>
                      <div className={`font-pixel text-xs ${char.accentColor}`} style={{ fontSize: '9px' }}>
                        {char.name}
                      </div>
                      <div className={`text-xs ${char.rarityColor}`} style={{ fontFamily: 'monospace', fontSize: '10px' }}>
                        {char.rarity}
                      </div>
                    </div>
                  </div>
                  <div className="text-gray-500 text-xs" style={{ fontFamily: 'monospace', fontSize: '10px' }}>
                    {char.element}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Character detail */}
          <div
            key={activeChar.id}
            className={`pixel-card p-6 border-2 ${activeChar.color}`}
            style={{ boxShadow: `0 0 40px ${activeChar.glow}` }}
          >
            {/* Header */}
            <div className="flex items-center gap-4 mb-6">
              <div className="relative">
                <ActiveSprite className="w-20 h-20 animate-pixel-float" />
                <div
                  className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-12 h-2 rounded-full blur-sm opacity-70"
                  style={{ background: activeChar.glow }}
                />
              </div>
              <div>
                <h3 className={`font-pixel text-sm ${activeChar.accentColor}`}>{activeChar.name}</h3>
                <p className="text-gray-400 text-xs mt-1" style={{ fontFamily: 'monospace' }}>{activeChar.title}</p>
                <span className={`text-xs font-pixel ${activeChar.rarityColor}`} style={{ fontSize: '9px' }}>
                  ★ {activeChar.rarity}
                </span>
              </div>
            </div>

            {/* Description */}
            <p className="text-gray-400 text-xs leading-relaxed mb-6" style={{ fontFamily: 'monospace', fontSize: '12px' }}>
              {activeChar.description}
            </p>

            {/* Stats */}
            <div className="mb-6 space-y-2">
              <div className="text-gray-500 text-xs font-pixel mb-2" style={{ fontSize: '9px' }}>BASE STATS</div>
              {(Object.entries(activeChar.stats) as [StatKey, number][]).map(([stat, value]) => (
                <div key={stat} className="flex items-center gap-2">
                  <span className="text-gray-500 text-xs w-8 font-pixel" style={{ fontSize: '8px' }}>{stat}</span>
                  <div className="flex-1 h-3 bg-gray-900 border border-gray-800">
                    <div
                      className="h-full transition-all duration-500"
                      style={{
                        width: `${value}%`,
                        background: `linear-gradient(90deg, ${activeChar.glow.replace('0.3', '0.8')}, ${activeChar.glow.replace('0.3', '1')})`,
                      }}
                    />
                  </div>
                  <span className={`text-xs w-8 text-right font-pixel ${activeChar.accentColor}`} style={{ fontSize: '8px' }}>
                    {value}
                  </span>
                </div>
              ))}
            </div>

            {/* Skills */}
            <div>
              <div className="text-gray-500 text-xs font-pixel mb-2" style={{ fontSize: '9px' }}>SKILLS</div>
              <div className="grid grid-cols-2 gap-2">
                {activeChar.skills.map((skill) => (
                  <div key={skill} className="px-2 py-1 bg-black/40 border border-gray-800 text-gray-400 text-xs" style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                    ▸ {skill}
                  </div>
                ))}
              </div>
            </div>

            {/* CTA */}
            <button className={`mt-6 w-full pixel-btn pixel-btn-secondary font-pixel py-3 text-xs`}>
              MINT THIS HERO
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
