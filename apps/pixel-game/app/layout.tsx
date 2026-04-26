import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PixelRealms — Crypto MMORPG',
  description: 'The ultimate pixel art MMORPG on the blockchain. Explore, battle, trade, and earn in a vast pixel universe.',
  keywords: 'crypto game, pixel mmorpg, blockchain game, play to earn, nft game',
  openGraph: {
    title: 'PixelRealms — Crypto MMORPG',
    description: 'Battle, explore, and earn in the ultimate pixel blockchain RPG',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-pixel bg-pixel-dark antialiased">
        {children}
      </body>
    </html>
  )
}
