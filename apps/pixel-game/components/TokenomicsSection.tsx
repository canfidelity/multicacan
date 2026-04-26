const tokenAllocation = [
  { label: 'PLAY TO EARN', percentage: 40, color: '#9333EA', description: 'Rewards for battles, quests, and raids' },
  { label: 'ECOSYSTEM FUND', percentage: 20, color: '#F59E0B', description: 'Development and partnerships' },
  { label: 'TEAM & ADVISORS', percentage: 15, color: '#06B6D4', description: '3-year vesting schedule' },
  { label: 'PUBLIC SALE', percentage: 15, color: '#10B981', description: 'IDO and exchange listings' },
  { label: 'STAKING REWARDS', percentage: 10, color: '#EF4444', description: 'Long-term holder incentives' },
]

const tokenInfo = [
  { label: 'TOKEN NAME', value: '$PIXEL' },
  { label: 'NETWORK', value: 'Ethereum' },
  { label: 'TOTAL SUPPLY', value: '1,000,000,000' },
  { label: 'TOKEN TYPE', value: 'ERC-20' },
  { label: 'INITIAL PRICE', value: '$0.02' },
  { label: 'MARKET CAP', value: '$20M' },
]

export default function TokenomicsSection() {
  return (
    <section id="tokenomics" className="relative py-24 px-4">
      <div className="absolute inset-0 bg-gradient-to-b from-[#0F0A1E] to-[#0a0618]" />
      <div className="absolute inset-0 bg-pixel-grid opacity-20" />

      <div className="relative z-10 max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-block px-3 py-1 border border-green-700 text-green-400 text-xs mb-4" style={{ fontSize: '10px' }}>
            TOKEN ECONOMICS
          </div>
          <h2 className="font-pixel text-xl md:text-2xl text-white mb-4">
            <span className="text-yellow-400">$PIXEL</span> TOKEN
          </h2>
          <div className="w-24 h-1 bg-gradient-to-r from-transparent via-green-400 to-transparent mx-auto" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Token info */}
          <div>
            <div className="pixel-card p-6 border-2 border-yellow-800 mb-6" style={{ boxShadow: '0 0 30px rgba(245, 158, 11, 0.2)' }}>
              <div className="flex items-center gap-4 mb-6">
                <PixelCoin />
                <div>
                  <h3 className="font-pixel text-yellow-400 text-sm">$PIXEL</h3>
                  <p className="text-gray-500 text-xs" style={{ fontFamily: 'monospace' }}>The in-game economy token</p>
                </div>
              </div>

              <div className="space-y-3">
                {tokenInfo.map((info) => (
                  <div key={info.label} className="flex justify-between items-center border-b border-gray-900 pb-2">
                    <span className="text-gray-500 text-xs font-pixel" style={{ fontSize: '9px' }}>{info.label}</span>
                    <span className="text-yellow-400 text-xs" style={{ fontFamily: 'monospace' }}>{info.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Earn ways */}
            <div className="pixel-card p-5 border-2 border-purple-800">
              <h4 className="font-pixel text-purple-400 text-xs mb-4" style={{ fontSize: '10px' }}>HOW TO EARN</h4>
              <div className="space-y-2">
                {[
                  { icon: '⚔', label: 'Win PvP battles', amount: '+5-50 $PIXEL' },
                  { icon: '🐉', label: 'Defeat raid bosses', amount: '+100-500 $PIXEL' },
                  { icon: '🏆', label: 'Complete quests', amount: '+10-100 $PIXEL' },
                  { icon: '🏪', label: 'Sell NFT items', amount: 'Variable' },
                  { icon: '🌾', label: 'Resource gathering', amount: '+1-10 $PIXEL/hr' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between p-2 bg-black/30 border border-gray-900">
                    <span className="flex items-center gap-2 text-gray-400 text-xs" style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                      <span>{item.icon}</span>
                      {item.label}
                    </span>
                    <span className="text-green-400 text-xs font-pixel" style={{ fontSize: '8px' }}>{item.amount}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Allocation chart */}
          <div className="pixel-card p-6 border-2 border-gray-800">
            <h4 className="font-pixel text-white text-xs mb-6" style={{ fontSize: '10px' }}>TOKEN ALLOCATION</h4>

            {/* Simple bar chart */}
            <div className="space-y-4 mb-8">
              {tokenAllocation.map((item) => (
                <div key={item.label}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-gray-400 text-xs font-pixel" style={{ fontSize: '8px' }}>{item.label}</span>
                    <span className="font-pixel text-xs" style={{ color: item.color, fontSize: '9px' }}>{item.percentage}%</span>
                  </div>
                  <div className="h-4 bg-gray-900 border border-gray-800 relative">
                    <div
                      className="h-full relative overflow-hidden"
                      style={{ width: `${item.percentage}%`, background: item.color }}
                    >
                      <div className="absolute inset-0 opacity-30" style={{
                        backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(255,255,255,0.3) 2px, rgba(255,255,255,0.3) 4px)',
                      }} />
                    </div>
                  </div>
                  <p className="text-gray-600 text-xs mt-1" style={{ fontFamily: 'monospace', fontSize: '10px' }}>
                    {item.description}
                  </p>
                </div>
              ))}
            </div>

            {/* Pixel pie chart visual */}
            <div className="flex justify-center">
              <PixelPieChart />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function PixelCoin() {
  return (
    <svg width="48" height="48" viewBox="0 0 16 16" style={{ imageRendering: 'pixelated' }}>
      <rect x="3" y="1" width="10" height="1" fill="#F59E0B" />
      <rect x="1" y="2" width="14" height="1" fill="#F59E0B" />
      <rect x="1" y="3" width="14" height="10" fill="#D97706" />
      <rect x="1" y="13" width="14" height="1" fill="#F59E0B" />
      <rect x="3" y="14" width="10" height="1" fill="#F59E0B" />
      {/* P letter */}
      <rect x="5" y="5" width="1" height="6" fill="#FCD34D" />
      <rect x="6" y="5" width="3" height="1" fill="#FCD34D" />
      <rect x="9" y="6" width="1" height="2" fill="#FCD34D" />
      <rect x="6" y="8" width="3" height="1" fill="#FCD34D" />
      {/* Shine */}
      <rect x="2" y="3" width="2" height="3" fill="#FCD34D" opacity="0.5" />
    </svg>
  )
}

function PixelPieChart() {
  const colors = ['#9333EA', '#F59E0B', '#06B6D4', '#10B981', '#EF4444']
  const labels = ['40%', '20%', '15%', '15%', '10%']

  return (
    <div>
      <div className="grid grid-cols-5 gap-1">
        {colors.map((color, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div
              style={{
                width: '20px',
                height: `${[80, 40, 30, 30, 20][i]}px`,
                background: color,
                imageRendering: 'pixelated',
              }}
            />
            <span className="text-xs" style={{ color, fontFamily: 'monospace', fontSize: '9px' }}>{labels[i]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
