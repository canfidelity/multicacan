'use client'

import { useEffect, useRef, useCallback } from 'react'

// ─── Constants ────────────────────────────────────────────────────────────────
const TILE = 32
const CW = 800
const CH = 520
const WW = 50   // world width  (tiles)
const WH = 30   // world height (tiles)
const PSPEED = 2.8
const PW = 24   // player width
const PH = 32   // player height

// ─── Tile map ─────────────────────────────────────────────────────────────────
// 0=grass 1=water 2=stonepath 3=tree/solid 4=wall/solid 5=sand 6=flower 7=castlefloor
type Tile = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7
const SOLID_TILES = new Set<Tile>([1, 3, 4])

function buildMap(): Tile[][] {
  const m: Tile[][] = Array.from({ length: WH }, () => Array(WW).fill(0) as Tile[])
  // Left river
  for (let y = 0; y < WH; y++) { m[y][0] = 1; m[y][1] = 1 }
  // Right cliff water
  for (let y = 4; y < 22; y++) { m[y][48] = 1; m[y][49] = 1 }
  // Castle walls top
  for (let x = 8; x < 32; x++) { m[0][x] = 4; m[1][x] = 4 }
  // Castle interior
  for (let y = 0; y < 5; y++)
    for (let x = 9; x < 31; x++) m[y][x] = 7
  // Castle side walls
  for (let y = 0; y < 5; y++) { m[y][8] = 4; m[y][9] = 4; m[y][30] = 4; m[y][31] = 4 }
  // Gate opening
  for (let y = 3; y < 5; y++) for (let x = 18; x < 22; x++) m[y][x] = 7
  // Stone path out of castle
  for (let y = 4; y < 12; y++) { m[y][19] = 2; m[y][20] = 2 }
  // Horizontal town path
  for (let x = 5; x < 42; x++) m[8][x] = 2
  // Vertical side paths
  for (let y = 5; y < 14; y++) { m[y][10] = 2; m[y][34] = 2 }
  // Forest band
  for (let y = 13; y < 18; y++) {
    for (let x = 2; x < WW - 2; x++) {
      if (m[y][x] === 0 && (x * 7 + y * 3) % 5 < 3) m[y][x] = 3
    }
    // Keep path through forest
    for (let x = 18; x < 22; x++) m[y][x] = 0
    m[y][10] = 0; m[y][34] = 0
  }
  // Desert bottom
  for (let y = 23; y < WH; y++)
    for (let x = 2; x < WW - 2; x++) m[y][x] = 5
  // Flowers in grass
  for (let y = 5; y < 13; y++)
    for (let x = 2; x < WW - 2; x++)
      if (m[y][x] === 0 && (x * 13 + y * 7) % 11 === 0) m[y][x] = 6
  for (let y = 18; y < 23; y++)
    for (let x = 2; x < WW - 2; x++)
      if (m[y][x] === 0 && (x * 11 + y * 5) % 9 === 0) m[y][x] = 6
  return m
}
const MAP = buildMap()

// ─── Types ────────────────────────────────────────────────────────────────────
type Dir = 'up' | 'down' | 'left' | 'right'
type EnemyKind = 'slime' | 'skeleton' | 'dragon'

interface Player {
  x: number; y: number
  hp: number; maxHp: number
  mp: number; maxMp: number
  level: number; xp: number; xpNext: number
  gold: number; tokens: number
  dir: Dir; frame: number; fTimer: number
  atkTimer: number; invTimer: number
  moving: boolean
  dead: boolean; respTimer: number
  name: string; cls: string
}

interface Enemy {
  id: number; kind: EnemyKind
  x: number; y: number
  hp: number; maxHp: number
  dir: Dir; frame: number; fTimer: number
  state: 'patrol' | 'chase' | 'attack' | 'dead'
  sTimer: number
  homeX: number; homeY: number
  atkTimer: number
  xp: number; gold: number; tok: number
  respTimer: number
}

interface DmgNum { x: number; y: number; v: number; c: string; t: number }
interface Particle { x: number; y: number; vx: number; vy: number; c: string; t: number; s: number }
interface ChatMsg { name: string; text: string; c: string; age: number }

interface GS {  // mutable game state in a ref
  p: Player
  enemies: Enemy[]
  dmg: DmgNum[]
  parts: Particle[]
  chat: ChatMsg[]
  keys: Set<string>
  camX: number; camY: number
  lastTs: number
  chatTimer: number
  npcBubble: { idx: number; msg: string; t: number } | null
  paused: boolean
  attackPressed: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const dist2 = (ax: number, ay: number, bx: number, by: number) =>
  (ax - bx) ** 2 + (ay - by) ** 2

function solidAt(px: number, py: number) {
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE)
  if (tx < 0 || ty < 0 || tx >= WW || ty >= WH) return true
  return SOLID_TILES.has(MAP[ty][tx])
}
function canMove(x: number, y: number, w: number, h: number) {
  const m = 3
  return !solidAt(x + m, y + m) && !solidAt(x + w - m, y + m) &&
    !solidAt(x + m, y + h - m) && !solidAt(x + w - m, y + h - m)
}

// ─── Sprite drawing ───────────────────────────────────────────────────────────
type R = [number, number, number, number, string]
function dr(ctx: CanvasRenderingContext2D, rs: R[], ox: number, oy: number) {
  for (const [x, y, w, h, c] of rs) {
    if (!c || c === 'x') continue
    ctx.fillStyle = c; ctx.fillRect(ox + x, oy + y, w, h)
  }
}

function playerSprite(cls: string, dir: Dir, frame: number): R[] {
  const lf = frame === 0 ? 3 : -3
  const skin = '#f5c580', hair = '#3a2010'
  const blues = ['warrior', 'rogue'].includes(cls)

  if (cls === 'warrior') {
    return [
      [6, 0, 12, 3, '#888'], [4, 2, 16, 5, '#bbb'],
      [6, 5, 12, 7, skin], [8, 7, 2, 2, '#224aa'], [14, 7, 2, 2, '#224aa'],
      [3, 11, 18, 11, '#c0c0c0'], [3, 21, 18, 2, '#7a4a20'], [10, 21, 4, 2, '#f0b820'],
      dir === 'right' ? [-3, 9, 4, 12, '#b0b0b0'] : [23, 9, 4, 12, '#b0b0b0'],
      dir === 'left'  ? [23, 11, 6, 9, '#2244aa'] : [-3, 11, 6, 9, '#2244aa'],
      [5, 23, 6, 7 + lf, '#3333aa'], [13, 23, 6, 7 - lf, '#3333aa'],
      [4, 29 + lf, 8, 3, '#22226a'], [12, 29 - lf, 8, 3, '#22226a'],
    ]
  }
  if (cls === 'mage') {
    return [
      [7, -5, 10, 3, '#3a1a7a'], [4, -2, 16, 4, '#3a1a7a'], [11, -4, 3, 3, '#f0d020'],
      [6, 3, 12, 8, skin], [8, 5, 2, 2, '#8822cc'], [14, 5, 2, 2, '#8822cc'],
      [2, 10, 20, 14, '#6a20cc'], [9, 11, 6, 10, '#9a50ff'],
      [-4, 1, 3, 28, '#8a5520'], [-5, -2, 5, 5, '#20c0f0'],
      [5, 24, 5, 6 + lf, '#4a14aa'], [14, 24, 5, 6 - lf, '#4a14aa'],
    ]
  }
  if (cls === 'rogue') {
    return [
      [4, 0, 16, 4, '#1a1a2a'], [6, 3, 12, 8, skin], [6, 7, 12, 4, '#1a1a2a'],
      [8, 6, 2, 2, '#20ee60'], [14, 6, 2, 2, '#20ee60'],
      [4, 10, 16, 12, '#1a1a2a'], [4, 21, 16, 2, '#5a3010'], [10, 21, 4, 2, '#f0b820'],
      [-3, 7, 3, 14, '#b0b0b0'], [24, 7, 3, 14, '#b0b0b0'],
      [5, 23, 6, 7 + lf, '#111'], [13, 23, 6, 7 - lf, '#111'],
      [4, 29 + lf, 8, 3, '#080808'], [12, 29 - lf, 8, 3, '#080808'],
    ]
  }
  // archer
  return [
    [2, 1, 20, 3, '#1a5a20'], [6, -2, 12, 4, '#1a5a20'], [20, 0, 2, 5, '#f0d020'],
    [6, 3, 12, 7, skin], [8, 5, 2, 2, '#222'], [14, 5, 2, 2, '#222'],
    [4, 9, 16, 13, '#1a6a25'],
    [-5, 2, 3, 26, '#8a5520'], [-4, 4, 1, 20, '#e0e0e0'],
    [21, 8, 4, 10, '#8a5520'],
    [5, 22, 6, 7 + lf, '#1a4a20'], [13, 22, 6, 7 - lf, '#1a4a20'],
    [4, 28 + lf, 8, 3, '#5a3010'], [12, 28 - lf, 8, 3, '#5a3010'],
  ]
}

function slimeSprite(frame: number): R[] {
  const sq = frame === 0 ? 0 : 4
  return [
    [2, 3 + sq, 20, 14 - sq, '#20cc40'], [0, 6 + sq, 24, 10 - sq, '#18bb35'],
    [4, 5 + sq, 8, 4, '#50ff70'],
    [4, 7 + sq, 4, 4, '#fff'], [15, 7 + sq, 4, 4, '#fff'],
    [5, 8 + sq, 2, 2, '#111'], [16, 8 + sq, 2, 2, '#111'],
    [2, 14, 20, 4, '#10aa25'],
  ]
}

function skeletonSprite(frame: number): R[] {
  const lf = frame === 0 ? 3 : -3
  return [
    [5, 0, 14, 12, '#e8e8d0'], [7, 3, 4, 5, '#2a2a2a'], [13, 3, 4, 5, '#2a2a2a'],
    [8, 4, 2, 3, '#cc2222'], [14, 4, 2, 3, '#cc2222'],
    [8, 9, 2, 3, '#c8c8b0'], [11, 9, 2, 3, '#c8c8b0'], [14, 9, 2, 3, '#c8c8b0'],
    [5, 12, 14, 10, '#d8d8c0'],
    [6, 13, 2, 8, '#3a3a2a'], [10, 13, 2, 8, '#3a3a2a'], [14, 13, 2, 8, '#3a3a2a'],
    [0, 12, 5, 4, '#d8d8c0'], [19, 12, 5, 4, '#d8d8c0'],
    [0, 16, 4, 8, '#d8d8c0'], [20, 16, 4, 8, '#d8d8c0'],
    [22, 8, 2, 16, '#a0a0a0'], [21, 7, 4, 3, '#808080'],
    [7, 22, 4, 7 + lf, '#d8d8c0'], [13, 22, 4, 7 - lf, '#d8d8c0'],
    [5, 28 + lf, 7, 4, '#d8d8c0'], [12, 28 - lf, 7, 4, '#d8d8c0'],
  ]
}

function dragonSprite(frame: number): R[] {
  const wf = frame === 0 ? 0 : 5
  return [
    [-14, 2 - wf, 16, 18 + wf, '#8a1a1a'], [26, 2 - wf, 16, 18 + wf, '#8a1a1a'],
    [-12, 5 - wf, 10, 14, '#aa2222'], [28, 5 - wf, 10, 14, '#aa2222'],
    [4, 6, 20, 20, '#cc2222'], [8, 0, 14, 12, '#cc2222'],
    [7, 5, 7, 7, '#dd3333'], [19, 2, 4, 4, '#f0f020'], [20, 3, 2, 2, '#000'],
    [16, -5, 3, 7, '#8a4a10'],
    [20, 22, 20, 5, '#cc2222'], [35, 24, 10, 4, '#aa1a1a'],
    [5, 24, 7, 9, '#aa1a1a'], [16, 24, 7, 9, '#aa1a1a'],
    [3, 31, 12, 5, '#aa1a1a'], [14, 31, 12, 5, '#aa1a1a'],
    ...(frame === 1 ? [[-2, 5, 8, 4, '#ff8800'] as R, [-1, 6, 5, 2, '#ffcc00'] as R] : []),
  ]
}

function npcSprite(color: string): R[] {
  return [
    [7, 0, 10, 3, '#4a3020'], [5, 2, 14, 8, '#f5c580'],
    [7, 4, 2, 2, '#444'], [13, 4, 2, 2, '#444'],
    [8, 7, 7, 2, '#f5c580'],
    [3, 9, 18, 12, color], [8, 10, 8, 8, color],
    [4, 21, 8, 9, '#3a2010'], [12, 21, 8, 9, '#3a2010'],
  ]
}

// ─── Tile rendering ───────────────────────────────────────────────────────────
function drawTile(ctx: CanvasRenderingContext2D, t: Tile, sx: number, sy: number) {
  const T = TILE
  switch (t) {
    case 0: { // grass
      ctx.fillStyle = '#2a5c23'; ctx.fillRect(sx, sy, T, T)
      ctx.fillStyle = '#326b2a'
      ctx.fillRect(sx + 2, sy + 2, 4, 4)
      ctx.fillRect(sx + 20, sy + 18, 3, 3)
      ctx.fillRect(sx + 10, sy + 26, 4, 3)
      break
    }
    case 1: { // water
      ctx.fillStyle = '#1a6b9e'; ctx.fillRect(sx, sy, T, T)
      ctx.fillStyle = '#2277ab'
      ctx.fillRect(sx + 4, sy + 8, 14, 3)
      ctx.fillRect(sx + 2, sy + 20, 20, 3)
      break
    }
    case 2: { // stone path
      ctx.fillStyle = '#7a7272'; ctx.fillRect(sx, sy, T, T)
      ctx.fillStyle = '#6a6262'
      ctx.fillRect(sx, sy, 1, T); ctx.fillRect(sx, sy, T, 1)
      ctx.fillStyle = '#8a8282'
      ctx.fillRect(sx + 2, sy + 2, 12, 12)
      ctx.fillRect(sx + 16, sy + 16, 12, 12)
      break
    }
    case 3: { // tree
      ctx.fillStyle = '#1a3d0a'; ctx.fillRect(sx, sy, T, T)
      ctx.fillStyle = '#2a5a14'
      ctx.fillRect(sx + 4, sy + 2, 24, 20)
      ctx.fillRect(sx + 8, sy + 0, 16, 6)
      ctx.fillStyle = '#6a3a10'
      ctx.fillRect(sx + 12, sy + 20, 8, 12)
      ctx.fillStyle = '#3a7a20'
      ctx.fillRect(sx + 6, sy + 4, 8, 8)
      break
    }
    case 4: { // castle wall
      ctx.fillStyle = '#4a3a30'; ctx.fillRect(sx, sy, T, T)
      ctx.fillStyle = '#5a4a40'
      ctx.fillRect(sx + 2, sy + 2, 12, 12)
      ctx.fillRect(sx + 18, sy + 18, 12, 12)
      ctx.fillStyle = '#3a2a20'
      ctx.fillRect(sx + 14, sy, 4, T)
      ctx.fillRect(sx, sy + 14, T, 4)
      break
    }
    case 5: { // sand
      ctx.fillStyle = '#c4a340'; ctx.fillRect(sx, sy, T, T)
      ctx.fillStyle = '#d4b350'
      ctx.fillRect(sx + 6, sy + 6, 8, 4)
      ctx.fillRect(sx + 18, sy + 20, 8, 4)
      ctx.fillStyle = '#b49330'
      ctx.fillRect(sx + 2, sy + 24, 6, 3)
      break
    }
    case 6: { // flowers
      ctx.fillStyle = '#2a5c23'; ctx.fillRect(sx, sy, T, T)
      ctx.fillStyle = '#326b2a'
      ctx.fillRect(sx + 2, sy + 2, 4, 4)
      // flower dots
      ctx.fillStyle = '#e05090'; ctx.fillRect(sx + 8, sy + 10, 4, 4)
      ctx.fillStyle = '#f0d020'; ctx.fillRect(sx + 9, sy + 11, 2, 2)
      ctx.fillStyle = '#e05090'; ctx.fillRect(sx + 20, sy + 18, 4, 4)
      ctx.fillStyle = '#f0d020'; ctx.fillRect(sx + 21, sy + 19, 2, 2)
      break
    }
    case 7: { // castle floor
      ctx.fillStyle = '#6a6060'; ctx.fillRect(sx, sy, T, T)
      ctx.fillStyle = '#5a5050'
      ctx.fillRect(sx, sy, T, 1); ctx.fillRect(sx, sy, 1, T)
      ctx.fillStyle = '#7a7070'
      ctx.fillRect(sx + 2, sy + 2, 14, 14)
      ctx.fillRect(sx + 18, sy + 18, 12, 12)
      break
    }
  }
}

// ─── NPC data ─────────────────────────────────────────────────────────────────
const NPCS = [
  { tx: 19.5, ty: 6.5, name: 'ELDER', col: '#f0d080', msgs: [
    'Welcome hero! Slay monsters for $PIXEL!',
    'The dragon lurks in the southern desert.',
    'Skeletons haunt the castle. Be careful!',
    'Guild raids start at midnight. Join us!',
  ]},
  { tx: 26, ty: 8.5, name: 'MERCHANT', col: '#80f0d0', msgs: [
    'Buy potions! 10 gold each.',
    'I trade $PIXEL for rare items.',
    'Dragon scales fetch 500 gold each!',
    'Best prices in the realm, I swear!',
  ]},
  { tx: 13, ty: 8.5, name: 'GUARD', col: '#8080f0', msgs: [
    'Halt! State your business.',
    'Skeletons in the castle — be warned!',
    'Forest slimes are weak. Good practice.',
    'The desert dragons will end you. Run.',
  ]},
]

const FAKE_PLAYERS = [
  { name: 'DragonSlyr99', c: '#ff6060' },
  { name: 'MageKing', c: '#aa66ff' },
  { name: 'ShadowBlade', c: '#60ff80' },
  { name: 'IronShield', c: '#60d0ff' },
  { name: 'ArrowStorm', c: '#ffcc00' },
]
const FAKE_MSGS = [
  'Anyone want to raid the castle? 🏰',
  'LFG dragon fight! Need healer',
  'Just earned 150 $PIXEL! 💰',
  'WTS rare skeleton sword NFT',
  'Level 10 unlocked Dragon Zone!',
  'That skeleton nearly killed me lol',
  'Dragon drops 200g, totally worth it',
  'Guild recruiting! DM me',
  'Where are the slimes again?',
  'WASD to move, SPACE to attack btw',
]

// ─── Init helpers ─────────────────────────────────────────────────────────────
function mkPlayer(name: string, cls: string): Player {
  return {
    x: 19 * TILE + 4, y: 10 * TILE,
    hp: 100, maxHp: 100, mp: 50, maxMp: 50,
    level: 1, xp: 0, xpNext: 100,
    gold: 0, tokens: 0,
    dir: 'down', frame: 0, fTimer: 0,
    atkTimer: 0, invTimer: 0,
    moving: false, dead: false, respTimer: 0,
    name, cls,
  }
}

function mkEnemies(): Enemy[] {
  const list: Enemy[] = []
  let id = 0
  const add = (kind: EnemyKind, tx: number, ty: number, hp: number, xp: number, gold: number, tok: number) =>
    list.push({
      id: id++, kind, x: tx * TILE, y: ty * TILE,
      hp, maxHp: hp, dir: 'down', frame: 0, fTimer: 0,
      state: 'patrol', sTimer: Math.random() * 3,
      homeX: tx * TILE, homeY: ty * TILE,
      atkTimer: 0, xp, gold, tok,
      respTimer: 0,
    })

  // Slimes (forest)
  add('slime', 5, 15, 30, 15, 5, 1)
  add('slime', 9, 14, 30, 15, 5, 1)
  add('slime', 28, 15, 30, 15, 5, 1)
  add('slime', 36, 16, 30, 15, 5, 1)
  add('slime', 15, 14, 30, 15, 5, 1)
  add('slime', 24, 16, 30, 15, 5, 1)
  // Skeletons (castle)
  add('skeleton', 12, 2, 60, 35, 15, 3)
  add('skeleton', 16, 3, 60, 35, 15, 3)
  add('skeleton', 23, 2, 60, 35, 15, 3)
  add('skeleton', 27, 3, 60, 35, 15, 3)
  add('skeleton', 29, 2, 60, 35, 15, 3)
  // Dragons (desert)
  add('dragon', 15, 26, 200, 150, 100, 20)
  add('dragon', 31, 27, 200, 150, 100, 20)

  return list
}

// ─── Component ────────────────────────────────────────────────────────────────
interface Props {
  playerName: string
  playerClass: string
}

export default function GameCanvas({ playerName, playerClass }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gsRef = useRef<GS | null>(null)
  const rafRef = useRef<number>(0)

  const initGS = useCallback((): GS => ({
    p: mkPlayer(playerName || 'HERO', playerClass || 'warrior'),
    enemies: mkEnemies(),
    dmg: [], parts: [],
    chat: [
      { name: 'SYSTEM', text: 'Welcome to PixelRealms! WASD=move SPACE=attack', c: '#f0d020', age: 0 },
      { name: 'SYSTEM', text: 'Click on enemies to attack them too!', c: '#f0d020', age: 1 },
    ],
    keys: new Set(),
    camX: 19 * TILE - CW / 2,
    camY: 10 * TILE - CH / 2,
    lastTs: 0,
    chatTimer: 4,
    npcBubble: null,
    paused: false,
    attackPressed: false,
  }), [playerName, playerClass])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
    if (!ctx) return
    ctx.imageSmoothingEnabled = false

    const gs = initGS()
    gsRef.current = gs

    // ── Input ────────────────────────────────────────────────────────────────
    const onKey = (e: KeyboardEvent) => {
      if (e.type === 'keydown') gs.keys.add(e.code)
      else gs.keys.delete(e.code)
      if (e.code === 'Space' && e.type === 'keydown') {
        e.preventDefault()
        gs.attackPressed = true
      }
    }
    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      const wx = sx + gs.camX, wy = sy + gs.camY
      // Find nearest enemy near click
      let best: Enemy | null = null, bestD = 80 * 80
      for (const en of gs.enemies) {
        if (en.state === 'dead') continue
        const d = dist2(wx, wy, en.x + 14, en.y + 14)
        if (d < bestD) { bestD = d; best = en }
      }
      if (best) {
        // Also do attack if clicked an enemy
        gs.attackPressed = true
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    canvas.addEventListener('click', onClick)

    // ── Particles helper ─────────────────────────────────────────────────────
    function spawnParticles(x: number, y: number, c: string, n = 6) {
      for (let i = 0; i < n; i++) {
        gs.parts.push({
          x, y,
          vx: (Math.random() - 0.5) * 4,
          vy: -Math.random() * 4 - 1,
          c, t: 1, s: Math.random() * 4 + 2,
        })
      }
    }

    // ── Attack helper ─────────────────────────────────────────────────────────
    function doPlayerAttack() {
      if (gs.p.atkTimer > 0 || gs.p.dead) return
      const { p } = gs
      const atk = p.cls === 'warrior' ? 25 : p.cls === 'mage' ? 35 : p.cls === 'rogue' ? 20 : 18
      const range = p.cls === 'mage' ? 120 : p.cls === 'archer' ? 160 : 70
      let hit = false
      for (const en of gs.enemies) {
        if (en.state === 'dead') continue
        const d2 = dist2(p.x + PW / 2, p.y + PH / 2, en.x + 14, en.y + 14)
        if (d2 < range * range) {
          const dmg = atk + Math.floor(Math.random() * 10)
          en.hp -= dmg
          gs.dmg.push({ x: en.x + 8, y: en.y - 8, v: dmg, c: '#ff4444', t: 1 })
          spawnParticles(en.x + 14, en.y + 14, '#ff4444', 4)
          hit = true
          if (en.hp <= 0) {
            en.state = 'dead'; en.respTimer = 15
            spawnParticles(en.x + 14, en.y + 14, '#ffcc00', 10)
            // Rewards
            p.xp += en.xp; p.gold += en.gold; p.tokens += en.tok
            gs.dmg.push({ x: en.x, y: en.y - 24, v: en.xp, c: '#f0d020', t: 1.5 })
            // Level up?
            while (p.xp >= p.xpNext) {
              p.xp -= p.xpNext; p.level++; p.xpNext = Math.floor(p.xpNext * 1.6)
              p.maxHp += 20; p.hp = p.maxHp; p.maxMp += 10; p.mp = p.maxMp
              gs.dmg.push({ x: p.x + 4, y: p.y - 20, v: 0, c: '#ffffff', t: 2.5 })
              gs.chat.push({ name: 'SYSTEM', text: `${p.name} reached Level ${p.level}! 🎉`, c: '#f0d020', age: 0 })
            }
          }
        }
      }
      if (hit || true) {
        gs.p.atkTimer = p.cls === 'warrior' ? 0.5 : p.cls === 'mage' ? 1.0 : p.cls === 'rogue' ? 0.35 : 0.7
      }
    }

    // ── Game loop ─────────────────────────────────────────────────────────────
    function update(dt: number) {
      if (gs.paused) return
      const { p, enemies } = gs
      dt = Math.min(dt, 0.05)

      // Player respawn
      if (p.dead) {
        p.respTimer -= dt
        if (p.respTimer <= 0) {
          p.dead = false; p.hp = p.maxHp; p.mp = Math.floor(p.maxMp * 0.5)
          p.x = 19 * TILE + 4; p.y = 10 * TILE
        }
        return
      }

      // Player timers
      p.atkTimer = Math.max(0, p.atkTimer - dt)
      p.invTimer = Math.max(0, p.invTimer - dt)
      if (p.mp < p.maxMp) p.mp = Math.min(p.maxMp, p.mp + dt * 5)

      // Attack
      if (gs.attackPressed) { doPlayerAttack(); gs.attackPressed = false }

      // Movement
      let dx = 0, dy = 0
      if (gs.keys.has('KeyW') || gs.keys.has('ArrowUp')) dy -= PSPEED
      if (gs.keys.has('KeyS') || gs.keys.has('ArrowDown')) dy += PSPEED
      if (gs.keys.has('KeyA') || gs.keys.has('ArrowLeft')) dx -= PSPEED
      if (gs.keys.has('KeyD') || gs.keys.has('ArrowRight')) dx += PSPEED
      if (dx && dy) { dx *= 0.707; dy *= 0.707 }

      p.moving = dx !== 0 || dy !== 0
      if (p.moving) {
        if (Math.abs(dx) > Math.abs(dy)) p.dir = dx > 0 ? 'right' : 'left'
        else p.dir = dy > 0 ? 'down' : 'up'
      }

      // Apply movement with collision
      const nx = p.x + dx, ny = p.y + dy
      if (canMove(nx, p.y, PW, PH)) p.x = clamp(nx, TILE * 2, (WW - 2) * TILE - PW)
      if (canMove(p.x, ny, PW, PH)) p.y = clamp(ny, 0, (WH - 1) * TILE - PH)

      // Animate
      if (p.moving) {
        p.fTimer += dt
        if (p.fTimer > 0.2) { p.fTimer = 0; p.frame = (p.frame + 1) % 2 }
      } else {
        p.frame = 0; p.fTimer = 0
      }

      // NPC proximity check
      gs.npcBubble = null
      for (let i = 0; i < NPCS.length; i++) {
        const n = NPCS[i]
        const d2 = dist2(p.x + PW / 2, p.y + PH / 2, n.tx * TILE + 16, n.ty * TILE + 16)
        if (d2 < 64 * 64) {
          const msgIdx = Math.floor(Date.now() / 4000) % n.msgs.length
          gs.npcBubble = { idx: i, msg: n.msgs[msgIdx], t: 1 }
        }
      }

      // Enemy AI
      for (const en of enemies) {
        if (en.state === 'dead') {
          en.respTimer -= dt
          if (en.respTimer <= 0) {
            en.state = 'patrol'; en.hp = en.maxHp
            en.x = en.homeX; en.y = en.homeY
          }
          continue
        }

        en.atkTimer = Math.max(0, en.atkTimer - dt)
        en.sTimer -= dt
        const d2 = dist2(p.x + PW / 2, p.y + PH / 2, en.x + 14, en.y + 14)
        const aggroRange = en.kind === 'dragon' ? 200 : en.kind === 'skeleton' ? 150 : 120
        const atkRange = en.kind === 'dragon' ? 60 : 48

        if (en.state === 'patrol') {
          if (en.sTimer <= 0) {
            en.sTimer = 1.5 + Math.random() * 2
            // random walk
            const dirs: Dir[] = ['up', 'down', 'left', 'right']
            en.dir = dirs[Math.floor(Math.random() * 4)]
          }
          if (!p.dead && d2 < aggroRange * aggroRange) en.state = 'chase'
          // Move slowly
          const speed = en.kind === 'slime' ? 0.8 : en.kind === 'dragon' ? 1.5 : 1.2
          const ddx = en.dir === 'right' ? speed : en.dir === 'left' ? -speed : 0
          const ddy = en.dir === 'down' ? speed : en.dir === 'up' ? -speed : 0
          if (canMove(en.x + ddx, en.y + ddy, PW, PH)) { en.x += ddx; en.y += ddy }
          // Stay near home
          if (dist2(en.x, en.y, en.homeX, en.homeY) > 96 * 96) {
            en.state = 'patrol'; en.sTimer = 0
          }
        } else if (en.state === 'chase') {
          if (p.dead || d2 > (aggroRange * 1.5) ** 2) { en.state = 'patrol'; continue }
          if (d2 < atkRange * atkRange) { en.state = 'attack'; en.sTimer = 0.5; continue }
          // Move toward player
          const speed = en.kind === 'slime' ? 1.2 : en.kind === 'dragon' ? 2 : 1.8
          const angle = Math.atan2(p.y - en.y, p.x - en.x)
          const edx = Math.cos(angle) * speed, edy = Math.sin(angle) * speed
          if (canMove(en.x + edx, en.y, PW, PH)) en.x += edx
          if (canMove(en.x, en.y + edy, PW, PH)) en.y += edy
          if (Math.abs(edx) > Math.abs(edy)) en.dir = edx > 0 ? 'right' : 'left'
          else en.dir = edy > 0 ? 'down' : 'up'
          // Animate
          en.fTimer += dt
          if (en.fTimer > 0.25) { en.fTimer = 0; en.frame = (en.frame + 1) % 2 }
        } else if (en.state === 'attack') {
          if (d2 > atkRange * atkRange * 4) { en.state = 'chase'; continue }
          en.sTimer -= dt
          if (en.sTimer <= 0 && en.atkTimer === 0) {
            en.sTimer = en.kind === 'dragon' ? 1.8 : 1.2
            if (!p.dead && p.invTimer === 0) {
              const dmg = en.kind === 'dragon' ? 35 : en.kind === 'skeleton' ? 18 : 10
              const actualDmg = Math.max(0, dmg - (p.level - 1) * 2)
              p.hp -= actualDmg
              p.invTimer = 0.8
              gs.dmg.push({ x: p.x, y: p.y - 10, v: actualDmg, c: '#ff8800', t: 1 })
              spawnParticles(p.x + PW / 2, p.y + PH / 2, '#ff4444', 3)
              if (p.hp <= 0) {
                p.dead = true; p.hp = 0; p.respTimer = 5
                gs.chat.push({ name: 'SYSTEM', text: 'You died! Respawning in 5s...', c: '#ff4444', age: 0 })
              }
            }
            en.atkTimer = 0.3
          }
          en.frame = en.sTimer < 0.3 ? 1 : 0
        }
      }

      // Damage numbers
      gs.dmg = gs.dmg.filter(d => { d.t -= dt * 0.8; return d.t > 0 })
      // Particles
      gs.parts = gs.parts.filter(pt => {
        pt.x += pt.vx; pt.y += pt.vy; pt.vy += 0.15; pt.t -= dt * 1.5
        return pt.t > 0
      })
      // Chat age
      gs.chat = gs.chat.filter(c => { c.age += dt; return c.age < 8 })
      gs.chatTimer -= dt
      if (gs.chatTimer <= 0) {
        gs.chatTimer = 5 + Math.random() * 6
        const fp = FAKE_PLAYERS[Math.floor(Math.random() * FAKE_PLAYERS.length)]
        const msg = FAKE_MSGS[Math.floor(Math.random() * FAKE_MSGS.length)]
        gs.chat.push({ name: fp.name, text: msg, c: fp.c, age: 0 })
        if (gs.chat.length > 6) gs.chat = gs.chat.slice(-6)
      }

      // Camera
      const targetCamX = p.x - CW / 2 + PW / 2
      const targetCamY = p.y - CH / 2 + PH / 2
      gs.camX = lerp(gs.camX, targetCamX, 0.1)
      gs.camY = lerp(gs.camY, targetCamY, 0.1)
      gs.camX = clamp(gs.camX, 0, WW * TILE - CW)
      gs.camY = clamp(gs.camY, 0, WH * TILE - CH)
    }

    function render() {
      const { p, enemies, dmg, parts, chat, camX, camY, npcBubble } = gs

      // Clear
      ctx.fillStyle = '#0a0a1e'
      ctx.fillRect(0, 0, CW, CH)

      // ── Draw tiles ─────────────────────────────────────────────────────────
      const startTX = Math.max(0, Math.floor(camX / TILE))
      const endTX = Math.min(WW, Math.ceil((camX + CW) / TILE) + 1)
      const startTY = Math.max(0, Math.floor(camY / TILE))
      const endTY = Math.min(WH, Math.ceil((camY + CH) / TILE) + 1)

      for (let ty = startTY; ty < endTY; ty++) {
        for (let tx = startTX; tx < endTX; tx++) {
          drawTile(ctx, MAP[ty][tx], tx * TILE - camX, ty * TILE - camY)
        }
      }

      // ── Draw NPCs ──────────────────────────────────────────────────────────
      for (const n of NPCS) {
        const sx = n.tx * TILE - camX, sy = n.ty * TILE - camY
        dr(ctx, npcSprite(n.col), sx, sy)
        // Name tag
        ctx.fillStyle = 'rgba(0,0,0,0.6)'
        ctx.fillRect(sx - 8, sy - 16, n.name.length * 6 + 16, 14)
        ctx.fillStyle = n.col
        ctx.font = '9px "Press Start 2P", monospace'
        ctx.fillText(n.name, sx, sy - 5)
      }

      // ── Draw enemies ───────────────────────────────────────────────────────
      for (const en of enemies) {
        if (en.state === 'dead') continue
        const sx = en.x - camX, sy = en.y - camY
        if (sx < -50 || sx > CW + 50 || sy < -50 || sy > CH + 50) continue

        const sprite = en.kind === 'slime' ? slimeSprite(en.frame)
          : en.kind === 'skeleton' ? skeletonSprite(en.frame)
          : dragonSprite(en.frame)
        dr(ctx, sprite, sx, sy)

        // HP bar
        const bw = en.kind === 'dragon' ? 44 : 28
        const bx = sx + (en.kind === 'dragon' ? -4 : -2)
        const by = sy - 8
        ctx.fillStyle = '#300'; ctx.fillRect(bx, by, bw, 5)
        ctx.fillStyle = en.hp / en.maxHp > 0.5 ? '#0f0' : en.hp / en.maxHp > 0.25 ? '#ff0' : '#f00'
        ctx.fillRect(bx, by, Math.round(bw * en.hp / en.maxHp), 5)
        ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.strokeRect(bx, by, bw, 5)
      }

      // ── Draw player ────────────────────────────────────────────────────────
      if (!p.dead) {
        const sx = p.x - camX, sy = p.y - camY
        // Flash when invincible
        if (p.invTimer > 0 && Math.floor(p.invTimer * 10) % 2 === 0) {
          ctx.globalAlpha = 0.4
        }
        dr(ctx, playerSprite(p.cls, p.dir, p.frame), sx, sy)
        ctx.globalAlpha = 1

        // Name above player
        ctx.fillStyle = 'rgba(0,0,0,0.65)'
        const nw = p.name.length * 6 + 12
        ctx.fillRect(sx + PW / 2 - nw / 2, sy - 16, nw, 13)
        ctx.fillStyle = '#f0d020'
        ctx.font = '8px "Press Start 2P", monospace'
        ctx.textAlign = 'center'
        ctx.fillText(p.name, sx + PW / 2, sy - 5)
        ctx.textAlign = 'left'

        // Attack range indicator (subtle)
        if (p.atkTimer > 0) {
          const range = p.cls === 'mage' ? 120 : p.cls === 'archer' ? 160 : 70
          ctx.strokeStyle = 'rgba(255,200,0,0.2)'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.arc(sx + PW / 2, sy + PH / 2, range, 0, Math.PI * 2)
          ctx.stroke()
        }
      }

      // ── NPC bubble ────────────────────────────────────────────────────────
      if (npcBubble) {
        const n = NPCS[npcBubble.idx]
        const bx = n.tx * TILE - camX - 60
        const by = n.ty * TILE - camY - 40
        const msg = npcBubble.msg
        const bw = Math.min(msg.length * 6, 200) + 16
        ctx.fillStyle = 'rgba(0,0,0,0.85)'
        ctx.fillRect(bx, by, bw, 30)
        ctx.strokeStyle = n.col; ctx.lineWidth = 1
        ctx.strokeRect(bx, by, bw, 30)
        ctx.fillStyle = n.col
        ctx.font = '7px monospace'
        // Word-wrap simple version
        const words = msg.split(' ')
        let line = '', ly = by + 12
        for (const w of words) {
          if ((line + w).length * 6 > bw - 8) { ctx.fillText(line, bx + 6, ly); line = ''; ly += 11 }
          line += (line ? ' ' : '') + w
        }
        ctx.fillText(line, bx + 6, ly)
      }

      // ── Damage numbers ────────────────────────────────────────────────────
      for (const d of dmg) {
        const alpha = Math.min(1, d.t * 1.5)
        ctx.globalAlpha = alpha
        ctx.fillStyle = d.c
        const text = d.v === 0 ? 'LEVEL UP!' : `${d.v}`
        const fsize = d.v === 0 ? 10 : d.v > 50 ? 14 : 11
        ctx.font = `bold ${fsize}px "Press Start 2P", monospace`
        ctx.fillText(text, d.x - camX, d.y - camY - (1 - d.t) * 30)
        ctx.globalAlpha = 1
      }

      // ── Particles ─────────────────────────────────────────────────────────
      for (const pt of parts) {
        ctx.globalAlpha = pt.t
        ctx.fillStyle = pt.c
        ctx.fillRect(pt.x - camX, pt.y - camY, pt.s, pt.s)
      }
      ctx.globalAlpha = 1

      // ── HUD ───────────────────────────────────────────────────────────────
      drawHUD(ctx, gs)

      // ── Minimap ───────────────────────────────────────────────────────────
      drawMinimap(ctx, gs)

      // ── Death overlay ─────────────────────────────────────────────────────
      if (p.dead) {
        ctx.fillStyle = 'rgba(180,0,0,0.35)'
        ctx.fillRect(0, 0, CW, CH)
        ctx.fillStyle = '#ff4444'
        ctx.font = '20px "Press Start 2P", monospace'
        ctx.textAlign = 'center'
        ctx.fillText('YOU DIED', CW / 2, CH / 2 - 20)
        ctx.font = '10px "Press Start 2P", monospace'
        ctx.fillStyle = '#ffaaaa'
        ctx.fillText(`Respawning in ${Math.ceil(p.respTimer)}s...`, CW / 2, CH / 2 + 10)
        ctx.textAlign = 'left'
      }
    }

    function drawHUD(ctx: CanvasRenderingContext2D, gs: GS) {
      const { p } = gs
      const pad = 10

      // HP bar
      const barW = 160, barH = 14
      ctx.fillStyle = 'rgba(0,0,0,0.7)'
      ctx.fillRect(pad, pad, barW + 80, 80)
      ctx.strokeStyle = '#9333ea'; ctx.lineWidth = 1
      ctx.strokeRect(pad, pad, barW + 80, 80)

      ctx.fillStyle = '#f0d020'
      ctx.font = '8px "Press Start 2P", monospace'
      ctx.fillText(`LV.${p.level} ${p.name}`, pad + 6, pad + 16)

      // HP
      ctx.fillStyle = '#300'; ctx.fillRect(pad + 6, pad + 22, barW, barH)
      ctx.fillStyle = p.hp / p.maxHp > 0.5 ? '#22cc44' : p.hp / p.maxHp > 0.25 ? '#ddaa00' : '#cc2222'
      ctx.fillRect(pad + 6, pad + 22, Math.round(barW * p.hp / p.maxHp), barH)
      ctx.strokeStyle = '#555'; ctx.strokeRect(pad + 6, pad + 22, barW, barH)
      ctx.fillStyle = '#fff'; ctx.font = '7px monospace'
      ctx.fillText(`HP ${p.hp}/${p.maxHp}`, pad + 10, pad + 33)

      // MP
      ctx.fillStyle = '#003'; ctx.fillRect(pad + 6, pad + 40, barW, barH)
      ctx.fillStyle = '#2266ee'
      ctx.fillRect(pad + 6, pad + 40, Math.round(barW * p.mp / p.maxMp), barH)
      ctx.strokeStyle = '#555'; ctx.strokeRect(pad + 6, pad + 40, barW, barH)
      ctx.fillStyle = '#fff'
      ctx.fillText(`MP ${Math.floor(p.mp)}/${p.maxMp}`, pad + 10, pad + 51)

      // XP
      ctx.fillStyle = '#220'; ctx.fillRect(pad + 6, pad + 58, barW, barH)
      ctx.fillStyle = '#aaaa00'
      ctx.fillRect(pad + 6, pad + 58, Math.round(barW * p.xp / p.xpNext), barH)
      ctx.strokeStyle = '#555'; ctx.strokeRect(pad + 6, pad + 58, barW, barH)
      ctx.fillStyle = '#fff'
      ctx.fillText(`XP ${p.xp}/${p.xpNext}`, pad + 10, pad + 69)

      // Gold & tokens
      ctx.fillStyle = '#f0d020'; ctx.font = '8px "Press Start 2P", monospace'
      ctx.fillText(`${p.gold}G`, pad + 172, pad + 34)
      ctx.fillStyle = '#9333ea'
      ctx.fillText(`${p.tokens}$PIX`, pad + 172, pad + 55)

      // Chat box
      const chatX = pad, chatY = CH - 120
      ctx.fillStyle = 'rgba(0,0,0,0.65)'
      ctx.fillRect(chatX, chatY, 300, 115)
      ctx.strokeStyle = '#9333ea'; ctx.lineWidth = 1
      ctx.strokeRect(chatX, chatY, 300, 115)
      ctx.font = '7px monospace'
      const shown = gs.chat.slice(-7)
      for (let i = 0; i < shown.length; i++) {
        const m = shown[i]
        const alpha = Math.min(1, (8 - m.age) / 3)
        ctx.globalAlpha = alpha
        ctx.fillStyle = m.c
        ctx.fillText(`[${m.name}]`, chatX + 6, chatY + 14 + i * 14)
        ctx.fillStyle = '#ddd'
        ctx.fillText(m.text.slice(0, 34), chatX + 6 + (m.name.length + 2) * 5, chatY + 14 + i * 14)
      }
      ctx.globalAlpha = 1

      // Controls hint
      ctx.fillStyle = 'rgba(0,0,0,0.5)'
      ctx.fillRect(CW - 220, CH - 28, 220, 24)
      ctx.fillStyle = '#888'; ctx.font = '7px monospace'
      ctx.fillText('WASD: Move  |  SPACE/Click: Attack', CW - 216, CH - 12)
    }

    function drawMinimap(ctx: CanvasRenderingContext2D, gs: GS) {
      const MW = 100, MH = 60
      const mx = CW - MW - 10, my = 10
      const scaleX = MW / (WW * TILE), scaleY = MH / (WH * TILE)

      ctx.fillStyle = 'rgba(0,0,0,0.75)'
      ctx.fillRect(mx, my, MW, MH)

      // Tiles
      for (let ty = 0; ty < WH; ty++) {
        for (let tx = 0; tx < WW; tx++) {
          const t = MAP[ty][tx]
          ctx.fillStyle =
            t === 1 ? '#1a6b9e' : t === 3 ? '#1a3d0a' : t === 4 ? '#4a3a30'
            : t === 5 ? '#c4a340' : t === 7 ? '#6a6060' : '#2a5c23'
          ctx.fillRect(mx + tx * scaleX * TILE, my + ty * scaleY * TILE, Math.max(1, scaleX * TILE), Math.max(1, scaleY * TILE))
        }
      }

      // Enemies
      for (const en of gs.enemies) {
        if (en.state === 'dead') continue
        ctx.fillStyle = en.kind === 'dragon' ? '#ff2222' : en.kind === 'skeleton' ? '#ddddaa' : '#22cc44'
        ctx.fillRect(mx + en.x * scaleX, my + en.y * scaleY, 3, 3)
      }

      // Player
      if (!gs.p.dead) {
        ctx.fillStyle = '#f0d020'
        ctx.fillRect(mx + gs.p.x * scaleX - 2, my + gs.p.y * scaleY - 2, 4, 4)
      }

      // Viewport rect
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1
      ctx.strokeRect(mx + gs.camX * scaleX, my + gs.camY * scaleY, CW * scaleX, CH * scaleY)

      // Border
      ctx.strokeStyle = '#9333ea'; ctx.lineWidth = 1
      ctx.strokeRect(mx, my, MW, MH)
      ctx.fillStyle = '#f0d020'; ctx.font = '6px monospace'
      ctx.fillText('MAP', mx + 2, my + 8)
    }

    // ── Main loop ─────────────────────────────────────────────────────────────
    function loop(ts: number) {
      const dt = gs.lastTs ? (ts - gs.lastTs) / 1000 : 0
      gs.lastTs = ts
      update(dt)
      render()
      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
      canvas.removeEventListener('click', onClick)
    }
  }, [initGS])

  return (
    <canvas
      ref={canvasRef}
      width={CW}
      height={CH}
      className="block w-full"
      style={{ imageRendering: 'pixelated', cursor: 'crosshair', maxWidth: CW }}
    />
  )
}

// TypeScript: GS needs to be declared
interface GS {
  p: Player
  enemies: Enemy[]
  dmg: DmgNum[]
  parts: Particle[]
  chat: ChatMsg[]
  keys: Set<string>
  camX: number; camY: number
  lastTs: number
  chatTimer: number
  npcBubble: { idx: number; msg: string; t: number } | null
  paused: boolean
  attackPressed: boolean
}
