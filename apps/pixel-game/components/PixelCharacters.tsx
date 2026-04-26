export function WarriorSprite({ className = '' }: { className?: string }) {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 16 16"
      className={className}
      style={{ imageRendering: 'pixelated' }}
    >
      {/* Body */}
      <rect x="5" y="7" width="6" height="5" fill="#C0C0C0" />
      {/* Head */}
      <rect x="5" y="3" width="6" height="5" fill="#FBBF24" />
      {/* Hair/Helmet */}
      <rect x="4" y="2" width="8" height="3" fill="#78350F" />
      <rect x="3" y="4" width="1" height="2" fill="#78350F" />
      <rect x="12" y="4" width="1" height="2" fill="#78350F" />
      {/* Eyes */}
      <rect x="6" y="5" width="1" height="1" fill="#1E40AF" />
      <rect x="9" y="5" width="1" height="1" fill="#1E40AF" />
      {/* Shield */}
      <rect x="3" y="8" width="3" height="4" fill="#1D4ED8" />
      <rect x="4" y="9" width="1" height="2" fill="#FCD34D" />
      {/* Sword */}
      <rect x="12" y="5" width="1" height="7" fill="#9CA3AF" />
      <rect x="11" y="7" width="3" height="1" fill="#92400E" />
      {/* Legs */}
      <rect x="5" y="12" width="2" height="3" fill="#7C3AED" />
      <rect x="9" y="12" width="2" height="3" fill="#7C3AED" />
      {/* Feet */}
      <rect x="5" y="14" width="3" height="1" fill="#1F2937" />
      <rect x="8" y="14" width="3" height="1" fill="#1F2937" />
    </svg>
  )
}

export function MageSprite({ className = '' }: { className?: string }) {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 16 16"
      className={className}
      style={{ imageRendering: 'pixelated' }}
    >
      {/* Robe */}
      <rect x="4" y="7" width="8" height="6" fill="#7C3AED" />
      {/* Head */}
      <rect x="5" y="3" width="6" height="5" fill="#FBBF24" />
      {/* Hat */}
      <rect x="4" y="0" width="8" height="4" fill="#4C1D95" />
      <rect x="5" y="0" width="6" height="1" fill="#7C3AED" />
      {/* Star on hat */}
      <rect x="7" y="1" width="2" height="2" fill="#FCD34D" />
      {/* Eyes */}
      <rect x="6" y="5" width="1" height="1" fill="#7C3AED" />
      <rect x="9" y="5" width="1" height="1" fill="#7C3AED" />
      {/* Staff */}
      <rect x="2" y="4" width="1" height="10" fill="#92400E" />
      <rect x="1" y="2" width="3" height="3" fill="#06B6D4" />
      <rect x="2" y="1" width="1" height="1" fill="#A5F3FC" />
      {/* Magic glow */}
      <rect x="1" y="2" width="1" height="1" fill="#A5F3FC" opacity="0.5" />
      <rect x="3" y="2" width="1" height="1" fill="#A5F3FC" opacity="0.5" />
      {/* Robe detail */}
      <rect x="5" y="9" width="2" height="3" fill="#6D28D9" />
      <rect x="9" y="9" width="2" height="3" fill="#6D28D9" />
      {/* Star/rune on robe */}
      <rect x="7" y="9" width="2" height="1" fill="#FCD34D" />
      <rect x="7" y="11" width="2" height="1" fill="#FCD34D" />
      <rect x="7" y="10" width="2" height="1" fill="#FCD34D" />
    </svg>
  )
}

export function RogueSprite({ className = '' }: { className?: string }) {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 16 16"
      className={className}
      style={{ imageRendering: 'pixelated' }}
    >
      {/* Body */}
      <rect x="5" y="7" width="6" height="5" fill="#1F2937" />
      {/* Head */}
      <rect x="5" y="3" width="6" height="5" fill="#FBBF24" />
      {/* Hood */}
      <rect x="4" y="2" width="8" height="4" fill="#111827" />
      <rect x="5" y="2" width="6" height="2" fill="#1F2937" />
      {/* Mask */}
      <rect x="5" y="6" width="6" height="2" fill="#111827" />
      {/* Eyes (glowing) */}
      <rect x="6" y="5" width="1" height="1" fill="#10B981" />
      <rect x="9" y="5" width="1" height="1" fill="#10B981" />
      {/* Daggers */}
      <rect x="3" y="7" width="1" height="5" fill="#9CA3AF" />
      <rect x="12" y="7" width="1" height="5" fill="#9CA3AF" />
      <rect x="2" y="6" width="2" height="1" fill="#6B7280" />
      <rect x="12" y="6" width="2" height="1" fill="#6B7280" />
      {/* Belt */}
      <rect x="4" y="11" width="8" height="1" fill="#92400E" />
      <rect x="7" y="11" width="2" height="1" fill="#FCD34D" />
      {/* Legs */}
      <rect x="5" y="12" width="2" height="3" fill="#111827" />
      <rect x="9" y="12" width="2" height="3" fill="#111827" />
      {/* Boots */}
      <rect x="4" y="14" width="4" height="1" fill="#1F2937" />
      <rect x="8" y="14" width="4" height="1" fill="#1F2937" />
    </svg>
  )
}

export function ArcherSprite({ className = '' }: { className?: string }) {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 16 16"
      className={className}
      style={{ imageRendering: 'pixelated' }}
    >
      {/* Body - green ranger */}
      <rect x="5" y="7" width="6" height="5" fill="#065F46" />
      {/* Head */}
      <rect x="5" y="3" width="6" height="5" fill="#FBBF24" />
      {/* Hat - ranger hat */}
      <rect x="3" y="3" width="10" height="2" fill="#047857" />
      <rect x="5" y="1" width="6" height="3" fill="#065F46" />
      {/* Feather */}
      <rect x="11" y="1" width="1" height="3" fill="#FCD34D" />
      {/* Eyes */}
      <rect x="6" y="5" width="1" height="1" fill="#1F2937" />
      <rect x="9" y="5" width="1" height="1" fill="#1F2937" />
      {/* Bow */}
      <rect x="2" y="5" width="1" height="8" fill="#92400E" />
      <rect x="2" y="5" width="3" height="1" fill="#92400E" />
      <rect x="2" y="12" width="3" height="1" fill="#92400E" />
      {/* Bowstring */}
      <rect x="3" y="6" width="1" height="6" fill="#E5E7EB" />
      {/* Arrow */}
      <rect x="4" y="8" width="8" height="1" fill="#D97706" />
      <rect x="11" y="8" width="2" height="1" fill="#EF4444" />
      {/* Quiver on back */}
      <rect x="11" y="7" width="2" height="4" fill="#92400E" />
      {/* Legs */}
      <rect x="5" y="12" width="2" height="3" fill="#064E3B" />
      <rect x="9" y="12" width="2" height="3" fill="#064E3B" />
      {/* Boots */}
      <rect x="5" y="14" width="3" height="1" fill="#78350F" />
      <rect x="8" y="14" width="3" height="1" fill="#78350F" />
    </svg>
  )
}
