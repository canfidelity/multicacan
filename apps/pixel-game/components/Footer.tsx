export default function Footer() {
  return (
    <footer className="relative border-t-2 border-purple-900 py-12 px-4">
      <div className="absolute inset-0 bg-[#070412]" />

      <div className="relative z-10 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div className="col-span-1 md:col-span-2">
            <div className="font-pixel text-yellow-400 text-sm mb-3 glow-gold">
              PIXEL<span className="text-purple-400">REALMS</span>
            </div>
            <p className="text-gray-500 text-xs leading-relaxed" style={{ fontFamily: 'monospace', fontSize: '12px' }}>
              The ultimate blockchain pixel MMORPG. Built by gamers, for gamers. Own your heroes, earn real rewards, and shape the world of PixelRealms.
            </p>
            <div className="flex gap-3 mt-4">
              {['𝕏', 'Discord', 'Telegram', 'GitHub'].map((social) => (
                <button
                  key={social}
                  className="px-3 py-1 border border-gray-800 hover:border-purple-600 text-gray-500 hover:text-purple-400 transition-colors text-xs"
                  style={{ fontFamily: 'monospace', fontSize: '11px' }}
                >
                  {social}
                </button>
              ))}
            </div>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-pixel text-gray-400 text-xs mb-4" style={{ fontSize: '9px' }}>GAME</h4>
            <ul className="space-y-2">
              {['Play Now', 'Whitepaper', 'NFT Collection', 'Marketplace', 'Leaderboard'].map((link) => (
                <li key={link}>
                  <a href="#" className="text-gray-600 hover:text-yellow-400 transition-colors text-xs" style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                    ▸ {link}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-pixel text-gray-400 text-xs mb-4" style={{ fontSize: '9px' }}>COMMUNITY</h4>
            <ul className="space-y-2">
              {['Discord Server', 'Twitter/X', 'Telegram', 'Blog', 'Press Kit'].map((link) => (
                <li key={link}>
                  <a href="#" className="text-gray-600 hover:text-yellow-400 transition-colors text-xs" style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                    ▸ {link}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Newsletter */}
        <div className="border-t border-gray-900 pt-8 mb-8">
          <div className="max-w-md">
            <h4 className="font-pixel text-white text-xs mb-3" style={{ fontSize: '10px' }}>JOIN THE WAITLIST</h4>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="your@email.com"
                className="flex-1 bg-black border-2 border-gray-800 focus:border-purple-600 outline-none px-3 py-2 text-white text-xs"
                style={{ fontFamily: 'monospace' }}
              />
              <button className="pixel-btn pixel-btn-primary font-pixel px-4 py-2 text-xs">
                JOIN
              </button>
            </div>
            <p className="text-gray-600 text-xs mt-2" style={{ fontFamily: 'monospace', fontSize: '10px' }}>
              Get early access + 100 $PIXEL airdrop
            </p>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-gray-900 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-gray-700 text-xs" style={{ fontFamily: 'monospace', fontSize: '10px' }}>
            © 2026 PixelRealms. All rights reserved.
          </p>
          <div className="flex gap-4">
            {['Privacy Policy', 'Terms of Service', 'Cookie Policy'].map((link) => (
              <a key={link} href="#" className="text-gray-700 hover:text-gray-500 transition-colors text-xs" style={{ fontFamily: 'monospace', fontSize: '10px' }}>
                {link}
              </a>
            ))}
          </div>
        </div>

        {/* Disclaimer */}
        <div className="mt-4 p-3 border border-gray-900 bg-black/30">
          <p className="text-gray-700 text-xs leading-relaxed" style={{ fontFamily: 'monospace', fontSize: '10px' }}>
            ⚠ DISCLAIMER: $PIXEL tokens are utility tokens for in-game use. This is not financial advice. Cryptocurrency investments carry risk. Always do your own research.
          </p>
        </div>
      </div>
    </footer>
  )
}
