const phases = [
  {
    phase: 'PHASE 1',
    title: 'GENESIS',
    period: 'Q1 2026',
    status: 'COMPLETED',
    statusColor: 'text-green-400',
    statusBorder: 'border-green-700',
    items: [
      'Core game engine (pixel rendering)',
      'Hero NFT collection (10,000 genesis)',
      'Alpha test with 500 players',
      '$PIXEL token launch on Ethereum',
    ],
    icon: '🌱',
  },
  {
    phase: 'PHASE 2',
    title: 'EXPANSION',
    period: 'Q2 2026',
    status: 'IN PROGRESS',
    statusColor: 'text-yellow-400',
    statusBorder: 'border-yellow-700',
    items: [
      'Open world map (256×256)',
      'PvP arena (1v1, 3v3, 5v5)',
      'Guild system & territory wars',
      'Marketplace for NFT trading',
    ],
    icon: '⚔',
  },
  {
    phase: 'PHASE 3',
    title: 'CONQUEST',
    period: 'Q3 2026',
    status: 'UPCOMING',
    statusColor: 'text-blue-400',
    statusBorder: 'border-blue-800',
    items: [
      'Land NFTs and player cities',
      '20-player raid bosses',
      'Cross-chain bridge (Polygon)',
      'Mobile app (iOS & Android)',
    ],
    icon: '🏰',
  },
  {
    phase: 'PHASE 4',
    title: 'ASCENSION',
    period: 'Q4 2026',
    status: 'PLANNED',
    statusColor: 'text-gray-500',
    statusBorder: 'border-gray-800',
    items: [
      'DAO governance launch',
      'Layer 2 scaling solution',
      'Esports tournament system',
      'Console & PC desktop client',
    ],
    icon: '👑',
  },
]

export default function RoadmapSection() {
  return (
    <section id="roadmap" className="relative py-24 px-4">
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0618] to-[#070412]" />

      <div className="relative z-10 max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-block px-3 py-1 border border-cyan-700 text-cyan-400 text-xs mb-4" style={{ fontSize: '10px' }}>
            DEVELOPMENT TIMELINE
          </div>
          <h2 className="font-pixel text-xl md:text-2xl text-white mb-4">
            ROAD<span className="text-cyan-400">MAP</span>
          </h2>
          <div className="w-24 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent mx-auto" />
        </div>

        {/* Timeline */}
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-4 md:left-1/2 top-0 bottom-0 w-0.5 bg-gradient-to-b from-green-500 via-yellow-500 via-blue-500 to-gray-600 transform md:-translate-x-1/2" />

          <div className="space-y-8">
            {phases.map((phase, index) => (
              <div
                key={phase.phase}
                className={`relative flex flex-col md:flex-row gap-4 md:gap-8 ${
                  index % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'
                }`}
              >
                {/* Timeline dot */}
                <div className="absolute left-4 md:left-1/2 top-4 w-4 h-4 border-2 border-gray-700 bg-gray-900 transform md:-translate-x-1/2 z-10 flex items-center justify-center">
                  <div className={`w-2 h-2 ${phase.status === 'COMPLETED' ? 'bg-green-400' : phase.status === 'IN PROGRESS' ? 'bg-yellow-400 animate-pulse' : 'bg-gray-700'}`} />
                </div>

                {/* Content */}
                <div className={`ml-12 md:ml-0 flex-1 ${index % 2 === 0 ? 'md:text-right md:pr-12' : 'md:pl-12'}`}>
                  <div
                    className={`pixel-card p-5 border-2 ${phase.statusBorder} inline-block w-full`}
                    style={{ boxShadow: phase.status === 'COMPLETED' ? '0 0 20px rgba(16, 185, 129, 0.2)' : phase.status === 'IN PROGRESS' ? '0 0 20px rgba(245, 158, 11, 0.2)' : 'none' }}
                  >
                    {/* Phase header */}
                    <div className={`flex items-center gap-3 mb-3 ${index % 2 === 0 ? 'md:flex-row-reverse' : ''}`}>
                      <span className="text-2xl">{phase.icon}</span>
                      <div className={index % 2 === 0 ? 'md:text-right' : ''}>
                        <div className="text-gray-500 font-pixel text-xs" style={{ fontSize: '8px' }}>{phase.phase}</div>
                        <h3 className="font-pixel text-white text-xs">{phase.title}</h3>
                        <div className="text-gray-500 text-xs" style={{ fontFamily: 'monospace', fontSize: '11px' }}>{phase.period}</div>
                      </div>
                    </div>

                    {/* Status badge */}
                    <div className={`inline-block px-2 py-1 border ${phase.statusBorder} ${phase.statusColor} text-xs mb-3 font-pixel`} style={{ fontSize: '8px' }}>
                      {phase.status === 'COMPLETED' && '✓ '}{phase.status}
                    </div>

                    {/* Items */}
                    <ul className="space-y-1">
                      {phase.items.map((item) => (
                        <li
                          key={item}
                          className={`flex items-start gap-2 text-gray-400 ${index % 2 === 0 ? 'md:flex-row-reverse' : ''}`}
                          style={{ fontFamily: 'monospace', fontSize: '11px' }}
                        >
                          <span className={phase.statusColor}>
                            {phase.status === 'COMPLETED' ? '✓' : '▸'}
                          </span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Spacer for opposite side */}
                <div className="hidden md:block flex-1" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
