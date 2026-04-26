const features = [
  {
    icon: '⚔',
    title: 'EPIC BATTLES',
    description: 'Real-time turn-based combat with 50+ unique skills, spell combos, and boss raids up to 20 players.',
    color: 'text-red-400',
    borderColor: 'border-red-800',
    glowColor: 'rgba(239, 68, 68, 0.2)',
  },
  {
    icon: '🏰',
    title: 'GUILD WARS',
    description: 'Form guilds, claim territories, and battle for control of rare resource nodes across 12 regions.',
    color: 'text-yellow-400',
    borderColor: 'border-yellow-800',
    glowColor: 'rgba(245, 158, 11, 0.2)',
  },
  {
    icon: '💎',
    title: 'NFT HEROES',
    description: 'Each hero is a unique NFT with provably rare traits. Level up, equip gear, and trade on the marketplace.',
    color: 'text-cyan-400',
    borderColor: 'border-cyan-800',
    glowColor: 'rgba(6, 182, 212, 0.2)',
  },
  {
    icon: '🌍',
    title: 'VAST WORLD',
    description: '256×256 pixel map with dungeons, biomes, hidden treasures, and player-built cities.',
    color: 'text-green-400',
    borderColor: 'border-green-800',
    glowColor: 'rgba(16, 185, 129, 0.2)',
  },
  {
    icon: '🪙',
    title: 'PLAY & EARN',
    description: 'Earn $PIXEL tokens through quests, raids, and PvP. Cash out or reinvest in your empire.',
    color: 'text-purple-400',
    borderColor: 'border-purple-800',
    glowColor: 'rgba(147, 51, 234, 0.2)',
  },
  {
    icon: '🛡',
    title: 'TRUE OWNERSHIP',
    description: 'All assets live on-chain. No company can take your items, heroes, or land away.',
    color: 'text-blue-400',
    borderColor: 'border-blue-800',
    glowColor: 'rgba(29, 78, 216, 0.2)',
  },
]

export default function FeaturesSection() {
  return (
    <section id="features" className="relative py-24 px-4">
      <div className="absolute inset-0 bg-gradient-to-b from-[#1a0a2e] to-[#0F0A1E]" />
      <div className="absolute inset-0 bg-pixel-grid opacity-30" />

      <div className="relative z-10 max-w-6xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-16">
          <div className="inline-block px-3 py-1 border border-purple-700 text-purple-400 text-xs mb-4" style={{ fontSize: '10px' }}>
            GAME FEATURES
          </div>
          <h2 className="font-pixel text-xl md:text-2xl text-white mb-4">
            WHY PIXEL<span className="text-yellow-400">REALMS</span>?
          </h2>
          <div className="w-24 h-1 bg-gradient-to-r from-transparent via-yellow-400 to-transparent mx-auto" />
        </div>

        {/* Features grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => (
            <div
              key={feature.title}
              className={`pixel-card p-6 border-2 ${feature.borderColor} transition-transform hover:-translate-y-1 cursor-default`}
              style={{ boxShadow: `0 0 30px ${feature.glowColor}, inset 0 0 30px rgba(0,0,0,0.5)` }}
            >
              <div className="text-3xl mb-4">{feature.icon}</div>
              <h3 className={`font-pixel text-xs mb-3 ${feature.color}`} style={{ fontSize: '10px' }}>
                {feature.title}
              </h3>
              <p className="text-gray-400 text-xs leading-relaxed" style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                {feature.description}
              </p>
            </div>
          ))}
        </div>

        {/* Pixel world preview placeholder */}
        <div className="mt-16 pixel-card p-4 border-2 border-purple-700">
          <div className="text-center text-xs text-gray-500 mb-4 font-pixel" style={{ fontSize: '9px' }}>
            ▼ WORLD MAP PREVIEW ▼
          </div>
          <PixelWorldMap />
        </div>
      </div>
    </section>
  )
}

function PixelWorldMap() {
  // A stylized mini world map using CSS/SVG
  const tiles = [
    // Row 0
    { x: 0, y: 0, color: '#1e3a5f' }, { x: 1, y: 0, color: '#1e3a5f' }, { x: 2, y: 0, color: '#1e3a5f' },
    { x: 3, y: 0, color: '#164e63' }, { x: 4, y: 0, color: '#1e3a5f' }, { x: 5, y: 0, color: '#1e3a5f' },
    { x: 6, y: 0, color: '#1e3a5f' }, { x: 7, y: 0, color: '#1e3a5f' },
    // Row 1
    { x: 0, y: 1, color: '#1e3a5f' }, { x: 1, y: 1, color: '#14532d' }, { x: 2, y: 1, color: '#14532d' },
    { x: 3, y: 1, color: '#166534' }, { x: 4, y: 1, color: '#14532d' }, { x: 5, y: 1, color: '#1e3a5f' },
    { x: 6, y: 1, color: '#065f46' }, { x: 7, y: 1, color: '#1e3a5f' },
    // Row 2
    { x: 0, y: 2, color: '#1e3a5f' }, { x: 1, y: 2, color: '#15803d' }, { x: 2, y: 2, color: '#4d7c0f' },
    { x: 3, y: 2, color: '#14532d' }, { x: 4, y: 2, color: '#15803d' }, { x: 5, y: 2, color: '#065f46' },
    { x: 6, y: 2, color: '#166534' }, { x: 7, y: 2, color: '#1e3a5f' },
    // Row 3
    { x: 0, y: 3, color: '#1e3a5f' }, { x: 1, y: 3, color: '#78350f' }, { x: 2, y: 3, color: '#92400e' },
    { x: 3, y: 3, color: '#78350f' }, { x: 4, y: 3, color: '#14532d' }, { x: 5, y: 3, color: '#14532d' },
    { x: 6, y: 3, color: '#1e3a5f' }, { x: 7, y: 3, color: '#1e3a5f' },
    // Row 4
    { x: 0, y: 4, color: '#1e3a5f' }, { x: 1, y: 4, color: '#1e3a5f' }, { x: 2, y: 4, color: '#7c3aed' },
    { x: 3, y: 4, color: '#6d28d9' }, { x: 4, y: 4, color: '#7c3aed' }, { x: 5, y: 4, color: '#1e3a5f' },
    { x: 6, y: 4, color: '#1e3a5f' }, { x: 7, y: 4, color: '#1e3a5f' },
  ]

  return (
    <div className="flex justify-center">
      <div
        className="relative"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(8, 48px)',
          gridTemplateRows: 'repeat(5, 48px)',
          gap: '2px',
          imageRendering: 'pixelated',
        }}
      >
        {tiles.map((tile, i) => (
          <div
            key={i}
            style={{
              backgroundColor: tile.color,
              gridColumn: tile.x + 1,
              gridRow: tile.y + 1,
              position: 'relative',
              border: '1px solid rgba(0,0,0,0.3)',
            }}
          >
            {/* Add some tile details */}
            {tile.color === '#92400e' && (
              <div style={{ position: 'absolute', inset: '8px', background: '#a16207', borderRadius: '50%' }} />
            )}
            {tile.color === '#7c3aed' && (
              <div style={{ position: 'absolute', top: '4px', left: '50%', transform: 'translateX(-50%)', width: '8px', height: '16px', background: '#a78bfa' }} />
            )}
          </div>
        ))}
        {/* Legend overlay */}
        <div className="absolute -bottom-8 left-0 right-0 flex gap-4 justify-center" style={{ fontFamily: 'monospace', fontSize: '10px' }}>
          <span style={{ color: '#15803d' }}>■ Forest</span>
          <span style={{ color: '#1e3a5f' }}>■ Ocean</span>
          <span style={{ color: '#92400e' }}>■ Desert</span>
          <span style={{ color: '#7c3aed' }}>■ Magic Zone</span>
        </div>
      </div>
    </div>
  )
}
