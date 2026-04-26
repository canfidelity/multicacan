'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import GameHUD from './GameHUD'
import type { HudState, ItemHud } from './GameHUD'

// ── Constants ──────────────────────────────────────────────────────────────────
const CW = 900
const CH = 560
const MW = 40
const MH = 40
const PLAYER_SPEED = 4.5
const PW = 0.7
const PH = 1.0
const CAM_SIZE = 10

// ── Tile types ─────────────────────────────────────────────────────────────────
// 0=grass, 1=water, 2=path, 3=tree, 4=wall, 5=sand, 6=flower, 7=stone-floor, 8=dungeon
type Tile = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
const SOLID_TILES = new Set<Tile>([1, 3, 4])

function buildMap(): Tile[][] {
  const m: Tile[][] = Array.from({ length: MH }, () =>
    Array<Tile>(MW).fill(0)
  )
  // Town center (stone floor)
  for (let y = 2; y < 12; y++) for (let x = 8; x < 32; x++) m[y][x] = 7
  // Town walls
  for (let x = 8; x < 32; x++) { m[2][x] = 4; m[11][x] = 4 }
  for (let y = 2; y < 12; y++) { m[y][8] = 4; m[y][31] = 4 }
  // Town gates
  for (let y = 5; y < 8; y++) { m[y][8] = 7; m[y][31] = 7 }
  // Paths out of town
  for (let y = 5; y < 8; y++) { m[y][0] = 2; m[y][1] = 2; m[y][2] = 2; m[y][3] = 2; m[y][4] = 2; m[y][5] = 2; m[y][6] = 2; m[y][7] = 2 }
  for (let y = 5; y < 8; y++) { m[y][32] = 2; m[y][33] = 2; m[y][34] = 2; m[y][35] = 2; m[y][36] = 2; m[y][37] = 2; m[y][38] = 2; m[y][39] = 2 }
  for (let x = 18; x < 22; x++) { m[12][x] = 2; m[13][x] = 2; m[14][x] = 2; m[15][x] = 2 }
  // Forest (trees) around town
  for (let y = 0; y < 2; y++) for (let x = 0; x < MW; x++) m[y][x] = 3
  for (let y = 12; y < 18; y++) for (let x = 0; x < 8; x++) if ((x * 7 + y * 3) % 5 < 3) m[y][x] = 3
  for (let y = 12; y < 18; y++) for (let x = 33; x < MW; x++) if ((x * 7 + y * 3) % 5 < 3) m[y][x] = 3
  // Flowers in forest
  for (let y = 12; y < 20; y++) for (let x = 0; x < MW; x++) if (m[y][x] === 0 && (x * 13 + y * 7) % 11 === 0) m[y][x] = 6
  // Sand/desert south
  for (let y = 28; y < MH; y++) for (let x = 0; x < MW; x++) m[y][x] = 5
  // Dungeon walls south
  for (let y = 22; y < 28; y++) for (let x = 12; x < 28; x++) m[y][x] = 8
  for (let y = 22; y < 28; y++) { m[y][12] = 4; m[y][27] = 4 }
  for (let x = 12; x < 28; x++) { m[22][x] = 4; m[27][x] = 4 }
  for (let y = 24; y < 26; y++) { m[y][12] = 8; m[y][27] = 8 }
  // Water river
  for (let y = 18; y < 22; y++) for (let x = 0; x < MW; x++) if (m[y][x] === 0 || m[y][x] === 6) m[y][x] = 0
  for (let y = 19; y < 21; y++) for (let x = 0; x < MW; x++) if (m[y][x] !== 4 && m[y][x] !== 3) m[y][x] = 1
  // Bridge over river
  for (let y = 19; y < 21; y++) for (let x = 18; x < 22; x++) m[y][x] = 2
  return m
}
const MAP = buildMap()

// ── Helpers ────────────────────────────────────────────────────────────────────
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const dist2 = (ax: number, ay: number, bx: number, by: number) => (ax - bx) ** 2 + (ay - by) ** 2

function solidAt(tx: number, ty: number): boolean {
  const ix = Math.floor(tx)
  const iy = Math.floor(ty)
  if (ix < 0 || iy < 0 || ix >= MW || iy >= MH) return true
  return SOLID_TILES.has(MAP[iy][ix])
}
function canMove(x: number, y: number, w: number, h: number): boolean {
  const m = 0.08
  return (
    !solidAt(x + m, y + m) &&
    !solidAt(x + w - m, y + m) &&
    !solidAt(x + m, y + h - m) &&
    !solidAt(x + w - m, y + h - m)
  )
}

// ── Types ──────────────────────────────────────────────────────────────────────
type Dir = 'up' | 'down' | 'left' | 'right'
type EnemyKind = 'skeleton' | 'orc' | 'wolf' | 'dragon'
type CharClass = 'warrior' | 'mage' | 'rogue' | 'archer' | 'paladin'

interface Skill {
  key: string
  name: string
  mpCost: number
  cdMax: number
  range: number
  dmg: number
  aoe: boolean
  heal: boolean
}

const CLASS_SKILLS: Record<CharClass, Skill[]> = {
  warrior: [
    { key: 'Q', name: 'Shield Bash',  mpCost: 10, cdMax: 3,  range: 1.8, dmg: 35, aoe: false, heal: false },
    { key: 'W', name: 'Whirlwind',    mpCost: 25, cdMax: 8,  range: 2.5, dmg: 20, aoe: true,  heal: false },
    { key: 'E', name: 'War Cry',      mpCost: 15, cdMax: 12, range: 0,   dmg: 0,  aoe: false, heal: false },
    { key: 'R', name: 'Execute',      mpCost: 40, cdMax: 20, range: 2.0, dmg: 90, aoe: false, heal: false },
  ],
  mage: [
    { key: 'Q', name: 'Fireball',     mpCost: 20, cdMax: 2,  range: 4.0, dmg: 45, aoe: false, heal: false },
    { key: 'W', name: 'Frost Nova',   mpCost: 30, cdMax: 8,  range: 3.0, dmg: 30, aoe: true,  heal: false },
    { key: 'E', name: 'Arcane Blast', mpCost: 15, cdMax: 4,  range: 4.5, dmg: 55, aoe: false, heal: false },
    { key: 'R', name: 'Meteor',       mpCost: 60, cdMax: 25, range: 5.0, dmg: 150,aoe: true,  heal: false },
  ],
  rogue: [
    { key: 'Q', name: 'Backstab',     mpCost: 10, cdMax: 2,  range: 1.5, dmg: 50, aoe: false, heal: false },
    { key: 'W', name: 'Poison Blade', mpCost: 15, cdMax: 5,  range: 1.8, dmg: 30, aoe: false, heal: false },
    { key: 'E', name: 'Shadow Step',  mpCost: 20, cdMax: 8,  range: 0,   dmg: 0,  aoe: false, heal: false },
    { key: 'R', name: 'Death Mark',   mpCost: 45, cdMax: 20, range: 2.0, dmg: 120,aoe: false, heal: false },
  ],
  archer: [
    { key: 'Q', name: 'Arrow Shot',   mpCost: 8,  cdMax: 1,  range: 5.5, dmg: 30, aoe: false, heal: false },
    { key: 'W', name: 'Rain of Arrows',mpCost:30, cdMax: 10, range: 4.0, dmg: 20, aoe: true,  heal: false },
    { key: 'E', name: 'Piercing Shot',mpCost: 15, cdMax: 5,  range: 6.0, dmg: 55, aoe: false, heal: false },
    { key: 'R', name: 'Snipe',        mpCost: 50, cdMax: 20, range: 8.0, dmg: 130,aoe: false, heal: false },
  ],
  paladin: [
    { key: 'Q', name: 'Holy Strike',  mpCost: 10, cdMax: 2,  range: 2.0, dmg: 30, aoe: false, heal: false },
    { key: 'W', name: 'Smite',        mpCost: 20, cdMax: 6,  range: 2.5, dmg: 50, aoe: false, heal: false },
    { key: 'E', name: 'Holy Light',   mpCost: 30, cdMax: 10, range: 0,   dmg: 0,  aoe: false, heal: true  },
    { key: 'R', name: 'Divine Wrath', mpCost: 50, cdMax: 20, range: 3.0, dmg: 100,aoe: true,  heal: false },
  ],
}

const CLASS_BASE: Record<CharClass, { hp: number; mp: number; atk: number; def: number; spd: number }> = {
  warrior: { hp: 150, mp: 50,  atk: 25, def: 15, spd: 4.0 },
  mage:    { hp: 80,  mp: 120, atk: 35, def: 5,  spd: 4.5 },
  rogue:   { hp: 100, mp: 70,  atk: 30, def: 8,  spd: 5.5 },
  archer:  { hp: 90,  mp: 80,  atk: 28, def: 7,  spd: 5.0 },
  paladin: { hp: 130, mp: 90,  atk: 22, def: 12, spd: 4.2 },
}

interface Item {
  id: number
  name: string
  type: 'weapon' | 'armor' | 'potion' | 'gem'
  rarity: 'common' | 'rare' | 'epic'
  color: string
  stat: number
}

interface Player {
  x: number; y: number
  hp: number; maxHp: number; mp: number; maxMp: number
  level: number; xp: number; xpNext: number
  gold: number; atk: number; def: number
  dir: Dir; frame: number; fTimer: number
  atkTimer: number; invTimer: number
  moving: boolean; dead: boolean; respTimer: number
  name: string; cls: CharClass
  skillCds: number[]
  inventory: (Item | null)[]
  inventoryOpen: boolean
}

interface Enemy {
  id: number; kind: EnemyKind; x: number; y: number
  hp: number; maxHp: number; dir: Dir; frame: number; fTimer: number
  state: 'patrol' | 'chase' | 'attack' | 'dead'
  sTimer: number; homeX: number; homeY: number
  atkTimer: number; xp: number; gold: number; respTimer: number
}

interface DmgNum {
  id: number; x: number; y: number; z: number; v: number; c: string; t: number
  screen?: { x: number; y: number }
}

interface ChatMsg { name: string; text: string; c: string; age: number }

interface GS {
  p: Player; enemies: Enemy[]; dmg: DmgNum[]; chat: ChatMsg[]
  keys: Set<string>; camX: number; camY: number; lastTs: number
  chatTimer: number; npcBubble: number | null
  attackPressed: boolean; dmgId: number; itemId: number
}

// ── NPC data ───────────────────────────────────────────────────────────────────
const NPCS = [
  { tx: 15.5, ty: 6.5, name: 'ELDER',    col: 0xf0d080, colStr: '#f0d080', msgs: ['Welcome hero! Slay monsters for $PIXEL!', 'Dragon lurks in the southern desert.', 'Skeletons in the dungeon—be careful!', 'Guild raids every midnight!'] },
  { tx: 22,   ty: 8.5, name: 'MERCHANT', col: 0x80f0d0, colStr: '#80f0d0', msgs: ['Buy potions! 10 gold each.', 'I trade $PIXEL for rare items.', 'Dragon scales fetch 500 gold!', 'Best prices in the realm!'] },
  { tx: 12,   ty: 6.5, name: 'GUARD',    col: 0x8080f0, colStr: '#8080f0', msgs: ['Halt! State your business.', 'Skeletons in dungeon — be warned!', 'Wolves in the forest are fast.', 'Desert orcs will end you.'] },
  { tx: 19.5, ty: 4.5, name: 'SMITH',    col: 0xff9940, colStr: '#ff9940', msgs: ['I forge the finest weapons.', 'Bring me wolf fangs for a discount.', 'Orc hide makes great armor.', 'Dragonscale sword — my masterpiece.'] },
]

const FAKE_PLAYERS = [
  { name: 'DragonSlyr99', c: '#ff6060' },
  { name: 'MageKing', c: '#aa66ff' },
  { name: 'ShadowBlade', c: '#60ff80' },
  { name: 'IronShield', c: '#60d0ff' },
  { name: 'HolyPaladin', c: '#f0d020' },
]
const FAKE_MSGS = [
  'Anyone want to raid the dungeon? 🏰',
  'LFG dragon fight! Need healer',
  'Just earned 200 $PIXEL! 💰',
  'WTS rare skeleton sword NFT',
  'Level 10 unlocks Dragon Zone!',
  'Dragon drops 200g, totally worth it',
  'Guild recruiting! DM me',
  'WASD to move, SPACE to attack btw',
  'Holy Light OP for dungeons fr fr',
  'Wolf packs spawn at night watch out',
]

const ITEM_POOL: Omit<Item, 'id'>[] = [
  { name: 'Iron Sword',     type: 'weapon', rarity: 'common', color: '#c0c0c0', stat: 5 },
  { name: 'Leather Armor',  type: 'armor',  rarity: 'common', color: '#8a5520', stat: 3 },
  { name: 'Health Potion',  type: 'potion', rarity: 'common', color: '#ff4444', stat: 50 },
  { name: 'Mana Potion',    type: 'potion', rarity: 'common', color: '#4444ff', stat: 30 },
  { name: 'Ruby Gem',       type: 'gem',    rarity: 'rare',   color: '#ff2266', stat: 10 },
  { name: 'Silver Blade',   type: 'weapon', rarity: 'rare',   color: '#e0e8ff', stat: 15 },
  { name: 'Chain Mail',     type: 'armor',  rarity: 'rare',   color: '#8090a0', stat: 10 },
  { name: 'Dragon Scale',   type: 'armor',  rarity: 'epic',   color: '#cc2222', stat: 25 },
  { name: 'Arcane Staff',   type: 'weapon', rarity: 'epic',   color: '#aa22ff', stat: 30 },
  { name: 'Diamond Gem',    type: 'gem',    rarity: 'epic',   color: '#aaddff', stat: 20 },
]

// ── Init ───────────────────────────────────────────────────────────────────────
function mkPlayer(name: string, cls: CharClass): Player {
  const base = CLASS_BASE[cls]
  return {
    x: 19.5, y: 7.0,
    hp: base.hp, maxHp: base.hp,
    mp: base.mp, maxMp: base.mp,
    level: 1, xp: 0, xpNext: 100,
    gold: 0, atk: base.atk, def: base.def,
    dir: 'down', frame: 0, fTimer: 0,
    atkTimer: 0, invTimer: 0,
    moving: false, dead: false, respTimer: 0,
    name, cls,
    skillCds: [0, 0, 0, 0],
    inventory: Array<Item | null>(20).fill(null),
    inventoryOpen: false,
  }
}

function mkEnemies(): Enemy[] {
  const list: Enemy[] = []
  let id = 0
  const add = (
    kind: EnemyKind,
    tx: number, ty: number,
    hp: number, xp: number, gold: number
  ) =>
    list.push({
      id: id++, kind, x: tx + 0.5, y: ty + 0.5,
      hp, maxHp: hp, dir: 'down', frame: 0, fTimer: 0,
      state: 'patrol',
      sTimer: Math.random() * 3,
      homeX: tx + 0.5, homeY: ty + 0.5,
      atkTimer: 0, xp, gold, respTimer: 0,
    })
  // Wolves in forest
  add('wolf', 2, 13, 40, 20, 8); add('wolf', 5, 14, 40, 20, 8)
  add('wolf', 35, 13, 40, 20, 8); add('wolf', 38, 14, 40, 20, 8)
  add('wolf', 3, 16, 40, 20, 8); add('wolf', 37, 16, 40, 20, 8)
  // Skeletons in dungeon
  add('skeleton', 14, 23, 70, 40, 15); add('skeleton', 18, 24, 70, 40, 15)
  add('skeleton', 21, 25, 70, 40, 15); add('skeleton', 25, 23, 70, 40, 15)
  add('skeleton', 15, 26, 70, 40, 15)
  // Orcs in south
  add('orc', 10, 30, 100, 60, 25); add('orc', 20, 31, 100, 60, 25)
  add('orc', 30, 30, 100, 60, 25); add('orc', 5, 33, 100, 60, 25)
  add('orc', 35, 33, 100, 60, 25)
  // Dragons in far south
  add('dragon', 10, 36, 250, 200, 100); add('dragon', 30, 37, 250, 200, 100)
  return list
}

// ── Pixel texture helpers ──────────────────────────────────────────────────────
function makePixelTex(
  size: number,
  draw: (ctx: CanvasRenderingContext2D, s: number) => void
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = size; canvas.height = size
  const ctx = canvas.getContext('2d')!
  draw(ctx, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  return tex
}

function makeTileTex(base: string, spots: Array<{ c: string; xs: number[]; ys: number[] }>): THREE.CanvasTexture {
  return makePixelTex(16, (ctx, s) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, s, s)
    for (const sp of spots) {
      ctx.fillStyle = sp.c
      for (let i = 0; i < sp.xs.length; i++) ctx.fillRect(sp.xs[i], sp.ys[i], 2, 2)
    }
  })
}

// ── THREE.js material helpers ──────────────────────────────────────────────────
function lmat(color: number, emissive = 0, emInt = 0): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ color })
  if (emissive) { m.emissive.setHex(emissive); m.emissiveIntensity = emInt }
  return m
}

function tmat(tex: THREE.Texture): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ map: tex })
}

// ── World mesh builder ─────────────────────────────────────────────────────────
function buildWorldMeshes(scene: THREE.Scene): void {
  // Pixel textures for tiles
  const texGrass = makeTileTex('#3a7a2a', [{ c: '#4a8a3a', xs: [1,5,9,13], ys: [2,6,10,14] }, { c: '#2a6a1a', xs: [3,7,11,15], ys: [4,8,12,0] }])
  const texPath  = makeTileTex('#b0a080', [{ c: '#c0b090', xs: [2,6,10], ys: [3,7,11] }, { c: '#907060', xs: [4,8,12], ys: [5,9,13] }])
  const texStone = makeTileTex('#6a6060', [{ c: '#7a7070', xs: [0,4,8,12], ys: [0,4,8,12] }, { c: '#5a5050', xs: [2,6,10,14], ys: [2,6,10,14] }])
  const texSand  = makeTileTex('#c4a340', [{ c: '#d4b350', xs: [1,5,9,13], ys: [3,7,11] }, { c: '#b49330', xs: [3,7,11], ys: [5,9,13] }])
  const texDung  = makeTileTex('#1a1a2a', [{ c: '#2a2a3a', xs: [0,4,8,12], ys: [0,4,8,12] }, { c: '#0a0a1a', xs: [2,6,10], ys: [2,6,10] }])
  const texWater = makeTileTex('#0a3060', [{ c: '#1a4070', xs: [2,6,10,14], ys: [1,5,9,13] }, { c: '#0a2050', xs: [0,4,8,12], ys: [3,7,11] }])

  const gFlat  = new THREE.BoxGeometry(1, 0.2, 1)
  const gWall  = new THREE.BoxGeometry(1, 2.4, 1)
  const gTrunk = new THREE.BoxGeometry(0.22, 1.5, 0.22)
  const gCan   = new THREE.BoxGeometry(0.9, 0.8, 0.9)

  type TileConf = { geo: THREE.BufferGeometry; mat: THREE.Material; yOff: number }
  const flatConf: Record<number, TileConf> = {
    0: { geo: gFlat, mat: tmat(texGrass), yOff: 0.10 },
    2: { geo: gFlat, mat: tmat(texPath),  yOff: 0.10 },
    5: { geo: gFlat, mat: tmat(texSand),  yOff: 0.10 },
    7: { geo: gFlat, mat: tmat(texStone), yOff: 0.10 },
    8: { geo: gFlat, mat: tmat(texDung),  yOff: 0.10 },
    1: { geo: gFlat, mat: tmat(texWater), yOff: 0.05 },
    6: { geo: gFlat, mat: tmat(texGrass), yOff: 0.10 },
  }

  const cnt: Record<number, number> = {}
  for (let t = 0; t <= 8; t++) cnt[t] = 0
  for (let ty = 0; ty < MH; ty++) for (let tx = 0; tx < MW; tx++) cnt[MAP[ty][tx]]++

  const iMeshes = new Map<number, THREE.InstancedMesh>()
  for (const [tIdx, conf] of Object.entries(flatConf)) {
    const n = cnt[Number(tIdx)]
    if (n > 0) {
      const im = new THREE.InstancedMesh(conf.geo, conf.mat, n)
      iMeshes.set(Number(tIdx), im); scene.add(im)
    }
  }
  const wallCount = cnt[4]
  const wallMesh = wallCount > 0 ? new THREE.InstancedMesh(gWall, lmat(0x4a3a2a), wallCount) : null
  if (wallMesh) scene.add(wallMesh)
  const treeCount = cnt[3]
  const trunkMesh = treeCount > 0 ? new THREE.InstancedMesh(gTrunk, lmat(0x6a3a10), treeCount) : null
  const canopyMesh = treeCount > 0 ? new THREE.InstancedMesh(gCan, lmat(0x1a6a14), treeCount) : null
  if (trunkMesh) scene.add(trunkMesh)
  if (canopyMesh) scene.add(canopyMesh)

  // Flower decor
  const flowerCount = cnt[6]
  const flowerMesh = flowerCount > 0
    ? new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.18, 0.16), lmat(0xe05090), flowerCount)
    : null
  if (flowerMesh) scene.add(flowerMesh)

  const dummy = new THREE.Object3D()
  const idx: Map<number, number> = new Map()
  for (let t = 0; t <= 8; t++) idx.set(t, 0)
  let wallIdx = 0, treeIdx = 0, flowerIdx = 0

  for (let ty = 0; ty < MH; ty++) {
    for (let tx = 0; tx < MW; tx++) {
      const t = MAP[ty][tx]
      const px = tx + 0.5, pz = ty + 0.5
      if (t in flatConf) {
        const conf = flatConf[t]
        dummy.position.set(px, conf.yOff, pz)
        dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        iMeshes.get(t)!.setMatrixAt(idx.get(t)!, dummy.matrix)
        idx.set(t, (idx.get(t) ?? 0) + 1)
        if (t === 6 && flowerMesh) {
          dummy.position.set(px + (Math.random() - 0.5) * 0.4, 0.28, pz + (Math.random() - 0.5) * 0.4)
          dummy.updateMatrix()
          flowerMesh.setMatrixAt(flowerIdx++, dummy.matrix)
        }
      } else if (t === 4 && wallMesh) {
        dummy.position.set(px, 1.2, pz); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1)
        dummy.updateMatrix(); wallMesh.setMatrixAt(wallIdx++, dummy.matrix)
      } else if (t === 3 && trunkMesh && canopyMesh) {
        dummy.position.set(px, 0.75, pz); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1)
        dummy.updateMatrix(); trunkMesh.setMatrixAt(treeIdx, dummy.matrix)
        dummy.position.set(px, 1.8, pz); dummy.updateMatrix()
        canopyMesh.setMatrixAt(treeIdx, dummy.matrix)
        treeIdx++
      }
    }
  }

  for (const im of iMeshes.values()) im.instanceMatrix.needsUpdate = true
  if (wallMesh) wallMesh.instanceMatrix.needsUpdate = true
  if (trunkMesh) trunkMesh.instanceMatrix.needsUpdate = true
  if (canopyMesh) canopyMesh.instanceMatrix.needsUpdate = true
  if (flowerMesh) flowerMesh.instanceMatrix.needsUpdate = true

  // Torch lights in town
  const torchPositions = [[12, 3], [29, 3], [12, 10], [29, 10]]
  for (const [tx, tz] of torchPositions) {
    const torch = new THREE.PointLight(0xff8822, 2.5, 6)
    torch.position.set(tx + 0.5, 1.8, tz + 0.5)
    scene.add(torch)
    // Torch post
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 0.1), lmat(0x6a3a10))
    post.position.set(tx + 0.5, 0.6, tz + 0.5); scene.add(post)
  }
}

// ── Character builders ─────────────────────────────────────────────────────────
function buildPlayerGroup(cls: CharClass): THREE.Group {
  const g = new THREE.Group()
  const cols: Record<CharClass, { body: number; head: number; legs: number; acc: number }> = {
    warrior: { body: 0xb0b0b0, head: 0xf5c580, legs: 0x3333aa, acc: 0xf0b820 },
    mage:    { body: 0x6a20cc, head: 0xf5c580, legs: 0x4a14aa, acc: 0x20c0f0 },
    rogue:   { body: 0x1a1a2a, head: 0xf5c580, legs: 0x111122, acc: 0x20ee60 },
    archer:  { body: 0x1a6a25, head: 0xf5c580, legs: 0x1a4a20, acc: 0xf0d020 },
    paladin: { body: 0xd4a020, head: 0xf5c580, legs: 0x8a6010, acc: 0xffffff },
  }
  const c = cols[cls]
  const add = (geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, lmat(color)); m.position.set(x, y, z); g.add(m)
  }
  add(new THREE.BoxGeometry(0.22, 0.42, 0.22), c.legs, -0.12, 0.21, 0)
  add(new THREE.BoxGeometry(0.22, 0.42, 0.22), c.legs, 0.12, 0.21, 0)
  add(new THREE.BoxGeometry(0.5, 0.52, 0.28), c.body, 0, 0.66, 0)
  add(new THREE.BoxGeometry(0.18, 0.42, 0.18), c.body, -0.34, 0.64, 0)
  add(new THREE.BoxGeometry(0.18, 0.42, 0.18), c.body, 0.34, 0.64, 0)
  add(new THREE.BoxGeometry(0.38, 0.36, 0.36), c.head, 0, 1.09, 0)
  add(new THREE.BoxGeometry(0.08, 0.08, 0.04), 0x222222, -0.1, 1.12, 0.18)
  add(new THREE.BoxGeometry(0.08, 0.08, 0.04), 0x222222, 0.1, 1.12, 0.18)
  if (cls === 'warrior') {
    add(new THREE.BoxGeometry(0.08, 0.44, 0.32), c.acc, -0.38, 0.65, 0.12)
    add(new THREE.BoxGeometry(0.06, 0.55, 0.06), 0xa0a0a0, 0.38, 0.55, 0)
  } else if (cls === 'mage') {
    add(new THREE.BoxGeometry(0.08, 1.3, 0.08), 0x8a5520, -0.42, 0.52, 0)
    add(new THREE.BoxGeometry(0.22, 0.22, 0.22), c.acc, -0.42, 1.22, 0)
    add(new THREE.BoxGeometry(0.46, 0.14, 0.46), 0x3a1a7a, 0, 1.34, 0)
    add(new THREE.BoxGeometry(0.22, 0.38, 0.22), 0x3a1a7a, 0, 1.6, 0)
  } else if (cls === 'rogue') {
    add(new THREE.BoxGeometry(0.06, 0.38, 0.06), 0xd0d0d0, 0.36, 0.62, 0.1)
    add(new THREE.BoxGeometry(0.44, 0.18, 0.46), 0x1a1a2a, 0, 1.29, 0)
  } else if (cls === 'archer') {
    add(new THREE.BoxGeometry(0.06, 0.85, 0.06), 0x8a5520, -0.4, 0.66, 0)
    add(new THREE.BoxGeometry(0.44, 0.18, 0.44), 0x1a5a20, 0, 1.3, 0)
  } else if (cls === 'paladin') {
    add(new THREE.BoxGeometry(0.1, 0.48, 0.36), c.acc, -0.38, 0.65, 0.1)
    add(new THREE.BoxGeometry(0.07, 0.58, 0.07), 0xd4a020, 0.38, 0.55, 0)
    add(new THREE.BoxGeometry(0.44, 0.12, 0.44), c.acc, 0, 1.33, 0)
    add(new THREE.BoxGeometry(0.18, 0.36, 0.18), c.acc, 0, 1.56, 0)
  }
  return g
}

function buildEnemyGroup(kind: EnemyKind): THREE.Group {
  const g = new THREE.Group()
  const add = (geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, lmat(color)); m.position.set(x, y, z); g.add(m)
  }
  if (kind === 'wolf') {
    add(new THREE.BoxGeometry(0.8, 0.5, 0.55), 0x808090, 0, 0.35, 0)
    add(new THREE.BoxGeometry(0.38, 0.36, 0.38), 0x909098, 0.48, 0.55, 0)
    add(new THREE.BoxGeometry(0.08, 0.22, 0.08), 0x707078, 0.56, 0.74, 0.1)
    add(new THREE.BoxGeometry(0.08, 0.22, 0.08), 0x707078, 0.56, 0.74, -0.1)
    add(new THREE.BoxGeometry(0.1, 0.1, 0.06), 0xffee22, 0.62, 0.56, 0.15)
    add(new THREE.BoxGeometry(0.1, 0.1, 0.06), 0xffee22, 0.62, 0.56, -0.15)
    add(new THREE.BoxGeometry(0.12, 0.32, 0.12), 0x808090, -0.2, 0.18, 0.2)
    add(new THREE.BoxGeometry(0.12, 0.32, 0.12), 0x808090, 0.2, 0.18, 0.2)
    add(new THREE.BoxGeometry(0.12, 0.32, 0.12), 0x808090, -0.2, 0.18, -0.2)
    add(new THREE.BoxGeometry(0.12, 0.32, 0.12), 0x808090, 0.2, 0.18, -0.2)
    add(new THREE.BoxGeometry(0.08, 0.38, 0.08), 0x707078, -0.48, 0.40, 0)
  } else if (kind === 'skeleton') {
    add(new THREE.BoxGeometry(0.18, 0.38, 0.18), 0xe8e8d0, -0.1, 0.19, 0)
    add(new THREE.BoxGeometry(0.18, 0.38, 0.18), 0xe8e8d0, 0.1, 0.19, 0)
    add(new THREE.BoxGeometry(0.38, 0.14, 0.22), 0xe8e8d0, 0, 0.41, 0)
    add(new THREE.BoxGeometry(0.4, 0.48, 0.24), 0xe8e8d0, 0, 0.72, 0)
    add(new THREE.BoxGeometry(0.13, 0.38, 0.13), 0xe8e8d0, -0.28, 0.71, 0)
    add(new THREE.BoxGeometry(0.13, 0.38, 0.13), 0xe8e8d0, 0.28, 0.71, 0)
    add(new THREE.BoxGeometry(0.07, 0.62, 0.07), 0xa0a0a0, 0.32, 0.58, 0)
    add(new THREE.BoxGeometry(0.34, 0.32, 0.3), 0xe8e8d0, 0, 1.06, 0)
    add(new THREE.BoxGeometry(0.1, 0.1, 0.06), 0xcc2222, -0.09, 1.09, 0.14)
    add(new THREE.BoxGeometry(0.1, 0.1, 0.06), 0xcc2222, 0.09, 1.09, 0.14)
  } else if (kind === 'orc') {
    add(new THREE.BoxGeometry(0.22, 0.46, 0.22), 0x2a6a10, -0.14, 0.23, 0)
    add(new THREE.BoxGeometry(0.22, 0.46, 0.22), 0x2a6a10, 0.14, 0.23, 0)
    add(new THREE.BoxGeometry(0.62, 0.64, 0.38), 0x2a6a10, 0, 0.78, 0)
    add(new THREE.BoxGeometry(0.22, 0.50, 0.22), 0x2a6a10, -0.46, 0.76, 0)
    add(new THREE.BoxGeometry(0.22, 0.50, 0.22), 0x2a6a10, 0.46, 0.76, 0)
    add(new THREE.BoxGeometry(0.08, 0.7, 0.08), 0x5a3a10, 0.56, 0.60, 0)
    add(new THREE.BoxGeometry(0.46, 0.42, 0.42), 0x3a8a18, 0, 1.22, 0)
    add(new THREE.BoxGeometry(0.12, 0.12, 0.06), 0xffcc00, -0.14, 1.18, 0.20)
    add(new THREE.BoxGeometry(0.12, 0.12, 0.06), 0xffcc00, 0.14, 1.18, 0.20)
    add(new THREE.BoxGeometry(0.06, 0.18, 0.06), 0xeeeedd, -0.1, 1.06, 0.20)
    add(new THREE.BoxGeometry(0.06, 0.18, 0.06), 0xeeeedd, 0.1, 1.06, 0.20)
    add(new THREE.BoxGeometry(0.5, 0.14, 0.5), 0x4a3010, 0, 1.5, 0)
    add(new THREE.BoxGeometry(0.22, 0.26, 0.22), 0x4a3010, 0, 1.68, 0)
  } else {
    // dragon
    add(new THREE.BoxGeometry(1.3, 0.9, 0.9), 0xcc2222, 0, 0.55, 0)
    add(new THREE.BoxGeometry(0.46, 0.54, 0.4), 0xcc2222, 0.55, 0.96, 0)
    add(new THREE.BoxGeometry(0.56, 0.46, 0.46), 0xdd3333, 0.92, 1.08, 0)
    add(new THREE.BoxGeometry(0.12, 0.12, 0.06), 0xf0f020, 1.1, 1.12, 0.22)
    add(new THREE.BoxGeometry(0.12, 0.12, 0.06), 0xf0f020, 1.1, 1.12, -0.22)
    add(new THREE.BoxGeometry(0.88, 0.28, 0.28), 0xaa1a1a, -0.82, 0.32, 0)
    add(new THREE.BoxGeometry(0.12, 1.0, 1.6), 0x8a1a1a, -0.2, 0.95, -1.0)
    add(new THREE.BoxGeometry(0.12, 1.0, 1.6), 0x8a1a1a, -0.2, 0.95, 1.0)
    add(new THREE.BoxGeometry(0.24, 0.44, 0.24), 0xaa1a1a, 0.3, 0.14, 0.38)
    add(new THREE.BoxGeometry(0.24, 0.44, 0.24), 0xaa1a1a, 0.3, 0.14, -0.38)
    add(new THREE.BoxGeometry(0.24, 0.44, 0.24), 0xaa1a1a, -0.3, 0.14, 0.38)
    add(new THREE.BoxGeometry(0.24, 0.44, 0.24), 0xaa1a1a, -0.3, 0.14, -0.38)
    add(new THREE.BoxGeometry(0.14, 0.24, 0.06), 0xee3333, 1.14, 0.98, 0.1)
    add(new THREE.BoxGeometry(0.14, 0.24, 0.06), 0xee3333, 1.14, 0.98, -0.1)
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

export default function MMORPGGame({ playerName, playerClass }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const gsRef = useRef<GS | null>(null)
  const rafRef = useRef<number>(0)
  const cls = (playerClass as CharClass) || 'warrior'
  const base = CLASS_BASE[cls] ?? CLASS_BASE.warrior

  const [hud, setHud] = useState<HudState>({
    hp: base.hp, maxHp: base.hp,
    mp: base.mp, maxMp: base.mp,
    xp: 0, xpNext: 100, level: 1,
    gold: 0, cls, name: playerName || 'HERO',
    skills: (CLASS_SKILLS[cls] ?? CLASS_SKILLS.warrior).map(s => ({ key: s.key, name: s.name, cd: 0, cdMax: s.cdMax })),
    inventory: Array<ItemHud | null>(20).fill(null),
    inventoryOpen: false,
    playerX: 19.5, playerY: 7.0, mapW: MW, mapH: MH,
    enemies: [],
    chat: [],
    dead: false, respTimer: 0,
    dmg: [],
    npcMsg: null,
  })

  useEffect(() => {
    if (!mountRef.current) return

    // ── Scene setup ──────────────────────────────────────────────────────────
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0a0a1e)
    scene.fog = new THREE.FogExp2(0x0a0a1e, 0.014)

    const ambient = new THREE.AmbientLight(0x7070b0, 1.0)
    scene.add(ambient)
    const sun = new THREE.DirectionalLight(0xffffee, 1.6)
    sun.position.set(20, 30, 10); scene.add(sun)
    const fill = new THREE.DirectionalLight(0x4040ff, 0.25)
    fill.position.set(-10, 5, -10); scene.add(fill)

    // ── Camera ───────────────────────────────────────────────────────────────
    const aspect = CW / CH
    const camera = new THREE.OrthographicCamera(
      -CAM_SIZE * aspect, CAM_SIZE * aspect,
      CAM_SIZE, -CAM_SIZE, 0.1, 400
    )
    camera.position.set(30, 22, 30)
    camera.lookAt(20, 0, 15)

    // ── Renderer ─────────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    renderer.setSize(CW, CH)
    mountRef.current.appendChild(renderer.domElement)

    // ── World ─────────────────────────────────────────────────────────────────
    buildWorldMeshes(scene)

    // ── NPCs ──────────────────────────────────────────────────────────────────
    for (const npc of NPCS) {
      const g = buildNpcGroup(npc.col)
      g.position.set(npc.tx, 0.2, npc.ty); scene.add(g)
    }

    // ── Player ────────────────────────────────────────────────────────────────
    const playerClass_ = (playerClass as CharClass) || 'warrior'
    const playerGroup = buildPlayerGroup(playerClass_)
    playerGroup.position.set(19.5, 0.2, 7.0); scene.add(playerGroup)

    // Glow aura for paladin
    if (playerClass_ === 'paladin') {
      const glow = new THREE.PointLight(0xf0d020, 1.5, 3)
      glow.position.set(0, 0.8, 0)
      playerGroup.add(glow)
    }

    // ── Enemies ───────────────────────────────────────────────────────────────
    const enemies = mkEnemies()
    const enemyGroups: THREE.Group[] = enemies.map(en => {
      const g = buildEnemyGroup(en.kind)
      g.position.set(en.x, 0.2, en.y); scene.add(g)
      return g
    })
    const hpBars: THREE.Group[] = enemies.map(en => {
      const bar = makeHpBar()
      const scale = en.kind === 'dragon' ? 1.5 : en.kind === 'orc' ? 1.1 : en.kind === 'skeleton' ? 1.0 : 0.8
      bar.scale.x = scale
      const barY = en.kind === 'dragon' ? 2.6 : en.kind === 'orc' ? 1.9 : en.kind === 'skeleton' ? 1.8 : 1.2
      bar.position.set(en.x, barY, en.y); scene.add(bar)
      return bar
    })

    // ── Game state ────────────────────────────────────────────────────────────
    const resolvedCls = (playerClass as CharClass) || 'warrior'
    const gs: GS = {
      p: mkPlayer(playerName || 'HERO', resolvedCls),
      enemies, dmg: [],
      chat: [
        { name: 'SYSTEM', text: 'Welcome to PixelRealms v4! WASD=move SPACE=attack Q/W/E/R=skills', c: '#f0d020', age: 0 },
        { name: 'SYSTEM', text: 'Three.js isometric world — explore, fight, loot!', c: '#9333ea', age: 0.5 },
        { name: 'SYSTEM', text: 'Press I to open/close inventory', c: '#60d0ff', age: 1.0 },
      ],
      keys: new Set(),
      camX: 19.5, camY: 7.0,
      lastTs: 0, chatTimer: 5,
      npcBubble: null,
      attackPressed: false, dmgId: 0, itemId: 0,
    }
    gsRef.current = gs

    // ── Input ─────────────────────────────────────────────────────────────────
    const skillKeys = ['KeyQ', 'KeyW', 'KeyE', 'KeyR']
    const onKey = (e: KeyboardEvent) => {
      if (e.type === 'keydown') gs.keys.add(e.code)
      else gs.keys.delete(e.code)
      if (e.type === 'keydown') {
        if (e.code === 'Space') { e.preventDefault(); gs.attackPressed = true }
        if (e.code === 'KeyI') gs.p.inventoryOpen = !gs.p.inventoryOpen
        const si = skillKeys.indexOf(e.code)
        if (si !== -1) { e.preventDefault(); useSkill(si) }
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)

    // ── Combat helpers ────────────────────────────────────────────────────────
    function tryDropItem(ex: number, ey: number) {
      const roll = Math.random()
      if (roll > 0.55) return
      const pool = roll < 0.1
        ? ITEM_POOL.filter(i => i.rarity === 'epic')
        : roll < 0.3
          ? ITEM_POOL.filter(i => i.rarity === 'rare')
          : ITEM_POOL.filter(i => i.rarity === 'common')
      const tpl = pool[Math.floor(Math.random() * pool.length)]
      const slot = gs.p.inventory.findIndex(s => s === null)
      if (slot === -1) return
      gs.p.inventory[slot] = { ...tpl, id: gs.itemId++ }
      gs.chat.push({ name: 'LOOT', text: `Found: ${tpl.name}!`, c: tpl.rarity === 'epic' ? '#aa22ff' : tpl.rarity === 'rare' ? '#60d0ff' : '#aaaaaa', age: 0 })
      gs.dmg.push({ id: gs.dmgId++, x: ex, y: 1.8, z: ey, v: 0, c: tpl.rarity === 'epic' ? '#aa22ff' : '#f0d020', t: 1.8 })
    }

    function doPlayerAttack() {
      if (gs.p.atkTimer > 0 || gs.p.dead) return
      const { p } = gs
      const range = p.cls === 'archer' ? 5 : p.cls === 'mage' ? 3.8 : 2.2
      for (const en of gs.enemies) {
        if (en.state === 'dead') continue
        if (dist2(p.x, p.y, en.x, en.y) < range * range) {
          const baseDmg = p.atk + p.level * 2
          const dmg = baseDmg + Math.floor(Math.random() * 10)
          en.hp -= dmg
          gs.dmg.push({ id: gs.dmgId++, x: en.x, y: en.kind === 'dragon' ? 2.6 : 1.6, z: en.y, v: dmg, c: '#ff4444', t: 1 })
          if (en.hp <= 0) killEnemy(en)
        }
      }
      const atkCd: Record<CharClass, number> = { warrior: 0.5, mage: 1.0, rogue: 0.35, archer: 0.7, paladin: 0.55 }
      p.atkTimer = atkCd[p.cls] ?? 0.5
    }

    function killEnemy(en: Enemy) {
      en.state = 'dead'; en.respTimer = 20
      const { p } = gs
      p.xp += en.xp; p.gold += en.gold
      gs.dmg.push({ id: gs.dmgId++, x: en.x, y: 2.8, z: en.y, v: en.xp, c: '#f0d020', t: 1.5 })
      tryDropItem(en.x, en.y)
      while (p.xp >= p.xpNext) {
        p.xp -= p.xpNext; p.level++
        p.xpNext = Math.floor(p.xpNext * 1.6)
        p.maxHp += 18; p.hp = p.maxHp
        p.maxMp += 8; p.mp = p.maxMp
        p.atk += 3; p.def += 2
        gs.chat.push({ name: 'SYSTEM', text: `${p.name} reached Level ${p.level}!`, c: '#f0d020', age: 0 })
      }
    }

    function useSkill(idx: number) {
      const { p } = gs
      if (p.dead || p.skillCds[idx] > 0) return
      const skills = CLASS_SKILLS[p.cls]
      const sk = skills[idx]
      if (!sk || p.mp < sk.mpCost) return
      p.mp -= sk.mpCost
      p.skillCds[idx] = sk.cdMax

      if (sk.heal) {
        const healAmt = Math.floor(p.maxHp * 0.3)
        p.hp = Math.min(p.maxHp, p.hp + healAmt)
        gs.dmg.push({ id: gs.dmgId++, x: p.x, y: 1.8, z: p.y, v: healAmt, c: '#44ff88', t: 1.5 })
        return
      }
      for (const en of gs.enemies) {
        if (en.state === 'dead') continue
        const d2 = dist2(p.x, p.y, en.x, en.y)
        if (d2 < sk.range * sk.range) {
          const dmg = sk.dmg + Math.floor(Math.random() * 15) + p.level * 3
          en.hp -= dmg
          gs.dmg.push({ id: gs.dmgId++, x: en.x, y: en.kind === 'dragon' ? 2.6 : 1.6, z: en.y, v: dmg, c: '#ffcc00', t: 1.2 })
          if (en.hp <= 0) killEnemy(en)
          if (!sk.aoe) break
        }
      }
    }

    // ── Update ────────────────────────────────────────────────────────────────
    function update(dt: number) {
      dt = Math.min(dt, 0.05)
      const { p } = gs

      if (p.dead) {
        p.respTimer -= dt
        if (p.respTimer <= 0) {
          p.dead = false; p.hp = p.maxHp; p.mp = Math.floor(p.maxMp * 0.5)
          p.x = 19.5; p.y = 7.0
        }
        return
      }

      p.atkTimer = Math.max(0, p.atkTimer - dt)
      p.invTimer = Math.max(0, p.invTimer - dt)
      if (p.mp < p.maxMp) p.mp = Math.min(p.maxMp, p.mp + dt * 4)
      for (let i = 0; i < 4; i++) p.skillCds[i] = Math.max(0, p.skillCds[i] - dt)

      if (gs.attackPressed) { doPlayerAttack(); gs.attackPressed = false }

      // Movement
      let dx = 0, dy = 0
      if (gs.keys.has('KeyW') || gs.keys.has('ArrowUp')) dy -= PLAYER_SPEED * dt
      if (gs.keys.has('KeyS') || gs.keys.has('ArrowDown')) dy += PLAYER_SPEED * dt
      if (gs.keys.has('KeyA') || gs.keys.has('ArrowLeft')) dx -= PLAYER_SPEED * dt
      if (gs.keys.has('KeyD') || gs.keys.has('ArrowRight')) dx += PLAYER_SPEED * dt
      if (dx && dy) { dx *= 0.707; dy *= 0.707 }
      p.moving = dx !== 0 || dy !== 0
      if (p.moving) {
        if (Math.abs(dx) > Math.abs(dy)) p.dir = dx > 0 ? 'right' : 'left'
        else p.dir = dy > 0 ? 'down' : 'up'
      }
      const nx = p.x + dx, ny = p.y + dy
      if (canMove(nx, p.y, PW, PH)) p.x = clamp(nx, 1, MW - 1 - PW)
      if (canMove(p.x, ny, PW, PH)) p.y = clamp(ny, 1, MH - 1 - PH)
      if (p.moving) {
        p.fTimer += dt
        if (p.fTimer > 0.18) { p.fTimer = 0; p.frame = (p.frame + 1) % 2 }
      } else { p.frame = 0; p.fTimer = 0 }

      // NPC proximity
      gs.npcBubble = null
      for (let i = 0; i < NPCS.length; i++) {
        const n = NPCS[i]
        if (dist2(p.x, p.y, n.tx, n.ty) < 2.5 * 2.5) { gs.npcBubble = i; break }
      }

      // Enemy AI
      for (const en of gs.enemies) {
        if (en.state === 'dead') {
          en.respTimer -= dt
          if (en.respTimer <= 0) { en.state = 'patrol'; en.hp = en.maxHp; en.x = en.homeX; en.y = en.homeY }
          continue
        }
        en.atkTimer = Math.max(0, en.atkTimer - dt)
        en.sTimer -= dt
        const d2 = dist2(p.x, p.y, en.x, en.y)
        const agR = en.kind === 'dragon' ? 7 : en.kind === 'orc' ? 5.5 : en.kind === 'skeleton' ? 5 : 4
        const atR = en.kind === 'dragon' ? 2.2 : 1.5
        const spd = en.kind === 'dragon' ? 2.5 : en.kind === 'orc' ? 2.8 : en.kind === 'skeleton' ? 2.2 : 3.0

        if (en.state === 'patrol') {
          if (en.sTimer <= 0) {
            en.sTimer = 1.5 + Math.random() * 2
            const dirs: Dir[] = ['up', 'down', 'left', 'right']
            en.dir = dirs[Math.floor(Math.random() * 4)]
          }
          if (!p.dead && d2 < agR * agR) { en.state = 'chase'; continue }
          const ddx = (en.dir === 'right' ? spd : en.dir === 'left' ? -spd : 0) * dt
          const ddy = (en.dir === 'down' ? spd : en.dir === 'up' ? -spd : 0) * dt
          if (canMove(en.x + ddx, en.y + ddy, 0.7, 0.7)) { en.x += ddx; en.y += ddy }
          if (dist2(en.x, en.y, en.homeX, en.homeY) > 6 * 6) { en.x = en.homeX; en.y = en.homeY }
        } else if (en.state === 'chase') {
          if (p.dead || d2 > (agR * 1.6) ** 2) { en.state = 'patrol'; continue }
          if (d2 < atR * atR) { en.state = 'attack'; en.sTimer = 0.6; continue }
          const angle = Math.atan2(p.y - en.y, p.x - en.x)
          const edx = Math.cos(angle) * spd * dt, edy = Math.sin(angle) * spd * dt
          if (canMove(en.x + edx, en.y, 0.7, 0.7)) en.x += edx
          if (canMove(en.x, en.y + edy, 0.7, 0.7)) en.y += edy
          en.fTimer += dt; if (en.fTimer > 0.22) { en.fTimer = 0; en.frame = (en.frame + 1) % 2 }
        } else if (en.state === 'attack') {
          if (d2 > atR * atR * 5) { en.state = 'chase'; continue }
          en.sTimer -= dt
          if (en.sTimer <= 0 && en.atkTimer === 0) {
            const atkCd = en.kind === 'dragon' ? 2.0 : en.kind === 'orc' ? 1.4 : 1.2
            en.sTimer = atkCd
            if (!p.dead && p.invTimer === 0) {
              const baseDmg = en.kind === 'dragon' ? 38 : en.kind === 'orc' ? 22 : en.kind === 'skeleton' ? 18 : 12
              const dmg = Math.max(1, baseDmg - p.def - (p.level - 1) * 2)
              p.hp -= dmg; p.invTimer = 0.7
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

      gs.dmg = gs.dmg.filter(d => { d.t -= dt * 0.75; return d.t > 0 })
      gs.chat = gs.chat.filter(c => { c.age += dt; return c.age < 9 })
      gs.chatTimer -= dt
      if (gs.chatTimer <= 0) {
        gs.chatTimer = 5 + Math.random() * 7
        const fp = FAKE_PLAYERS[Math.floor(Math.random() * FAKE_PLAYERS.length)]
        gs.chat.push({ name: fp.name, text: FAKE_MSGS[Math.floor(Math.random() * FAKE_MSGS.length)], c: fp.c, age: 0 })
        if (gs.chat.length > 7) gs.chat = gs.chat.slice(-7)
      }
    }

    // ── Render loop ───────────────────────────────────────────────────────────
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
        const tRot = p.dir === 'right' ? -Math.PI / 2 : p.dir === 'left' ? Math.PI / 2 : p.dir === 'up' ? Math.PI : 0
        playerGroup.rotation.y = lerp(playerGroup.rotation.y, tRot, 0.22)
        if (p.moving) playerGroup.position.y = 0.2 + Math.abs(Math.sin(ts * 0.01)) * 0.08
      }

      // Enemies 3D
      for (let i = 0; i < gs.enemies.length; i++) {
        const en = gs.enemies[i]
        const eg = enemyGroups[i]
        const bar = hpBars[i]
        if (en.state === 'dead') { eg.visible = false; bar.visible = false; continue }
        eg.visible = true; bar.visible = true
        eg.position.set(en.x, 0.2, en.y)
        if (en.state !== 'patrol') eg.rotation.y = Math.atan2(p.x - en.x, p.y - en.y) + Math.PI
        if (en.kind === 'wolf') eg.position.y = 0.1 + Math.abs(Math.sin(ts * 0.008 + i)) * 0.05
        if (en.kind === 'orc' && en.state === 'attack') {
          eg.rotation.z = Math.sin(ts * 0.015 + i) * 0.1
        } else { eg.rotation.z = 0 }
        if (en.kind === 'dragon') eg.position.y = 0.2 + Math.abs(Math.sin(ts * 0.004 + i)) * 0.14
        bar.position.set(
          en.x,
          en.kind === 'dragon' ? 2.8 : en.kind === 'orc' ? 2.0 : en.kind === 'skeleton' ? 1.9 : 1.3,
          en.y
        )
        const fillMesh = bar.getObjectByName('fill') as THREE.Mesh | undefined
        if (fillMesh) {
          const ratio = en.hp / en.maxHp
          fillMesh.scale.x = Math.max(0.001, ratio)
          fillMesh.position.x = (ratio - 1) * 0.5
          ;(fillMesh.material as THREE.MeshLambertMaterial).color.setHex(
            ratio > 0.5 ? 0x00ff44 : ratio > 0.25 ? 0xffaa00 : 0xff2222
          )
        }
      }

      // Camera follow
      gs.camX = lerp(gs.camX, p.x, 0.06)
      gs.camY = lerp(gs.camY, p.y, 0.06)
      gs.camX = clamp(gs.camX, CAM_SIZE, MW - CAM_SIZE)
      gs.camY = clamp(gs.camY, CAM_SIZE, MH - CAM_SIZE)
      const ISO_X = 13, ISO_Y = 18, ISO_Z = 13
      camera.position.set(gs.camX + ISO_X, ISO_Y, gs.camY + ISO_Z)
      camera.lookAt(gs.camX, 0.5, gs.camY)

      // Project damage numbers
      for (const d of gs.dmg) {
        const v3 = new THREE.Vector3(d.x, d.y + (1 - d.t) * 0.8, d.z).project(camera)
        d.screen = { x: (v3.x + 1) / 2 * CW, y: (-v3.y + 1) / 2 * CH }
      }

      renderer.render(scene, camera)

      const npcMsg = gs.npcBubble !== null
        ? NPCS[gs.npcBubble].msgs[Math.floor(Date.now() / 4000) % NPCS[gs.npcBubble].msgs.length]
        : null

      setHud({
        hp: gs.p.hp, maxHp: gs.p.maxHp,
        mp: Math.floor(gs.p.mp), maxMp: gs.p.maxMp,
        xp: gs.p.xp, xpNext: gs.p.xpNext, level: gs.p.level,
        gold: gs.p.gold, cls: gs.p.cls, name: gs.p.name,
        skills: CLASS_SKILLS[gs.p.cls].map((s, i) => ({
          key: s.key, name: s.name,
          cd: gs.p.skillCds[i], cdMax: s.cdMax,
        })),
        inventory: gs.p.inventory.map(item =>
          item ? { id: item.id, name: item.name, type: item.type, rarity: item.rarity, color: item.color } : null
        ),
        inventoryOpen: gs.p.inventoryOpen,
        playerX: gs.p.x, playerY: gs.p.y, mapW: MW, mapH: MH,
        enemies: gs.enemies.map(en => ({ x: en.x, y: en.y, state: en.state, kind: en.kind })),
        chat: [...gs.chat],
        dead: gs.p.dead, respTimer: gs.p.respTimer,
        dmg: gs.dmg.map(d => ({ ...d })),
        npcMsg,
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

  return (
    <div className="relative select-none" style={{ width: CW, maxWidth: '100%' }}>
      <div
        ref={mountRef}
        style={{ width: CW, height: CH, maxWidth: '100%', overflow: 'hidden', display: 'block' }}
      />
      <GameHUD hud={hud} canvasW={CW} canvasH={CH} />
    </div>
  )
}
