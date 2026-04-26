'use client'

import { useMemo } from 'react'

interface Star {
  x: number
  y: number
  size: number
  delay: number
  duration: number
}

export default function StarField() {
  const stars = useMemo<Star[]>(() => {
    return Array.from({ length: 80 }, (_, i) => ({
      x: (i * 37 + 13) % 100,
      y: (i * 53 + 7) % 100,
      size: i % 3 === 0 ? 2 : 1,
      delay: (i * 0.3) % 3,
      duration: 2 + (i % 3),
    }))
  }, [])

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {stars.map((star, i) => (
        <div
          key={i}
          className="absolute bg-white"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            animation: `star-twinkle ${star.duration}s ease-in-out ${star.delay}s infinite`,
            imageRendering: 'pixelated',
          }}
        />
      ))}
    </div>
  )
}
