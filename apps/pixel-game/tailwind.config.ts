import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        pixel: ['"Press Start 2P"', 'cursive'],
      },
      colors: {
        'pixel-purple': '#6B21A8',
        'pixel-purple-light': '#9333EA',
        'pixel-blue': '#1D4ED8',
        'pixel-cyan': '#06B6D4',
        'pixel-gold': '#F59E0B',
        'pixel-green': '#10B981',
        'pixel-red': '#EF4444',
        'pixel-dark': '#0F0A1E',
        'pixel-darker': '#070412',
      },
      animation: {
        'pixel-float': 'pixel-float 3s ease-in-out infinite',
        'pixel-blink': 'pixel-blink 1s step-end infinite',
        'pixel-shake': 'pixel-shake 0.5s ease-in-out',
        'star-twinkle': 'star-twinkle 2s ease-in-out infinite',
        'slide-up': 'slide-up 0.6s ease-out forwards',
        'fade-in': 'fade-in 0.8s ease-out forwards',
        'march': 'march 1s steps(4) infinite',
      },
      keyframes: {
        'pixel-float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        'pixel-blink': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
        'pixel-shake': {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-4px)' },
          '75%': { transform: 'translateX(4px)' },
        },
        'star-twinkle': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.3', transform: 'scale(0.8)' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(30px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'march': {
          '0%': { backgroundPosition: '0 0' },
          '100%': { backgroundPosition: '64px 0' },
        },
      },
      backgroundImage: {
        'pixel-grid': 'linear-gradient(rgba(147, 51, 234, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(147, 51, 234, 0.1) 1px, transparent 1px)',
      },
      backgroundSize: {
        'pixel-grid': '32px 32px',
      },
    },
  },
  plugins: [],
}

export default config
