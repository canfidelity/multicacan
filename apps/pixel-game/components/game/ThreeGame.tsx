'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

// ── Constants ──────────────────────────────────────────────────────────────────
const CW = 800, CH = 520
const WW = 50, WH = 30
const PSPEED = 4.5
const PW = 0.7, PH = 1.0
const CAM_D = 9

// ── Map ────────────────────────────────────────────────────────────────────────
type Tile = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7
const SOLID_TILES = new Set<Tile>([1, 3, 4])

function buildMap(): Tile[][] {
  const m: Tile[][] = Array.from({ length: WH }, () => Array(WW).fill(0) as Tile[])
  for (let y = 0; y < WH; y++) { m[y][0] = 1; m[y][1] = 1 }
  for (let y = 4; y < 22; y++) { m[y][48] = 1; m[y][49] = 1 }
  for (let x = 8; x < 32; x++) { m[0][x] = 4; m[1][x] = 4 }
  for (let y = 0; y < 5; y++) for (let x = 9; x < 31; x++) m[y][x] = 7
  for (let y = 0; y < 5; y++) { m[y][8] = 4; m[y][9] = 4; m[y][30] = 4; m[y][31] = 4 }
  for (let y = 3; y < 5; y++) for (let x = 18; x < 22; x++) m[y][x] = 7
  for (let y = 4; y < 12; y++) { m[y][19] = 2; m[y][20] = 2 }
  for (let x = 5; x < 42; x++) m[8][x] = 2
  for (let y = 5; y < 14; y++) { m[y][10] = 2; m[y][34] = 2 }
  for (let y = 13; y < 18; y++) {
    for (let x = 2; x < WW - 2; x++)
      if (m[y][x] === 0 && (x * 7 + y * 3) % 5 < 3) m[y][x] = 3
    for (let x = 18; x < 22; x++) m[y][x] = 0
    m[y][10] = 0; m[y][34] = 0
  }
  for (let y = 23; y < WH; y++) for (let x = 2; x < WW - 2; x++) m[y][x] = 5
  for (let y = 5; y < 13; y++)
    for (let x = 2; x < WW - 2; x++)
      if (m[y][x] === 0 && (x * 13 + y * 7) % 11 === 0) m[y][x] = 6
  for (let y = 18; y < 23; y++)
    for (let x = 2; x < WW - 2; x++)
      if (m[y][x] === 0 && (x * 11 + y * 5) % 9 === 0) m[y][x] = 6
  return m
}
const MAP = buildMap()

// ── Helpers ────────────────────────────────────────────────────────────────────
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const dist2 = (ax: number, ay: number, bx: number, by: number) => (ax - bx) ** 2 + (ay - by) ** 2

function solidAt(tx: number, ty: number): boolean {
  const ix = Math.floor(tx), iy = Math.floor(ty)
  if (ix < 0 || iy < 0 || ix >= WW || iy >= WH) return true
  return SOLID_TILES.has(MAP[iy][ix])
}
function canMove(x: number, y: number, w: number, h: number): boolean {
  const m = 0.1
  return !solidAt(x + m, y + m) && !solidAt(x + w - m, y + m) &&
    !solidAt(x + m, y + h - m) && !solidAt(x + w - m, y + h - m)
}

// ── Types ──────────────────────────────────────────────────────────────────────
type Dir = 'up' | 'down' | 'left' | 'right'
type EnemyKind = 'slime' | 'skeleton' | 'dragon'

interface Player {
  x: number; y: number
  hp: number; maxHp: number; mp: number; maxMp: number
  level: number; xp: number; xpNext: number
  gold: number; tokens: number
  dir: Dir; frame: number; fTimer: number
  atkTimer: number; invTimer: number
  moving: boolean; dead: boolean; respTimer: number
  name: string; cls: string
}
interface Enemy {
  id: number; kind: EnemyKind; x: number; y: number
  hp: number; maxHp: number; dir: Dir; frame: number; fTimer: number
  state: 'patrol' | 'chase' | 'attack' | 'dead'
  sTimer: number; homeX: number; homeY: number
  atkTimer: number; xp: number; gold: number; tok: number; respTimer: number
}
interface DmgNum {
  id: number; x: number; y: number; z: number; v: number; c: string; t: number
  screen?: { x: number; y: number }
}
interface ChatMsg { name: string; text: string; c: string; age: number }
interface HudState {
  hp: number; maxHp: number; mp: number; maxMp: number
  xp: number; xpNext: number; level: number
  gold: number; tokens: number; chat: ChatMsg[]
  dead: boolean; respTimer: number; dmg: DmgNum[]
  npcMsg: string | null
}
interface GS {
  p: Player; enemies: Enemy[]; dmg: DmgNum[]; chat: ChatMsg[]
  keys: Set<string>; camX: number; camY: number; lastTs: number
  chatTimer: number; npcBubble: { idx: number } | null
  attackPressed: boolean; dmgId: number
}

// ── Data ───────────────────────────────────────────────────────────────────────
const NPCS = [
  { tx: 19.5, ty: 6.5, name: 'ELDER', col: 0xf0d080, colStr: '#f0d080', msgs: ['Welcome hero! Slay monsters for $PIXEL!', 'Dragon lurks in the southern desert.', 'Skeletons haunt the castle. Be careful!', 'Guild raids start at midnight!'] },
  { tx: 26, ty: 8.5, name: 'MERCHANT', col: 0x80f0d0, colStr: '#80f0d0', msgs: ['Buy potions! 10 gold each.', 'I trade $PIXEL for rare items.', 'Dragon scales fetch 500 gold!', 'Best prices in the realm!'] },
  { tx: 13, ty: 8.5, name: 'GUARD', col: 0x8080f0, colStr: '#8080f0', msgs: ['Halt! State your business.', 'Skeletons in castle — be warned!', 'Forest slimes are weak. Good practice.', 'Desert dragons will end you.'] },
]
const FAKE_PLAYERS = [
  { name: 'DragonSlyr99', c: '#ff6060' }, { name: 'MageKing', c: '#aa66ff' },
  { name: 'ShadowBlade', c: '#60ff80' }, { name: 'IronShield', c: '#60d0ff' },
]
const FAKE_MSGS = [
  'Anyone want to raid the castle? 🏰', 'LFG dragon fight! Need healer',
  'Just earned 150 $PIXEL! 💰', 'WTS rare skeleton sword NFT',
  'Level 10 unlocked Dragon Zone!', 'Dragon drops 200g, totally worth it',
  'Guild recruiting! DM me', 'WASD to move, SPACE to attack btw',
]

// ── Init ───────────────────────────────────────────────────────────────────────
function mkPlayer(name: string, cls: string): Player {
  return {
    x: 19.5, y: 10.5, hp: 100, maxHp: 100, mp: 50, maxMp: 50,
    level: 1, xp: 0, xpNext: 100, gold: 0, tokens: 0,
    dir: 'down', frame: 0, fTimer: 0, atkTimer: 0, invTimer: 0,
    moving: false, dead: false, respTimer: 0, name, cls,
  }
}
function mkEnemies(): Enemy[] {
  const list: Enemy[] = []; let id = 0
  const add = (kind: EnemyKind, tx: number, ty: number, hp: number, xp: number, gold: number, tok: number) =>
    list.push({ id: id++, kind, x: tx + 0.5, y: ty + 0.5, hp, maxHp: hp, dir: 'down', frame: 0, fTimer: 0, state: 'patrol', sTimer: Math.random() * 3, homeX: tx + 0.5, homeY: ty + 0.5, atkTimer: 0, xp, gold, tok, respTimer: 0 })
  add('slime', 5, 15, 30, 15, 5, 1); add('slime', 9, 14, 30, 15, 5, 1)
  add('slime', 28, 15, 30, 15, 5, 1); add('slime', 36, 16, 30, 15, 5, 1)
  add('slime', 15, 14, 30, 15, 5, 1); add('slime', 24, 16, 30, 15, 5, 1)
  add('skeleton', 12, 2, 60, 35, 15, 3); add('skeleton', 16, 3, 60, 35, 15, 3)
  add('skeleton', 23, 2, 60, 35, 15, 3); add('skeleton', 27, 3, 60, 35, 15, 3)
  add('skeleton', 29, 2, 60, 35, 15, 3)
  add('dragon', 15, 26, 200, 150, 100, 20); add('dragon', 31, 27, 200, 150, 100, 20)
  return list
}

// ── THREE.js builders ──────────────────────────────────────────────────────────
function lmat(color: number, emissive = 0, emInt = 0): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ color })
  if (emissive) { m.emissive.setHex(emissive); m.emissiveIntensity = emInt }
  return m
}

function buildWorldMeshes(scene: THREE.Scene): void {
  // Ground plane base
  const gnd = new THREE.Mesh(new THREE.PlaneGeometry(WW, WH), lmat(0x2a5a23))
  gnd.rotation.x = -Math.PI / 2; gnd.position.set(WW / 2, 0, WH / 2)
  scene.add(gnd)

  // Count per type
  const cnt: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 }
  for (let ty = 0; ty < WH; ty++) for (let tx = 0; tx < WW; tx++) cnt[MAP[ty][tx]]++

  const geoFlat = new THREE.BoxGeometry(1, 0.22, 1)
  const geoWall = new THREE.BoxGeometry(1, 2.2, 1)
  const geoTrunk = new THREE.BoxGeometry(0.22, 1.6, 0.22)
  const geoCanopy = new THREE.BoxGeometry(0.92, 0.85, 0.92)

  const flatMats: Record<number, THREE.MeshLambertMaterial> = {
    0: lmat(0x3a7a2a),
    1: lmat(0x1a6b9e, 0x0a3060, 0.4),
    2: lmat(0x7a7272),
    5: lmat(0xc4a340),
    6: lmat(0x3a8a3a),
    7: lmat(0x6a6060),
  }

  const flatTypes = [0, 1, 2, 5, 6, 7] as const
  const flatMeshes = new Map<number, THREE.InstancedMesh>()
  for (const t of flatTypes) {
    if (cnt[t] > 0) {
      const im = new THREE.InstancedMesh(geoFlat, flatMats[t], cnt[t])
      flatMeshes.set(t, im); scene.add(im)
    }
  }
  const wallMesh = cnt[4] > 0 ? new THREE.InstancedMesh(geoWall, lmat(0x4a3a30), cnt[4]) : null
  if (wallMesh) scene.add(wallMesh)
  const trunkMesh = cnt[3] > 0 ? new THREE.InstancedMesh(geoTrunk, lmat(0x6a3a10), cnt[3]) : null
  const canopyMesh = cnt[3] > 0 ? new THREE.InstancedMesh(geoCanopy, lmat(0x1a6a14), cnt[3]) : null
  if (trunkMesh) scene.add(trunkMesh)
  if (canopyMesh) scene.add(canopyMesh)
  const flowerMesh = cnt[6] > 0 ? new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), lmat(0xe05090), cnt[6]) : null
  if (flowerMesh) scene.add(flowerMesh)

  const dummy = new THREE.Object3D()
  const idx = new Map<number, number>(flatTypes.map(t => [t, 0]))
  let wallIdx = 0, treeIdx = 0, flowerIdx = 0

  for (let ty = 0; ty < WH; ty++) {
    for (let tx = 0; tx < WW; tx++) {
      const t = MAP[ty][tx]
      const px = tx + 0.5, pz = ty + 0.5
      if (flatTypes.includes(t as typeof flatTypes[number])) {
        dummy.position.set(px, 0.11, pz); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        flatMeshes.get(t)!.setMatrixAt(idx.get(t)!, dummy.matrix)
        idx.set(t, idx.get(t)! + 1)
        if (t === 6 && flowerMesh) {
          dummy.position.set(px + (Math.random() - 0.5) * 0.3, 0.31, pz + (Math.random() - 0.5) * 0.3)
          dummy.updateMatrix(); flowerMesh.setMatrixAt(flowerIdx++, dummy.matrix)
        }
      } else if (t === 4 && wallMesh) {
        dummy.position.set(px, 1.1, pz); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1)
        dummy.updateMatrix(); wallMesh.setMatrixAt(wallIdx++, dummy.matrix)
      } else if (t === 3 && trunkMesh && canopyMesh) {
        dummy.position.set(px, 0.8, pz); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1)
        dummy.updateMatrix(); trunkMesh.setMatrixAt(treeIdx, dummy.matrix)
        dummy.position.set(px, 1.85, pz); dummy.updateMatrix()
        canopyMesh.setMatrixAt(treeIdx, dummy.matrix)
        treeIdx++
      }
    }
  }

  for (const im of flatMeshes.values()) im.instanceMatrix.needsUpdate = true
  if (wallMesh) wallMesh.instanceMatrix.needsUpdate = true
  if (trunkMesh) trunkMesh.instanceMatrix.needsUpdate = true
  if (canopyMesh) canopyMesh.instanceMatrix.needsUpdate = true
  if (flowerMesh) flowerMesh.instanceMatrix.needsUpdate = true
}

function buildPlayerGroup(cls: string): THREE.Group {
  const g = new THREE.Group()
  const cols: Record<string, { body: number; head: number; legs: number; acc: number }> = {
    warrior: { body: 0xb0b0b0, head: 0xf5c580, legs: 0x3333aa, acc: 0xf0b820 },
    mage:    { body: 0x6a20cc, head: 0xf5c580, legs: 0x4a14aa, acc: 0x20c0f0 },
    rogue:   { body: 0x1a1a2a, head: 0xf5c580, legs: 0x111122, acc: 0x20ee60 },
    archer:  { body: 0x1a6a25, head: 0xf5c580, legs: 0x1a4a20, acc: 0xf0d020 },
  }
  const c = cols[cls] ?? cols.warrior
  const add = (geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, lmat(color)); m.position.set(x, y, z); g.add(m); return m
  }
  // Legs
  add(new THREE.BoxGeometry(0.22, 0.42, 0.22), c.legs, -0.12, 0.21, 0)
  add(new THREE.BoxGeometry(0.22, 0.42, 0.22), c.legs, 0.12, 0.21, 0)
  // Body
  add(new THREE.BoxGeometry(0.5, 0.52, 0.28), c.body, 0, 0.66, 0)
  // Arms
  add(new THREE.BoxGeometry(0.18, 0.42, 0.18), c.body, -0.34, 0.64, 0)
  add(new THREE.BoxGeometry(0.18, 0.42, 0.18), c.body, 0.34, 0.64, 0)
  // Head
  add(new THREE.BoxGeometry(0.38, 0.36, 0.36), c.head, 0, 1.09, 0)
  // Eyes
  add(new THREE.BoxGeometry(0.08, 0.08, 0.04), 0x222222, -0.1, 1.12, 0.18)
  add(new THREE.BoxGeometry(0.08, 0.08, 0.04), 0x222222, 0.1, 1.12, 0.18)
  // Class accessories
  if (cls === 'warrior') {
    add(new THREE.BoxGeometry(0.08, 0.44, 0.32), c.acc, -0.38, 0.65, 0.12) // shield
    add(new THREE.BoxGeometry(0.06, 0.55, 0.06), 0xa0a0a0, 0.38, 0.55, 0) // sword
  } else if (cls === 'mage') {
    add(new THREE.BoxGeometry(0.08, 1.3, 0.08), 0x8a5520, -0.42, 0.52, 0) // staff
    add(new THREE.BoxGeometry(0.22, 0.22, 0.22), c.acc, -0.42, 1.22, 0) // orb
    add(new THREE.BoxGeometry(0.46, 0.14, 0.46), 0x3a1a7a, 0, 1.34, 0) // hat brim
    add(new THREE.BoxGeometry(0.22, 0.38, 0.22), 0x3a1a7a, 0, 1.6, 0) // hat top
  } else if (cls === 'rogue') {
    add(new THREE.BoxGeometry(0.06, 0.38, 0.06), 0xd0d0d0, 0.36, 0.62, 0.1) // dagger
    add(new THREE.BoxGeometry(0.44, 0.18, 0.46), 0x1a1a2a, 0, 1.29, 0) // hood
  } else if (cls === 'archer') {
    add(new THREE.BoxGeometry(0.06, 0.85, 0.06), 0x8a5520, -0.4, 0.66, 0) // bow
    add(new THREE.BoxGeometry(0.44, 0.18, 0.44), 0x1a5a20, 0, 1.3, 0) // cap
  }
  return g
}

function buildEnemyGroup(kind: EnemyKind): THREE.Group {
  const g = new THREE.Group()
  const add = (geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, lmat(color)); m.position.set(x, y, z); g.add(m); return m
  }
  if (kind === 'slime') {
    add(new THREE.BoxGeometry(0.9, 0.52, 0.9), 0x20cc40, 0, 0.26, 0)
    add(new THREE.BoxGeometry(0.62, 0.32, 0.62), 0x30ee55, 0, 0.58, 0)
    add(new THREE.BoxGeometry(0.12, 0.12, 0.05), 0xffffff, -0.18, 0.42, 0.45)
    add(new THREE.BoxGeometry(0.12, 0.12, 0.05), 0xffffff, 0.18, 0.42, 0.45)
    add(new THREE.BoxGeometry(0.07, 0.07, 0.04), 0x111111, -0.18, 0.42, 0.47)
    add(new THREE.BoxGeometry(0.07, 0.07, 0.04), 0x111111, 0.18, 0.42, 0.47)
  } else if (kind === 'skeleton') {
    add(new THREE.BoxGeometry(0.18, 0.38, 0.18), 0xe8e8d0, -0.1, 0.19, 0)
    add(new THREE.BoxGeometry(0.18, 0.38, 0.18), 0xe8e8d0, 0.1, 0.19, 0)
    add(new THREE.BoxGeometry(0.38, 0.14, 0.22), 0xe8e8d0, 0, 0.41, 0)
    add(new THREE.BoxGeometry(0.4, 0.48, 0.24), 0xe8e8d0, 0, 0.72, 0)
    add(new THREE.BoxGeometry(0.13, 0.38, 0.13), 0xe8e8d0, -0.28, 0.71, 0)
    add(new THREE.BoxGeometry(0.13, 0.38, 0.13), 0xe8e8d0, 0.28, 0.71, 0)
    add(new THREE.BoxGeometry(0.07, 0.62, 0.07), 0xa0a0a0, 0.32, 0.58, 0) // sword
    add(new THREE.BoxGeometry(0.34, 0.32, 0.3), 0xe8e8d0, 0, 1.06, 0) // skull
    add(new THREE.BoxGeometry(0.1, 0.1, 0.06), 0xcc2222, -0.09, 1.09, 0.14)
    add(new THREE.BoxGeometry(0.1, 0.1, 0.06), 0xcc2222, 0.09, 1.09, 0.14)
  } else { // dragon
    add(new THREE.BoxGeometry(1.25, 0.85, 0.85), 0xcc2222, 0, 0.52, 0) // body
    add(new THREE.BoxGeometry(0.44, 0.52, 0.38), 0xcc2222, 0.52, 0.92, 0) // neck
    add(new THREE.BoxGeometry(0.54, 0.44, 0.44), 0xdd3333, 0.9, 1.05, 0) // head
    add(new THREE.BoxGeometry(0.12, 0.12, 0.06), 0xf0f020, 1.08, 1.08, 0.2) // eye
    add(new THREE.BoxGeometry(0.88, 0.28, 0.28), 0xaa1a1a, -0.78, 0.3, 0) // tail
    add(new THREE.BoxGeometry(0.12, 0.95, 1.5), 0x8a1a1a, -0.2, 0.9, -1.0) // wing L
    add(new THREE.BoxGeometry(0.12, 0.95, 1.5), 0x8a1a1a, -0.2, 0.9, 1.0) // wing R
    add(new THREE.BoxGeometry(0.22, 0.42, 0.22), 0xaa1a1a, 0.3, 0.12, 0.36)
    add(new THREE.BoxGeometry(0.22, 0.42, 0.22), 0xaa1a1a, 0.3, 0.12, -0.36)
    add(new THREE.BoxGeometry(0.22, 0.42, 0.22), 0xaa1a1a, -0.3, 0.12, 0.36)
    add(new THREE.BoxGeometry(0.22, 0.42, 0.22), 0xaa1a1a, -0.3, 0.12, -0.36)
  }
  return g
}

function buildNpcGroup(color: number): THREE.Group {
  const g = new THREE.Group()
  const add = (geo: THREE.BufferGeometry, col: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, lmat(col)); m.position.set(x, y, z); g.add(m)
  }
  add(new THREE.BoxGeometry(0.18, 0.38, 0.18), 0x3a2010, -0.1, 0.19, 0)
  add(new THREE.BoxGeometry(0.18, 0.38, 0.18), 0x3a2010, 0.1, 0.19, 0)
  add(new THREE.BoxGeometry(0.44, 0.52, 0.26), color, 0, 0.62, 0)
  add(new THREE.BoxGeometry(0.36, 0.34, 0.34), 0xf5c580, 0, 1.03, 0)
  add(new THREE.BoxGeometry(0.14, 0.34, 0.14), color, -0.3, 0.61, 0)
  add(new THREE.BoxGeometry(0.14, 0.34, 0.14), color, 0.3, 0.61, 0)
  return g
}

// ── HP bar above entity ────────────────────────────────────────────────────────
function makeHpBar(): THREE.Group {
  const g = new THREE.Group()
  const bg = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.12, 0.02), lmat(0x330000))
  const fill = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.12, 0.02), lmat(0x00ff44))
  fill.name = 'fill'; fill.position.z = 0.01
  g.add(bg); g.add(fill)
  return g
}

// ── Component ──────────────────────────────────────────────────────────────────
interface Props { playerName: string; playerClass: string }

export default function ThreeGame({ playerName, playerClass }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const gsRef = useRef<GS | null>(null)
  const rafRef = useRef<number>(0)
  const [hud, setHud] = useState<HudState>({
    hp: 100, maxHp: 100, mp: 50, maxMp: 50,
    xp: 0, xpNext: 100, level: 1, gold: 0, tokens: 0,
    chat: [], dead: false, respTimer: 0, dmg: [], npcMsg: null,
  })

  useEffect(() => {
    if (!mountRef.current) return

    // ── Scene ────────────────────────────────────────────────────────────────
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0a0a1e)
    scene.fog = new THREE.FogExp2(0x0a0a1e, 0.018)

    const ambient = new THREE.AmbientLight(0x6060a0, 1.2)
    scene.add(ambient)
    const sun = new THREE.DirectionalLight(0xffffee, 1.4)
    sun.position.set(15, 25, 10)
    scene.add(sun)
    const fill = new THREE.DirectionalLight(0x4040ff, 0.3)
    fill.position.set(-10, 5, -10)
    scene.add(fill)

    // ── Camera ───────────────────────────────────────────────────────────────
    const aspect = CW / CH
    const camera = new THREE.OrthographicCamera(-CAM_D * aspect, CAM_D * aspect, CAM_D, -CAM_D, 0.1, 300)
    camera.position.set(30, 20, 30)
    camera.lookAt(20, 0, 15)

    // ── Renderer ─────────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(CW, CH)
    mountRef.current.appendChild(renderer.domElement)

    // ── World ────────────────────────────────────────────────────────────────
    buildWorldMeshes(scene)

    // ── NPCs ─────────────────────────────────────────────────────────────────
    for (const npc of NPCS) {
      const g = buildNpcGroup(npc.col)
      g.position.set(npc.tx, 0.2, npc.ty)
      scene.add(g)
    }

    // ── Player ───────────────────────────────────────────────────────────────
    const playerGroup = buildPlayerGroup(playerClass || 'warrior')
    playerGroup.position.set(19.5, 0.2, 10.5)
    scene.add(playerGroup)

    // ── Enemies ───────────────────────────────────────────────────────────────
    const enemies = mkEnemies()
    const enemyGroups: THREE.Group[] = enemies.map(en => {
      const g = buildEnemyGroup(en.kind)
      g.position.set(en.x, 0.2, en.y)
      scene.add(g)
      return g
    })

    // HP bars for enemies
    const hpBars: THREE.Group[] = enemies.map(en => {
      const bar = makeHpBar()
      const scale = en.kind === 'dragon' ? 1.4 : en.kind === 'skeleton' ? 1.0 : 0.8
      bar.scale.x = scale
      bar.position.set(en.x, en.kind === 'dragon' ? 2.4 : en.kind === 'skeleton' ? 1.8 : 1.2, en.y)
      scene.add(bar)
      return bar
    })

    // ── Game state ───────────────────────────────────────────────────────────
    const gs: GS = {
      p: mkPlayer(playerName || 'HERO', playerClass || 'warrior'),
      enemies, dmg: [],
      chat: [
        { name: 'SYSTEM', text: 'Welcome to PixelRealms 3D! WASD=move SPACE=attack', c: '#f0d020', age: 0 },
        { name: 'SYSTEM', text: 'Three.js isometric world — explore!', c: '#9333ea', age: 0.5 },
      ],
      keys: new Set(), camX: 19.5, camY: 10.5,
      lastTs: 0, chatTimer: 4, npcBubble: null,
      attackPressed: false, dmgId: 0,
    }
    gsRef.current = gs

    // ── Input ────────────────────────────────────────────────────────────────
    const onKey = (e: KeyboardEvent) => {
      if (e.type === 'keydown') gs.keys.add(e.code)
      else gs.keys.delete(e.code)
      if (e.code === 'Space' && e.type === 'keydown') { e.preventDefault(); gs.attackPressed = true }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)

    // ── Attack ───────────────────────────────────────────────────────────────
    function doPlayerAttack() {
      if (gs.p.atkTimer > 0 || gs.p.dead) return
      const { p } = gs
      const atk = p.cls === 'warrior' ? 25 : p.cls === 'mage' ? 35 : p.cls === 'rogue' ? 20 : 18
      const range = p.cls === 'mage' ? 3.8 : p.cls === 'archer' ? 5 : 2.2
      for (const en of gs.enemies) {
        if (en.state === 'dead') continue
        if (dist2(p.x, p.y, en.x, en.y) < range * range) {
          const dmg = atk + Math.floor(Math.random() * 10)
          en.hp -= dmg
          gs.dmg.push({ id: gs.dmgId++, x: en.x, y: en.kind === 'dragon' ? 2.5 : 1.6, z: en.y, v: dmg, c: '#ff4444', t: 1 })
          if (en.hp <= 0) {
            en.state = 'dead'; en.respTimer = 15
            p.xp += en.xp; p.gold += en.gold; p.tokens += en.tok
            gs.dmg.push({ id: gs.dmgId++, x: en.x, y: 2.8, z: en.y, v: en.xp, c: '#f0d020', t: 1.5 })
            while (p.xp >= p.xpNext) {
              p.xp -= p.xpNext; p.level++; p.xpNext = Math.floor(p.xpNext * 1.6)
              p.maxHp += 20; p.hp = p.maxHp; p.maxMp += 10; p.mp = p.maxMp
              gs.chat.push({ name: 'SYSTEM', text: `${p.name} reached Level ${p.level}!`, c: '#f0d020', age: 0 })
            }
          }
        }
      }
      p.atkTimer = p.cls === 'warrior' ? 0.5 : p.cls === 'mage' ? 1.0 : p.cls === 'rogue' ? 0.35 : 0.7
    }

    // ── Update ───────────────────────────────────────────────────────────────
    function update(dt: number) {
      const { p, enemies: ens } = gs
      dt = Math.min(dt, 0.05)

      if (p.dead) {
        p.respTimer -= dt
        if (p.respTimer <= 0) { p.dead = false; p.hp = p.maxHp; p.mp = Math.floor(p.maxMp * 0.5); p.x = 19.5; p.y = 10.5 }
        return
      }

      p.atkTimer = Math.max(0, p.atkTimer - dt)
      p.invTimer = Math.max(0, p.invTimer - dt)
      if (p.mp < p.maxMp) p.mp = Math.min(p.maxMp, p.mp + dt * 5)
      if (gs.attackPressed) { doPlayerAttack(); gs.attackPressed = false }

      let dx = 0, dy = 0
      if (gs.keys.has('KeyW') || gs.keys.has('ArrowUp')) dy -= PSPEED * dt
      if (gs.keys.has('KeyS') || gs.keys.has('ArrowDown')) dy += PSPEED * dt
      if (gs.keys.has('KeyA') || gs.keys.has('ArrowLeft')) dx -= PSPEED * dt
      if (gs.keys.has('KeyD') || gs.keys.has('ArrowRight')) dx += PSPEED * dt
      if (dx && dy) { dx *= 0.707; dy *= 0.707 }
      p.moving = dx !== 0 || dy !== 0
      if (p.moving) {
        if (Math.abs(dx) > Math.abs(dy)) p.dir = dx > 0 ? 'right' : 'left'
        else p.dir = dy > 0 ? 'down' : 'up'
      }
      const nx = p.x + dx, ny = p.y + dy
      if (canMove(nx, p.y, PW, PH)) p.x = clamp(nx, 2, WW - 2 - PW)
      if (canMove(p.x, ny, PW, PH)) p.y = clamp(ny, 0, WH - 1 - PH)
      if (p.moving) { p.fTimer += dt; if (p.fTimer > 0.2) { p.fTimer = 0; p.frame = (p.frame + 1) % 2 } }
      else { p.frame = 0; p.fTimer = 0 }

      // NPC proximity
      gs.npcBubble = null
      for (let i = 0; i < NPCS.length; i++) {
        const n = NPCS[i]
        if (dist2(p.x, p.y, n.tx, n.ty) < 2.2 * 2.2) gs.npcBubble = { idx: i }
      }

      // Enemy AI
      for (const en of ens) {
        if (en.state === 'dead') {
          en.respTimer -= dt
          if (en.respTimer <= 0) { en.state = 'patrol'; en.hp = en.maxHp; en.x = en.homeX; en.y = en.homeY }
          continue
        }
        en.atkTimer = Math.max(0, en.atkTimer - dt)
        en.sTimer -= dt
        const d2 = dist2(p.x, p.y, en.x, en.y)
        const agR = en.kind === 'dragon' ? 6.5 : en.kind === 'skeleton' ? 5 : 3.8
        const atR = en.kind === 'dragon' ? 2 : 1.5

        if (en.state === 'patrol') {
          if (en.sTimer <= 0) {
            en.sTimer = 1.5 + Math.random() * 2
            const dirs: Dir[] = ['up', 'down', 'left', 'right']
            en.dir = dirs[Math.floor(Math.random() * 4)]
          }
          if (!p.dead && d2 < agR * agR) en.state = 'chase'
          const spd = en.kind === 'slime' ? 1.5 : en.kind === 'dragon' ? 2.2 : 2.0
          const ddx = (en.dir === 'right' ? spd : en.dir === 'left' ? -spd : 0) * dt
          const ddy = (en.dir === 'down' ? spd : en.dir === 'up' ? -spd : 0) * dt
          if (canMove(en.x + ddx, en.y + ddy, 0.7, 0.7)) { en.x += ddx; en.y += ddy }
          if (dist2(en.x, en.y, en.homeX, en.homeY) > 6 * 6) { en.state = 'patrol'; en.sTimer = 0 }
        } else if (en.state === 'chase') {
          if (p.dead || d2 > (agR * 1.5) ** 2) { en.state = 'patrol'; continue }
          if (d2 < atR * atR) { en.state = 'attack'; en.sTimer = 0.5; continue }
          const spd = en.kind === 'slime' ? 2.2 : en.kind === 'dragon' ? 3.0 : 2.8
          const angle = Math.atan2(p.y - en.y, p.x - en.x)
          const edx = Math.cos(angle) * spd * dt, edy = Math.sin(angle) * spd * dt
          if (canMove(en.x + edx, en.y, 0.7, 0.7)) en.x += edx
          if (canMove(en.x, en.y + edy, 0.7, 0.7)) en.y += edy
          en.fTimer += dt; if (en.fTimer > 0.25) { en.fTimer = 0; en.frame = (en.frame + 1) % 2 }
        } else if (en.state === 'attack') {
          if (d2 > atR * atR * 4) { en.state = 'chase'; continue }
          en.sTimer -= dt
          if (en.sTimer <= 0 && en.atkTimer === 0) {
            en.sTimer = en.kind === 'dragon' ? 1.8 : 1.2
            if (!p.dead && p.invTimer === 0) {
              const base = en.kind === 'dragon' ? 35 : en.kind === 'skeleton' ? 18 : 10
              const dmg = Math.max(0, base - (p.level - 1) * 2)
              p.hp -= dmg; p.invTimer = 0.8
              gs.dmg.push({ id: gs.dmgId++, x: p.x, y: 1.5, z: p.y, v: dmg, c: '#ff8800', t: 1 })
              if (p.hp <= 0) {
                p.dead = true; p.hp = 0; p.respTimer = 5
                gs.chat.push({ name: 'SYSTEM', text: 'You died! Respawning in 5s...', c: '#ff4444', age: 0 })
              }
            }
            en.atkTimer = 0.3
          }
        }
      }

      gs.dmg = gs.dmg.filter(d => { d.t -= dt * 0.8; return d.t > 0 })
      gs.chat = gs.chat.filter(c => { c.age += dt; return c.age < 8 })
      gs.chatTimer -= dt
      if (gs.chatTimer <= 0) {
        gs.chatTimer = 5 + Math.random() * 6
        const fp = FAKE_PLAYERS[Math.floor(Math.random() * FAKE_PLAYERS.length)]
        gs.chat.push({ name: fp.name, text: FAKE_MSGS[Math.floor(Math.random() * FAKE_MSGS.length)], c: fp.c, age: 0 })
        if (gs.chat.length > 6) gs.chat = gs.chat.slice(-6)
      }
    }

    // ── Render loop ──────────────────────────────────────────────────────────
    function loop(ts: number) {
      const dt = gs.lastTs ? (ts - gs.lastTs) / 1000 : 0
      gs.lastTs = ts
      update(dt)

      const { p } = gs

      // Player 3D
      if (p.dead) {
        playerGroup.visible = false
      } else {
        playerGroup.visible = !(p.invTimer > 0 && Math.floor(ts / 80) % 2 === 0)
        playerGroup.position.set(p.x, 0.2, p.y)
        const targetRot = p.dir === 'right' ? -Math.PI / 2 : p.dir === 'left' ? Math.PI / 2 : p.dir === 'up' ? Math.PI : 0
        playerGroup.rotation.y = lerp(playerGroup.rotation.y, targetRot, 0.22)
        if (p.moving) playerGroup.position.y = 0.2 + Math.abs(Math.sin(ts * 0.012)) * 0.07
      }

      // Enemies 3D
      for (let i = 0; i < gs.enemies.length; i++) {
        const en = gs.enemies[i]
        const eg = enemyGroups[i]
        const bar = hpBars[i]
        if (en.state === 'dead') { eg.visible = false; bar.visible = false; continue }
        eg.visible = true; bar.visible = true
        eg.position.set(en.x, 0.2, en.y)
        // Face player when chasing
        if (en.state !== 'patrol') {
          eg.rotation.y = Math.atan2(p.x - en.x, p.y - en.y) + Math.PI
        }
        if (en.kind === 'slime') eg.position.y = 0.2 + Math.abs(Math.sin(ts * 0.006 + i)) * 0.08
        if (en.kind === 'dragon') {
          eg.rotation.y = Math.atan2(p.x - en.x, p.y - en.y) + Math.PI
          eg.position.y = 0.2 + Math.abs(Math.sin(ts * 0.004 + i)) * 0.12
        }
        // Update HP bar
        bar.position.set(en.x, en.kind === 'dragon' ? 2.6 : en.kind === 'skeleton' ? 1.9 : 1.3, en.y)
        const fillMesh = bar.getObjectByName('fill') as THREE.Mesh | undefined
        if (fillMesh) {
          const ratio = en.hp / en.maxHp
          fillMesh.scale.x = ratio
          fillMesh.position.x = (ratio - 1) * 0.5
          ;(fillMesh.material as THREE.MeshLambertMaterial).color.setHex(ratio > 0.5 ? 0x00ff44 : ratio > 0.25 ? 0xffaa00 : 0xff2222)
        }
      }

      // Smooth camera follow
      gs.camX = lerp(gs.camX, p.x, 0.06)
      gs.camY = lerp(gs.camY, p.y, 0.06)
      gs.camX = clamp(gs.camX, CAM_D, WW - CAM_D)
      gs.camY = clamp(gs.camY, CAM_D, WH - CAM_D)
      const ISO_X = 12, ISO_Y = 16, ISO_Z = 12
      camera.position.set(gs.camX + ISO_X, ISO_Y, gs.camY + ISO_Z)
      camera.lookAt(gs.camX, 0.5, gs.camY)

      // Project damage numbers
      for (const d of gs.dmg) {
        const v3 = new THREE.Vector3(d.x, d.y, d.z).project(camera)
        d.screen = { x: (v3.x + 1) / 2 * CW, y: (-v3.y + 1) / 2 * CH }
      }

      renderer.render(scene, camera)

      const npcMsg = gs.npcBubble != null
        ? NPCS[gs.npcBubble.idx].msgs[Math.floor(Date.now() / 4000) % NPCS[gs.npcBubble.idx].msgs.length]
        : null

      setHud({
        hp: gs.p.hp, maxHp: gs.p.maxHp,
        mp: Math.floor(gs.p.mp), maxMp: gs.p.maxMp,
        xp: gs.p.xp, xpNext: gs.p.xpNext, level: gs.p.level,
        gold: gs.p.gold, tokens: gs.p.tokens,
        chat: [...gs.chat], dead: gs.p.dead, respTimer: gs.p.respTimer,
        dmg: gs.dmg.map(d => ({ ...d })), npcMsg,
      })

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
      renderer.dispose()
      if (mountRef.current?.contains(renderer.domElement)) {
        mountRef.current.removeChild(renderer.domElement)
      }
    }
  }, [playerName, playerClass])

  const hpPct = (hud.hp / hud.maxHp) * 100
  const mpPct = (hud.mp / hud.maxMp) * 100
  const xpPct = (hud.xp / hud.xpNext) * 100
  const hpCol = hud.hp / hud.maxHp > 0.5 ? '#22cc44' : hud.hp / hud.maxHp > 0.25 ? '#ddaa00' : '#cc2222'

  return (
    <div className="relative select-none" style={{ width: CW, maxWidth: '100%' }}>
      <div ref={mountRef} style={{ width: CW, height: CH, maxWidth: '100%', overflow: 'hidden', display: 'block' }} />

      {/* HUD */}
      <div className="absolute inset-0 pointer-events-none" style={{ width: CW, height: CH }}>

        {/* Stats — top left */}
        <div className="absolute top-2 left-2 p-2" style={{ background: 'rgba(0,0,0,0.78)', border: '1px solid #7c3aed', minWidth: 210 }}>
          <div style={{ color: '#f0d020', fontFamily: '"Press Start 2P",monospace', fontSize: 8, marginBottom: 5 }}>
            LV.{hud.level} {playerName || 'HERO'}
          </div>
          {/* HP */}
          <div style={{ marginBottom: 4 }}>
            <div style={{ background: '#300', width: 170, height: 13, border: '1px solid #444', position: 'relative' }}>
              <div style={{ background: hpCol, width: `${hpPct}%`, height: '100%', transition: 'width 0.15s' }} />
            </div>
            <div style={{ color: '#ccc', fontFamily: 'monospace', fontSize: 9, marginTop: 1 }}>HP {hud.hp}/{hud.maxHp}</div>
          </div>
          {/* MP */}
          <div style={{ marginBottom: 4 }}>
            <div style={{ background: '#003', width: 170, height: 13, border: '1px solid #444' }}>
              <div style={{ background: '#2266ee', width: `${mpPct}%`, height: '100%', transition: 'width 0.15s' }} />
            </div>
            <div style={{ color: '#ccc', fontFamily: 'monospace', fontSize: 9, marginTop: 1 }}>MP {hud.mp}/{hud.maxMp}</div>
          </div>
          {/* XP */}
          <div style={{ marginBottom: 4 }}>
            <div style={{ background: '#220', width: 170, height: 13, border: '1px solid #444' }}>
              <div style={{ background: '#aaaa00', width: `${xpPct}%`, height: '100%', transition: 'width 0.15s' }} />
            </div>
            <div style={{ color: '#ccc', fontFamily: 'monospace', fontSize: 9, marginTop: 1 }}>XP {hud.xp}/{hud.xpNext}</div>
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 2 }}>
            <span style={{ color: '#f0d020', fontFamily: '"Press Start 2P",monospace', fontSize: 7 }}>{hud.gold}G</span>
            <span style={{ color: '#9333ea', fontFamily: '"Press Start 2P",monospace', fontSize: 7 }}>{hud.tokens}$PIX</span>
          </div>
        </div>

        {/* Chat — bottom left */}
        <div className="absolute bottom-2 left-2 p-2" style={{ background: 'rgba(0,0,0,0.72)', border: '1px solid #7c3aed', width: 310 }}>
          {hud.chat.slice(-6).map((m, i) => (
            <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 2, opacity: Math.min(1, (8 - m.age) / 3) }}>
              <span style={{ color: m.c, fontFamily: 'monospace', fontSize: 9, flexShrink: 0 }}>[{m.name}]</span>
              <span style={{ color: '#ddd', fontFamily: 'monospace', fontSize: 9 }}>{m.text.slice(0, 34)}</span>
            </div>
          ))}
        </div>

        {/* NPC bubble — center top */}
        {hud.npcMsg && (
          <div className="absolute top-2 left-1/2" style={{ transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.88)', border: '1px solid #f0d020', padding: '6px 12px', maxWidth: 300, textAlign: 'center' }}>
            <div style={{ color: '#f0d020', fontFamily: 'monospace', fontSize: 10 }}>{hud.npcMsg}</div>
          </div>
        )}

        {/* Damage numbers */}
        {hud.dmg.map(d => d.screen && (
          <div key={d.id} style={{
            position: 'absolute', left: d.screen.x, top: d.screen.y - (1 - d.t) * 38,
            color: d.c, fontFamily: '"Press Start 2P",monospace',
            fontSize: d.v > 50 ? 13 : 10, fontWeight: 'bold',
            opacity: Math.min(1, d.t * 1.5), transform: 'translateX(-50%)',
            textShadow: '1px 1px 2px #000',
          }}>
            {d.v === 0 ? 'LVL UP!' : `-${d.v}`}
          </div>
        ))}

        {/* Death overlay */}
        {hud.dead && (
          <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: 'rgba(160,0,0,0.45)' }}>
            <div style={{ color: '#ff4444', fontFamily: '"Press Start 2P",monospace', fontSize: 22, marginBottom: 14 }}>YOU DIED</div>
            <div style={{ color: '#ffaaaa', fontFamily: '"Press Start 2P",monospace', fontSize: 10 }}>
              Respawning in {Math.ceil(Math.max(0, hud.respTimer))}s...
            </div>
          </div>
        )}

        {/* Controls hint */}
        <div className="absolute bottom-2 right-2" style={{ background: 'rgba(0,0,0,0.6)', padding: '4px 8px' }}>
          <span style={{ color: '#666', fontFamily: 'monospace', fontSize: 8 }}>WASD: Move · SPACE: Attack</span>
        </div>
      </div>
    </div>
  )
}
