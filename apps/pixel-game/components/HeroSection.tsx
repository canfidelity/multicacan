'use client'

import { useState, useEffect } from 'react'
import WalletButton from './WalletButton'
import StarField from './StarField'
import { WarriorSprite, MageSprite, RogueSprite } from './PixelCharacters'

const TYPING_TEXTS = [
  'BATTLE EPIC BOSSES',
  'EXPLORE VAST WORLDS',
  'EARN REAL REWARDS',
  'OWN YOUR HEROES',
  'FORGE RARE GEAR',
]

export default function HeroSection() {
  const [textIndex, setTextIndex] = useState(0)
  const [displayed, setDisplayed] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    const target = TYPING_TEXTS[textIndex]
    const speed = isDeleting ? 50 : 80

    const timer = setTimeout(() => {
      if (!isDeleting) {
        if (displayed.length < target.length) {
          setDisplayed(target.slice(0, displayed.length + 1))
        } else {
          setTimeout(() => setIsDeleting(true), 1500)
        }
      } else {
        if (displayed.length > 0) {
          setDisplayed(target.slice(0, displayed.length - 1))
        } else {
          setIsDeleting(false)
          setTextIndex((prev) => (prev + 1) % TYPING_TEXTS.length)
        }
      }
    }, speed)

    return () => clearTimeout(timer)
  }, [displayed, isDeleting, textIndex])

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden pt-16">
      {/* Background layers */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#070412] via-[#0F0A1E] to-[#1a0a2e]" />
      <div className="absolute inset-0 bg-pixel-grid opacity-50" />
      <StarField />

      {/* Floating mountains silhouette */}
      <div className="absolute bottom-0 left-0 right-0 h-48 pointer-events-none">
        <svg viewBox="0 0 400 100" preserveAspectRatio="none" className="w-full h-full" style={{ imageRendering: 'pixelated' }}>
          {/* Far mountains */}
          <polygon points="0,100 40,40 80,70 120,30 160,60 200,20 240,55 280,35 320,65 360,25 400,50 400,100" fill="#1a0a2e" />
          {/* Mid mountains */}
          <polygon points="0,100 30,60 70,80 110,50 150,75 190,45 230,70 270,40 310,75 350,55 400,70 400,100" fill="#0F0A1E" />
          {/* Near hills */}
          <polygon points="0,100 50,80 100,90 150,75 200,85 250,70 300,85 350,78 400,85 400,100" fill="#070412" />
        </svg>
      </div>

      {/* Moon */}
      <div className="absolute top-24 right-16 md:right-32 opacity-80 pointer-events-none">
        <svg width="60" height="60" viewBox="0 0 15 15" style={{ imageRendering: 'pixelated' }}>
          <rect x="3" y="1" width="9" height="1" fill="#FEF3C7" />
          <rect x="1" y="2" width="13" height="1" fill="#FEF3C7" />
          <rect x="1" y="3" width="13" height="9" fill="#FEF3C7" />
          <rect x="1" y="12" width="13" height="1" fill="#FEF3C7" />
          <rect x="3" y="13" width="9" height="1" fill="#FEF3C7" />
          {/* Craters */}
          <rect x="4" y="4" width="2" height="2" fill="#FDE68A" />
          <rect x="8" y="7" width="3" height="2" fill="#FDE68A" />
          <rect x="3" y="9" width="2" height="2" fill="#FDE68A" />
        </svg>
      </div>

      {/* Floating characters */}
      <div className="absolute left-4 md:left-16 top-1/3 opacity-60 animate-pixel-float pointer-events-none" style={{ animationDelay: '0s' }}>
        <WarriorSprite className="w-16 h-16 md:w-24 md:h-24" />
      </div>
      <div className="absolute right-4 md:right-16 top-1/3 opacity-60 animate-pixel-float pointer-events-none" style={{ animationDelay: '1s' }}>
        <MageSprite className="w-16 h-16 md:w-24 md:h-24" />
      </div>
      <div className="absolute left-1/4 bottom-32 opacity-40 animate-pixel-float pointer-events-none hidden lg:block" style={{ animationDelay: '0.5s' }}>
        <RogueSprite className="w-12 h-12" />
      </div>

      {/* Main content */}
      <div className="relative z-10 text-center px-4 max-w-5xl mx-auto">
        {/* Badge */}
        <div className="inline-block mb-8 px-4 py-2 border-2 border-yellow-500 bg-yellow-500/10 text-yellow-400 text-xs tracking-wider">
          ⚔ CRYPTO MMORPG ⚔
        </div>

        {/* Main title */}
        <h1 className="font-pixel mb-4">
          <div className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl text-white mb-2 glow-purple">
            PIXEL
          </div>
          <div className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl text-yellow-400 glow-gold">
            REALMS
          </div>
        </h1>

        {/* Subtitle with typing effect */}
        <div className="h-10 flex items-center justify-center mb-8">
          <p className="text-purple-300 text-xs sm:text-sm md:text-base">
            {displayed}
            <span className="animate-pixel-blink text-yellow-400">█</span>
          </p>
        </div>

        {/* Description */}
        <p className="text-gray-400 text-xs leading-relaxed max-w-2xl mx-auto mb-10" style={{ fontFamily: 'monospace', fontSize: '13px' }}>
          The ultimate blockchain pixel MMORPG. Own your heroes as NFTs, earn $PIXEL tokens through battle, and build your kingdom in a persistent on-chain world.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
          <a
            href="#game"
            className="pixel-btn pixel-btn-primary font-pixel px-8 py-4 text-sm"
          >
            ▶ PLAY NOW — FREE
          </a>
          <WalletButton large />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 max-w-xl mx-auto">
          {[
            { value: '12,847', label: 'PLAYERS' },
            { value: '348K', label: '$PIXEL EARNED' },
            { value: '5,291', label: 'NFTs MINTED' },
          ].map((stat) => (
            <div key={stat.label} className="pixel-card p-3 text-center">
              <div className="text-yellow-400 text-sm md:text-base font-pixel mb-1">{stat.value}</div>
              <div className="text-gray-500 text-xs" style={{ fontFamily: 'monospace' }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-50 pointer-events-none">
        <span className="text-gray-500 text-xs font-pixel" style={{ fontSize: '8px' }}>SCROLL</span>
        <div className="w-px h-8 bg-gradient-to-b from-purple-500 to-transparent" />
        <span className="text-purple-400 animate-bounce text-xs">▼</span>
      </div>
    </section>
  )
}
