'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

// Load all sections client-side only to avoid SSR issues
const PixelNavbar = dynamic(() => import('./PixelNavbar'), { ssr: false })
const HeroSection = dynamic(() => import('./HeroSection'), { ssr: false })
const FeaturesSection = dynamic(() => import('./FeaturesSection'), { ssr: false })
const CharactersSection = dynamic(() => import('./CharactersSection'), { ssr: false })
const GameSection = dynamic(() => import('./GameSection'), { ssr: false })
const TokenomicsSection = dynamic(() => import('./TokenomicsSection'), { ssr: false })
const RoadmapSection = dynamic(() => import('./RoadmapSection'), { ssr: false })
const Footer = dynamic(() => import('./Footer'), { ssr: false })

export default function ClientRoot() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#0F0A1E] flex items-center justify-center">
        <div className="font-pixel text-yellow-400 text-xs animate-pulse">LOADING...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0F0A1E] crt-effect scanlines">
      <PixelNavbar />
      <main>
        <HeroSection />
        <FeaturesSection />
        <CharactersSection />
        <GameSection />
        <TokenomicsSection />
        <RoadmapSection />
      </main>
      <Footer />
    </div>
  )
}
