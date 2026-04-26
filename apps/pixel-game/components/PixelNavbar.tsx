'use client'

import { useState } from 'react'
import WalletButton from './WalletButton'

export default function PixelNavbar() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b-2 border-purple-800" style={{ background: 'rgba(7, 4, 18, 0.95)', backdropFilter: 'blur(8px)' }}>
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <PixelLogo />
          <span className="text-yellow-400 text-xs glow-gold hidden sm:block">
            PIXEL<span className="text-purple-400">REALMS</span>
          </span>
        </div>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-6 text-xs text-gray-400">
          <a href="#features" className="hover:text-yellow-400 transition-colors">FEATURES</a>
          <a href="#characters" className="hover:text-yellow-400 transition-colors">CLASSES</a>
          <a href="#world" className="hover:text-yellow-400 transition-colors">WORLD</a>
          <a href="#tokenomics" className="hover:text-yellow-400 transition-colors">TOKENOMICS</a>
          <a href="#roadmap" className="hover:text-yellow-400 transition-colors">ROADMAP</a>
        </div>

        <div className="flex items-center gap-3">
          <WalletButton compact />
          {/* Mobile menu */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden text-purple-400 hover:text-yellow-400 transition-colors"
            aria-label="Toggle menu"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              {menuOpen ? (
                <path d="M6 18L18 6M6 6l12 12" stroke="currentColor" strokeWidth="2" fill="none" />
              ) : (
                <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" fill="none" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-purple-900 px-4 py-4 space-y-4 text-xs text-gray-400">
          <a href="#features" className="block hover:text-yellow-400 py-2">FEATURES</a>
          <a href="#characters" className="block hover:text-yellow-400 py-2">CLASSES</a>
          <a href="#world" className="block hover:text-yellow-400 py-2">WORLD</a>
          <a href="#tokenomics" className="block hover:text-yellow-400 py-2">TOKENOMICS</a>
          <a href="#roadmap" className="block hover:text-yellow-400 py-2">ROADMAP</a>
        </div>
      )}
    </nav>
  )
}

function PixelLogo() {
  return (
    <svg width="32" height="32" viewBox="0 0 16 16" style={{ imageRendering: 'pixelated' }}>
      {/* Pixel castle/sword icon */}
      <rect x="7" y="1" width="2" height="8" fill="#F59E0B" />
      <rect x="5" y="3" width="6" height="2" fill="#F59E0B" />
      <rect x="6" y="9" width="4" height="2" fill="#9333EA" />
      <rect x="5" y="11" width="6" height="4" fill="#9333EA" />
      <rect x="4" y="12" width="8" height="1" fill="#6B21A8" />
      <rect x="7" y="0" width="2" height="2" fill="#FCD34D" />
    </svg>
  )
}
