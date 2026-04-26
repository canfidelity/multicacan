import PixelNavbar from '@/components/PixelNavbar'
import HeroSection from '@/components/HeroSection'
import FeaturesSection from '@/components/FeaturesSection'
import CharactersSection from '@/components/CharactersSection'
import GameSection from '@/components/GameSection'
import TokenomicsSection from '@/components/TokenomicsSection'
import RoadmapSection from '@/components/RoadmapSection'
import Footer from '@/components/Footer'

export default function HomePage() {
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
