'use client'

import { useEffect, useRef } from 'react'
import type PhaserType from 'phaser'

export interface HUDState {
  hp: number
  maxHp: number
  mp: number
  maxMp: number
  xp: number
  xpNext: number
  level: number
  gold: number
  playerName: string
  playerClass: string
  enemyCount: number
  skillCooldowns: number[]
  chatMessages: { name: string; text: string; color: string; age: number }[]
  dead: boolean
  respTimer: number
}

interface Props {
  playerName: string
  playerClass: string
  onHUDUpdate: (state: HUDState) => void
}

type EnemyType = 'skeleton' | 'goblin' | 'demon' | 'dragon'
type CharClass = 'warrior' | 'mage' | 'rogue' | 'archer' | 'knight'

const FS = 32    // frame size
const TS = 32    // tile size
const MW = 80    // map width in tiles
const MH = 80    // map height in tiles

const CLASS_PAL: Record<CharClass, { body: string; head: string; hair: string; weapon: string; accent: string }> = {
  warrior: { body: '#b8c8d8', head: '#f5c580', hair: '#6b3a0e', weapon: '#9898c8', accent: '#4488dd' },
  mage:    { body: '#8822cc', head: '#f0c890', hair: '#22224a', weapon: '#cc88ff', accent: '#dd44ff' },
  rogue:   { body: '#2a2a3e', head: '#f5c580', hair: '#1a1a1a', weapon: '#66bb66', accent: '#33ff77' },
  archer:  { body: '#2a6a22', head: '#f5c580', hair: '#6b2a0e', weapon: '#7a4a18', accent: '#ffcc33' },
  knight:  { body: '#808090', head: '#9090a0', hair: '#444444', weapon: '#c8c8c0', accent: '#ff8833' },
}

const ENEMY_PAL: Record<EnemyType, { body: string; detail: string; eyes: string; weapon: string }> = {
  skeleton: { body: '#deded0', detail: '#aeae98', eyes: '#dd1111', weapon: '#aaaaaa' },
  goblin:   { body: '#3a9a3a', detail: '#1a6a1a', eyes: '#ffcc00', weapon: '#7a3a10' },
  demon:    { body: '#cc1111', detail: '#880000', eyes: '#ffaa00', weapon: '#ff2222' },
  dragon:   { body: '#1155aa', detail: '#0033aa', eyes: '#ffff00', weapon: '#3388ff' },
}

// ── Sprite sheet generators ───────────────────────────────────────────────────

function makeCharSheet(cls: CharClass): HTMLCanvasElement {
  // 4 cols × 8 rows: [walk_d, walk_u, walk_l, walk_r, attack, idle, death, hurt]
  const canvas = document.createElement('canvas')
  canvas.width = FS * 4
  canvas.height = FS * 8
  const ctx = canvas.getContext('2d')!
  const p = CLASS_PAL[cls]
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 4; col++) {
      _drawCharFrame(ctx, col * FS, row * FS, p, row, col)
    }
  }
  return canvas
}

function _drawCharFrame(
  ctx: CanvasRenderingContext2D,
  ox: number, oy: number,
  p: CharClass extends keyof typeof CLASS_PAL ? (typeof CLASS_PAL)[CharClass] : never,
  row: number, col: number
) {
  const bob   = row <= 3 ? [0, -1, 0, 1][col] : 0
  const legA  = row <= 3 ? [0, 3,  0, -3][col] : 0
  const legB  = row <= 3 ? [0, -3, 0,  3][col] : 0

  if (row === 6) {
    // Death — fall sideways
    ctx.save()
    ctx.translate(ox + 16, oy + 22)
    ctx.rotate(col * 0.45)
    ctx.fillStyle = p.body;   ctx.fillRect(-8, -10, 10, 8)
    ctx.fillStyle = p.head;   ctx.fillRect(-6, -18, 9, 8)
    ctx.fillStyle = p.hair;   ctx.fillRect(-6, -18, 9, 3)
    ctx.restore()
    return
  }

  if (row === 4) {
    // Attack — draw body then animated weapon
    _drawCharBody(ctx, ox, oy, p, bob, 0, 0)
    ctx.fillStyle = p.weapon
    const swing = [-2, -8, -4, 0][col]
    ctx.fillRect(ox + 21, oy + 8 + bob + swing, 3, 13)
    ctx.fillRect(ox + 18, oy + 8 + bob + swing, 9, 3)
    return
  }

  _drawCharBody(ctx, ox, oy, p, bob, legA, legB)

  // Weapon per direction
  ctx.fillStyle = p.weapon
  if (row === 3) {
    ctx.fillRect(ox + 22, oy + 8 + bob, 2, 13); ctx.fillRect(ox + 20, oy + 8 + bob, 6, 2)
  } else if (row === 2) {
    ctx.fillRect(ox + 8,  oy + 8 + bob, 2, 13); ctx.fillRect(ox + 6,  oy + 8 + bob, 6, 2)
  } else {
    ctx.fillRect(ox + 22, oy + 10 + bob, 2, 12); ctx.fillRect(ox + 20, oy + 10 + bob, 6, 2)
  }
}

function _drawCharBody(
  ctx: CanvasRenderingContext2D,
  ox: number, oy: number,
  p: (typeof CLASS_PAL)[CharClass],
  bob: number, legA: number, legB: number
) {
  // Torso
  ctx.fillStyle = p.body
  ctx.fillRect(ox + 11, oy + 14 + bob, 10, 9)
  // Arms
  ctx.fillRect(ox + 7,  oy + 14 + bob, 4, 7)
  ctx.fillRect(ox + 21, oy + 14 + bob, 4, 7)
  // Belt
  ctx.fillStyle = p.accent
  ctx.fillRect(ox + 11, oy + 20 + bob, 10, 2)
  // Head
  ctx.fillStyle = p.head
  ctx.fillRect(ox + 11, oy + 5 + bob, 10, 9)
  // Hair
  ctx.fillStyle = p.hair
  ctx.fillRect(ox + 11, oy + 5 + bob, 10, 4)
  ctx.fillRect(ox + 11, oy + 9 + bob, 2, 3)
  ctx.fillRect(ox + 19, oy + 9 + bob, 2, 3)
  // Eyes
  ctx.fillStyle = '#1a1a1a'
  ctx.fillRect(ox + 13, oy + 10 + bob, 2, 2)
  ctx.fillRect(ox + 17, oy + 10 + bob, 2, 2)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(ox + 13, oy + 10 + bob, 1, 1)
  ctx.fillRect(ox + 17, oy + 10 + bob, 1, 1)
  // Legs
  const lx = Math.round(legA / 2)
  const rx = Math.round(legB / 2)
  ctx.fillStyle = '#3a2a1a'
  ctx.fillRect(ox + 11 + lx, oy + 23 + bob, 4, 7)
  ctx.fillRect(ox + 17 + rx, oy + 23 + bob, 4, 7)
  // Boots
  ctx.fillStyle = '#2a1a0a'
  ctx.fillRect(ox + 10 + lx, oy + 28 + bob, 6, 2)
  ctx.fillRect(ox + 16 + rx, oy + 28 + bob, 6, 2)
}

function makeEnemySheet(type: EnemyType): HTMLCanvasElement {
  // 4 cols × 4 rows: [walk, attack, death, idle]
  const canvas = document.createElement('canvas')
  canvas.width = FS * 4
  canvas.height = FS * 4
  const ctx = canvas.getContext('2d')!
  const p = ENEMY_PAL[type]
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      _drawEnemyFrame(ctx, col * FS, row * FS, p, type, row, col)
    }
  }
  return canvas
}

function _drawEnemyFrame(
  ctx: CanvasRenderingContext2D,
  ox: number, oy: number,
  p: (typeof ENEMY_PAL)[EnemyType],
  type: EnemyType,
  row: number, col: number
) {
  const bob = [0, -2, 0, 2][col]

  if (row === 2) {
    // Death
    ctx.save()
    ctx.translate(ox + 16, oy + 22)
    ctx.rotate(col * 0.5)
    ctx.fillStyle = p.body; ctx.fillRect(-8, -12, 16, 10)
    ctx.restore()
    return
  }

  if (type === 'skeleton') {
    ctx.fillStyle = p.body
    ctx.fillRect(ox + 12, oy + 5 + bob, 8, 8)
    ctx.fillStyle = p.eyes
    ctx.fillRect(ox + 13, oy + 9 + bob, 2, 2)
    ctx.fillRect(ox + 17, oy + 9 + bob, 2, 2)
    ctx.fillStyle = p.detail
    ctx.fillRect(ox + 14, oy + 12 + bob, 4, 1)
    ctx.fillStyle = p.body
    ctx.fillRect(ox + 13, oy + 13 + bob, 3, 8)
    ctx.fillRect(ox + 10, oy + 15 + bob, 12, 2)
    ctx.fillRect(ox + 10, oy + 18 + bob, 12, 2)
    ctx.fillRect(ox + 11, oy + 21 + bob, 3, 7)
    ctx.fillRect(ox + 18, oy + 21 + bob, 3, 7)
    if (row <= 1) {
      ctx.fillStyle = p.weapon
      const swingY = row === 1 ? [0, -6, -10, -6][col] : 0
      ctx.fillRect(ox + 22, oy + 7 + bob + swingY, 2, 12)
      ctx.fillRect(ox + 20, oy + 7 + bob + swingY, 6, 2)
    }
  } else if (type === 'goblin') {
    ctx.fillStyle = p.body
    ctx.fillRect(ox + 10, oy + 6 + bob, 12, 9)
    ctx.fillRect(ox + 11, oy + 15 + bob, 10, 8)
    ctx.fillStyle = p.detail
    ctx.fillRect(ox + 9,  oy + 5 + bob, 3, 5)
    ctx.fillRect(ox + 20, oy + 5 + bob, 3, 5)
    ctx.fillStyle = p.eyes
    ctx.fillRect(ox + 12, oy + 10 + bob, 2, 2)
    ctx.fillRect(ox + 18, oy + 10 + bob, 2, 2)
    ctx.fillStyle = p.body
    ctx.fillRect(ox + 8,  oy + 16 + bob, 3, 5)
    ctx.fillRect(ox + 21, oy + 16 + bob, 3, 5)
    ctx.fillRect(ox + 11, oy + 23 + bob, 4, 5)
    ctx.fillRect(ox + 17, oy + 23 + bob, 4, 5)
    ctx.fillStyle = p.weapon
    const swingY2 = row === 1 ? [0, -5, -8, -5][col] : 0
    ctx.fillRect(ox + 23, oy + 8 + bob + swingY2, 4, 12)
    ctx.fillRect(ox + 22, oy + 7 + bob + swingY2, 6, 4)
  } else if (type === 'demon') {
    ctx.fillStyle = p.body
    ctx.fillRect(ox + 9,  oy + 5 + bob, 14, 11)
    ctx.fillRect(ox + 8,  oy + 16 + bob, 16, 10)
    ctx.fillStyle = p.detail
    ctx.fillRect(ox + 9,  oy + 1 + bob, 3, 6)
    ctx.fillRect(ox + 20, oy + 1 + bob, 3, 6)
    ctx.fillStyle = p.eyes
    ctx.fillRect(ox + 11, oy + 9 + bob, 3, 3)
    ctx.fillRect(ox + 18, oy + 9 + bob, 3, 3)
    ctx.fillStyle = p.detail
    ctx.fillRect(ox + 0,  oy + 14 + bob, 9, 9)
    ctx.fillRect(ox + 23, oy + 14 + bob, 9, 9)
    ctx.fillStyle = p.body
    ctx.fillRect(ox + 6,  oy + 16 + bob, 4, 6)
    ctx.fillRect(ox + 22, oy + 16 + bob, 4, 6)
    ctx.fillRect(ox + 9,  oy + 26 + bob, 6, 5)
    ctx.fillRect(ox + 17, oy + 26 + bob, 6, 5)
  } else if (type === 'dragon') {
    ctx.fillStyle = p.body
    ctx.fillRect(ox + 6,  oy + 4 + bob, 14, 14)
    ctx.fillRect(ox + 4,  oy + 3 + bob, 10, 10)
    ctx.fillStyle = p.detail
    ctx.fillRect(ox + 3,  oy + 5 + bob, 4, 5)
    ctx.fillStyle = p.eyes
    ctx.fillRect(ox + 5,  oy + 6 + bob, 3, 3)
    ctx.fillStyle = p.detail
    for (let i = 0; i < 4; i++) ctx.fillRect(ox + 8 + i * 4, oy + 8 + bob, 3, 2)
    ctx.fillStyle = '#224488'
    ctx.fillRect(ox + 20, oy + 5 + bob, 12, 10)
    ctx.fillRect(ox + 0,  oy + 5 + bob, 12, 10)
    ctx.fillRect(ox + 8,  oy + 18 + bob, 8, 8)
  }
}

// ── Tile painter ──────────────────────────────────────────────────────────────

function drawTile(ctx: CanvasRenderingContext2D, type: string, ox: number, oy: number) {
  const S = TS
  switch (type) {
    case 'grass':
      ctx.fillStyle = '#5a9e3a'; ctx.fillRect(ox, oy, S, S)
      ctx.fillStyle = '#4a8e2a'
      ;[[2,2],[8,5],[14,1],[1,12],[10,10],[5,8]].forEach(([dx,dy]) => ctx.fillRect(ox+dx, oy+dy, 2, 2))
      ctx.fillStyle = '#6ab040'
      ;[[4,4],[11,7],[3,14],[15,3]].forEach(([dx,dy]) => { ctx.fillRect(ox+dx, oy+dy, 1, 3) })
      break
    case 'dirt':
      ctx.fillStyle = '#9a6a30'; ctx.fillRect(ox, oy, S, S)
      ctx.fillStyle = '#8a5a20'
      ;[[3,4],[11,10],[7,2],[15,14]].forEach(([dx,dy]) => ctx.fillRect(ox+dx, oy+dy, 3, 2))
      ctx.fillStyle = '#aa7a40'
      ;[[6,7],[13,3],[1,13]].forEach(([dx,dy]) => ctx.fillRect(ox+dx, oy+dy, 2, 2))
      break
    case 'stone':
      ctx.fillStyle = '#808090'; ctx.fillRect(ox, oy, S, S)
      ctx.fillStyle = '#686878'
      ctx.fillRect(ox, oy+S/2, S, 1); ctx.fillRect(ox+S/2, oy, 1, S/2)
      ctx.fillRect(ox, oy+S/2, S/4, 1); ctx.fillRect(ox+S/4, oy+S/2, 1, S/2)
      ctx.fillStyle = '#9090a0'
      ctx.fillRect(ox+1, oy+1, 4, 4); ctx.fillRect(ox+9, oy+9, 4, 4)
      break
    case 'water':
      ctx.fillStyle = '#2060aa'; ctx.fillRect(ox, oy, S, S)
      ctx.fillStyle = '#3070ba'
      ctx.fillRect(ox, oy+6, S, 3); ctx.fillRect(ox, oy+20, S, 3)
      ctx.fillStyle = '#5090d0'
      ctx.fillRect(ox+3, oy+3, 6, 1); ctx.fillRect(ox+14, oy+15, 6, 1)
      break
    case 'dungeon':
      ctx.fillStyle = '#282838'; ctx.fillRect(ox, oy, S, S)
      ctx.fillStyle = '#181828'
      ctx.fillRect(ox, oy+S/2, S, 1); ctx.fillRect(ox+S/2, oy, 1, S)
      ctx.fillStyle = '#383848'
      ctx.fillRect(ox+1, oy+1, 3, 3)
      break
    case 'wall':
      ctx.fillStyle = '#484858'; ctx.fillRect(ox, oy, S, S)
      ctx.fillStyle = '#383848'
      ctx.fillRect(ox, oy, S, 5); ctx.fillRect(ox, oy+11, S, 5)
      ctx.fillStyle = '#585868'
      ctx.fillRect(ox+5, oy+5, 11, 6)
      ctx.fillStyle = '#686878'
      ctx.fillRect(ox+6, oy+6, 9, 4)
      break
    case 'sand':
      ctx.fillStyle = '#c8904a'; ctx.fillRect(ox, oy, S, S)
      ctx.fillStyle = '#b88040'
      ;[[4,6],[12,3],[8,14],[1,1],[15,10]].forEach(([dx,dy]) => ctx.fillRect(ox+dx, oy+dy, 2, 2))
      ctx.fillStyle = '#d8a060'
      ;[[7,8],[3,12],[11,5]].forEach(([dx,dy]) => ctx.fillRect(ox+dx, oy+dy, 2, 2))
      break
    case 'portal':
      ctx.fillStyle = '#180028'; ctx.fillRect(ox, oy, S, S)
      ctx.fillStyle = '#6600cc'
      ctx.beginPath(); ctx.arc(ox+S/2, oy+S/2, 11, 0, Math.PI*2); ctx.fill()
      ctx.fillStyle = '#aa44ff'
      ctx.beginPath(); ctx.arc(ox+S/2, oy+S/2, 7,  0, Math.PI*2); ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.beginPath(); ctx.arc(ox+S/2, oy+S/2, 3,  0, Math.PI*2); ctx.fill()
      break
    case 'path':
      ctx.fillStyle = '#b88040'; ctx.fillRect(ox, oy, S, S)
      ctx.fillStyle = '#a87030'
      ctx.fillRect(ox+1, oy+1, 7, 7); ctx.fillRect(ox+10, oy+10, 6, 6)
      ctx.fillStyle = '#c89050'
      ctx.fillRect(ox+1, oy+10, 6, 6)
      break
  }
}

// ── Map generation ────────────────────────────────────────────────────────────

function generateMap(): number[][] {
  // 0=grass 1=dirt 2=stone 3=water 4=dungeon 5=wall 6=sand 7=portal 8=path
  const map: number[][] = Array.from({ length: MH }, () => new Array(MW).fill(0))
  const cx = Math.floor(MW / 2)
  const cy = Math.floor(MH / 2)

  // Town square (stone)
  for (let y = cy-5; y <= cy+5; y++)
    for (let x = cx-5; x <= cx+5; x++)
      if (y>=0&&y<MH&&x>=0&&x<MW) map[y][x] = 2

  // Horizontal + vertical paths
  for (let x = 0; x < MW; x++) map[cy][x] = 8
  for (let y = 0; y < MH; y++) map[y][cx] = 8

  // Water (west side)
  for (let y = cy-14; y <= cy+14; y++)
    for (let x = 0; x < 7; x++)
      if (y>=0&&y<MH) map[y][x] = 3

  // Sand (NW area)
  for (let y = 0; y < cy-6; y++)
    for (let x = 8; x < cx-6; x++)
      if ((x+y)%6<3) map[y][x] = 6

  // Dungeon (SE corner)
  for (let y = cy+6; y < MH; y++) {
    for (let x = cx+6; x < MW; x++) {
      map[y][x] = 4
      if (y%8===0 && x%8!==0) map[y][x] = 5
      if (x%8===0 && y%8!==0) map[y][x] = 5
    }
  }

  // Portals
  map[cy+9][cx+9]   = 7
  map[cy+11][cx+18] = 7

  // Dirt paths (NE forest)
  for (let i = 0; i < 8; i++) {
    const py = cy - 8 + i*3
    const px = cx + 8 + i*2
    if (py>=0&&py<MH&&px>=0&&px<MW) map[py][px] = 1
  }

  return map
}

// ── Phaser scene factory ──────────────────────────────────────────────────────

interface EnemyObj {
  sprite: PhaserType.GameObjects.Sprite
  shadow: PhaserType.GameObjects.Ellipse
  hpBg: PhaserType.GameObjects.Rectangle
  hpFg: PhaserType.GameObjects.Rectangle
  hp: number
  maxHp: number
  type: EnemyType
  level: number
  atkTimer: number
  state: 'idle' | 'chase' | 'dead'
}

interface FloatTxt {
  obj: PhaserType.GameObjects.Text
  vy: number
  life: number
}

function buildScene(
  phaserCls: typeof PhaserType,
  pName: string,
  pClass: CharClass,
  onHUD: (s: HUDState) => void
): typeof PhaserType.Scene {

  const P = phaserCls

  return class GameScene extends P.Scene {
    // Player
    private px = 0
    private py = 0
    private playerSprite!: PhaserType.GameObjects.Sprite
    private playerShadow!: PhaserType.GameObjects.Ellipse
    private dir: 'walk_down'|'walk_up'|'walk_left'|'walk_right' = 'walk_down'

    // Stats
    private hp = 100; private maxHp = 100
    private mp = 60;  private maxMp = 60
    private xp = 0;   private xpNext = 100
    private level = 1; private gold = 0
    private dead = false; private respTimer = 0
    private atkTimer = 0; private invTimer = 0
    private skillCds = [0, 0, 0, 0]

    // World
    private mapData!: number[][]
    private enemies: EnemyObj[] = []
    private floats: FloatTxt[] = []
    private chat: HUDState['chatMessages'] = []
    private hudTimer = 0

    // Input
    private keysW!: PhaserType.Input.Keyboard.Key
    private keysA!: PhaserType.Input.Keyboard.Key
    private keysS!: PhaserType.Input.Keyboard.Key
    private keysD!: PhaserType.Input.Keyboard.Key
    private keySpace!: PhaserType.Input.Keyboard.Key
    private keyQ!: PhaserType.Input.Keyboard.Key
    private keyE!: PhaserType.Input.Keyboard.Key
    private keyR!: PhaserType.Input.Keyboard.Key
    private keyF!: PhaserType.Input.Keyboard.Key

    constructor() { super({ key: 'GameScene' }) }

    create() {
      const TILE_NAMES = ['grass','dirt','stone','water','dungeon','wall','sand','portal','path']

      // ── Build character sprites ──────────────────────────────────────
      const charCanvas = makeCharSheet(pClass)
      this.textures.addSpriteSheet('player', charCanvas as unknown as HTMLImageElement, { frameWidth: FS, frameHeight: FS })

      // ── Build enemy sprites ──────────────────────────────────────────
      const etypes: EnemyType[] = ['skeleton','goblin','demon','dragon']
      etypes.forEach(t => {
        const ec = makeEnemySheet(t)
        this.textures.addSpriteSheet(`e_${t}`, ec as unknown as HTMLImageElement, { frameWidth: FS, frameHeight: FS })
      })

      // ── Animations ──────────────────────────────────────────────────
      const pRows = [
        ['walk_down',0],['walk_up',1],['walk_left',2],['walk_right',3],
        ['attack',4],['idle',5],['death',6],['hurt',7],
      ] as const
      pRows.forEach(([key, row]) => {
        if (!this.anims.exists(`p_${key}`)) {
          this.anims.create({
            key: `p_${key}`,
            frames: this.anims.generateFrameNumbers('player', { start: row*4, end: row*4+3 }),
            frameRate: key.startsWith('walk') ? 8 : 5,
            repeat: key === 'death' ? 0 : -1,
          })
        }
      })

      etypes.forEach(t => {
        const eAnims = [['walk',0],['attack',1],['death',2],['idle',3]] as const
        eAnims.forEach(([key, row]) => {
          const aKey = `e_${t}_${key}`
          if (!this.anims.exists(aKey)) {
            this.anims.create({
              key: aKey,
              frames: this.anims.generateFrameNumbers(`e_${t}`, { start: row*4, end: row*4+3 }),
              frameRate: key === 'walk' ? 6 : 4,
              repeat: key === 'death' ? 0 : -1,
            })
          }
        })
      })

      // ── Render tilemap to a single canvas (fast batch draw) ─────────
      this.mapData = generateMap()
      const mapCanvas = document.createElement('canvas')
      mapCanvas.width  = MW * TS
      mapCanvas.height = MH * TS
      const mapCtx = mapCanvas.getContext('2d')!
      for (let row = 0; row < MH; row++) {
        for (let col = 0; col < MW; col++) {
          drawTile(mapCtx, TILE_NAMES[this.mapData[row][col]], col * TS, row * TS)
        }
      }
      this.textures.addCanvas('worldmap', mapCanvas)
      this.add.image(MW * TS / 2, MH * TS / 2, 'worldmap').setDepth(0)

      // ── Player ──────────────────────────────────────────────────────
      this.px = (MW/2) * TS
      this.py = (MH/2) * TS

      this.playerShadow = this.add.ellipse(this.px, this.py+12, 22, 7, 0x000000, 0.3).setDepth(1)
      this.playerSprite = this.add.sprite(this.px, this.py, 'player').setDepth(10)
      this.playerSprite.play('p_idle')

      // ── Camera ──────────────────────────────────────────────────────
      this.cameras.main.setBounds(0, 0, MW*TS, MH*TS)
      this.cameras.main.startFollow(this.playerSprite, true, 0.08, 0.08)
      this.cameras.main.setZoom(1.6)

      // ── Input ────────────────────────────────────────────────────────
      const kb = this.input.keyboard!
      this.keysW = kb.addKey('W')
      this.keysA = kb.addKey('A')
      this.keysS = kb.addKey('S')
      this.keysD = kb.addKey('D')
      this.keySpace = kb.addKey('SPACE')
      this.keyQ = kb.addKey('Q')
      this.keyE = kb.addKey('E')
      this.keyR = kb.addKey('R')
      this.keyF = kb.addKey('F')

      // ── Enemies ──────────────────────────────────────────────────────
      this._spawnInitial()

      // ── Chat ─────────────────────────────────────────────────────────
      this._chat('System',  'Welcome to PixelRealms!', '#44ff88')
      this._chat('Aria',    'LFG dungeon raid!',        '#88aaff')
      this._chat('Kron',    'WTS +5 sword 500g',        '#ffcc44')

      this.time.addEvent({ delay: 7000, callback: this._randomChat, callbackScope: this, loop: true })
      this.time.addEvent({ delay: 18000, callback: this._spawnEnemy, callbackScope: this, loop: true })

      this._sendHUD()
    }

    // ── Helpers ───────────────────────────────────────────────────────

    private _walkable(x: number, y: number): boolean {
      const col = Math.floor(x / TS)
      const row = Math.floor(y / TS)
      if (row<0||row>=MH||col<0||col>=MW) return false
      const t = this.mapData[row][col]
      return t !== 3 && t !== 5 // not water, not wall
    }

    private _float(x: number, y: number, txt: string, color: string) {
      const obj = this.add.text(x, y, txt, {
        fontFamily: '"Press Start 2P",monospace', fontSize: '7px',
        color, stroke: '#000', strokeThickness: 2,
      }).setDepth(200)
      this.floats.push({ obj, vy: -1.4, life: 1.8 })
    }

    private _chat(name: string, text: string, color: string) {
      this.chat.push({ name, text, color, age: 0 })
      if (this.chat.length > 8) this.chat.shift()
    }

    private _randomChat() {
      const pool: [string, string, string][] = [
        ['Aria','Who wants to party?','#88aaff'],
        ['Kron','Just found +3 axe!','#ffcc44'],
        ['Zyla','Dragon boss is SE!','#ff8844'],
        ['Mira','Healing for tips 💚','#44ff88'],
        ['Brom','Join guild VALOR','#cc66ff'],
        ['Asha','Watch out for demons!','#ff4444'],
        ['Fenn','Trade rogue daggers?','#33ff77'],
        ['Rok','Level 20 finally!','#ffff44'],
      ]
      const [n,t,c] = pool[Math.floor(Math.random() * pool.length)]
      this._chat(n, t, c)
    }

    private _spawnAt(type: EnemyType, x: number, y: number) {
      const shadow = this.add.ellipse(x, y+12, 18, 5, 0x000000, 0.25).setDepth(1)
      const sprite = this.add.sprite(x, y, `e_${type}`).setDepth(5)
      sprite.play(`e_${type}_idle`)

      const hpMap: Record<EnemyType, number> = { skeleton:30, goblin:50, demon:90, dragon:220 }
      const lvMap:  Record<EnemyType, number> = { skeleton:1,  goblin:2,  demon:5,  dragon:10 }
      const lvl = lvMap[type]
      const maxHp = hpMap[type] + (lvl-1)*20

      const hpBg = this.add.rectangle(x, y-22, 28, 4, 0x220000).setDepth(6)
      const hpFg = this.add.rectangle(x-14, y-22, 28, 4, 0x22cc22).setOrigin(0, 0.5).setDepth(7)

      this.enemies.push({ sprite, shadow, hpBg, hpFg, hp: maxHp, maxHp, type, level: lvl, atkTimer: Math.random()*2, state: 'idle' })
    }

    private _spawnInitial() {
      const types: EnemyType[] = ['skeleton','goblin','skeleton','goblin','demon','skeleton','goblin','goblin','demon','skeleton','dragon']
      const cx = (MW/2)*TS, cy = (MH/2)*TS
      types.forEach((t, i) => {
        const angle = (i / types.length) * Math.PI * 2
        const dist = 220 + Math.random() * 380
        this._spawnAt(t, cx + Math.cos(angle)*dist, cy + Math.sin(angle)*dist)
      })
    }

    private _spawnEnemy() {
      const pool: EnemyType[] = ['skeleton','goblin','skeleton','goblin','demon']
      const t = pool[Math.floor(Math.random() * pool.length)]
      const angle = Math.random() * Math.PI * 2
      const dist = 550 + Math.random() * 200
      this._spawnAt(t, this.px + Math.cos(angle)*dist, this.py + Math.sin(angle)*dist)
    }

    private _killEnemy(e: EnemyObj) {
      e.state = 'dead'
      e.sprite.play(`e_${e.type}_death`, true)
      const gld = Math.floor(e.level*5 + Math.random()*20)
      const xpGain = Math.floor(e.level*15 + Math.random()*10)
      this.gold += gld
      this.xp += xpGain
      this._float(e.sprite.x, e.sprite.y-30, `+${gld}g`, '#ffd700')
      this._float(e.sprite.x, e.sprite.y-45, `+${xpGain}xp`, '#44aaff')
      while (this.xp >= this.xpNext) {
        this.xp -= this.xpNext
        this.level++
        this.xpNext = Math.floor(100 * Math.pow(1.3, this.level-1))
        this.maxHp += 15; this.hp = this.maxHp
        this.maxMp += 5;  this.mp = this.maxMp
        this._float(this.px, this.py-60, '✨ LEVEL UP!', '#ffff00')
      }
      e.hpBg.destroy(); e.hpFg.destroy()
      this.time.delayedCall(1400, () => {
        e.sprite.destroy(); e.shadow.destroy()
        this.enemies = this.enemies.filter(x => x !== e)
      })
    }

    private _attack() {
      if (this.atkTimer > 0 || this.dead) return
      this.atkTimer = 0.45
      this.playerSprite.play('p_attack', true)
      const reach = 65
      this.enemies.forEach(e => {
        if (e.state === 'dead') return
        const dx = e.sprite.x - this.px, dy = e.sprite.y - this.py
        if (Math.sqrt(dx*dx+dy*dy) > reach) return
        const base: Record<CharClass, number> = { warrior:18, mage:12, rogue:22, archer:15, knight:20 }
        const dmg = Math.floor((base[pClass]||15) * (0.8 + Math.random()*0.4) + this.level*2)
        const crit = Math.random() < 0.15
        const final = crit ? dmg*2 : dmg
        e.hp -= final
        this._float(e.sprite.x, e.sprite.y-20, crit ? `⚡${final}!` : `-${final}`, crit ? '#ffff00' : '#ff4444')
        this._refreshHPBar(e)
        if (e.hp <= 0) this._killEnemy(e)
      })
    }

    private _refreshHPBar(e: EnemyObj) {
      const r = Math.max(0, e.hp / e.maxHp)
      e.hpFg.width = 28 * r
      e.hpFg.setFillStyle(r > 0.5 ? 0x22cc22 : r > 0.25 ? 0xcc8822 : 0xcc2222)
    }

    private _skill(idx: number) {
      if (this.skillCds[idx] > 0 || this.dead) return
      const mpCost = [15, 20, 10, 30][idx]
      if (this.mp < mpCost) { this._float(this.px, this.py-30, 'No MP!', '#4488ff'); return }
      this.mp -= mpCost
      this.skillCds[idx] = [3, 8, 5, 12][idx]

      if (idx === 0) {
        // Whirlwind
        this.enemies.forEach(e => {
          if (e.state==='dead') return
          const dx = e.sprite.x-this.px, dy = e.sprite.y-this.py
          if (Math.sqrt(dx*dx+dy*dy) > 130) return
          const dmg = Math.floor(28 + this.level*3)
          e.hp -= dmg
          this._float(e.sprite.x, e.sprite.y-20, `-${dmg}`, '#ff8844')
          this._refreshHPBar(e)
          if (e.hp <= 0) this._killEnemy(e)
        })
        this._float(this.px, this.py-45, '⚡ WHIRLWIND!', '#ffcc44')
      } else if (idx === 1) {
        // Big strike on nearest enemy
        const alive = this.enemies.filter(e => e.state!=='dead')
        const target = alive.reduce<EnemyObj|null>((best, e) => {
          const d = Math.hypot(e.sprite.x-this.px, e.sprite.y-this.py)
          if (!best) return e
          return d < Math.hypot(best.sprite.x-this.px, best.sprite.y-this.py) ? e : best
        }, null)
        if (target) {
          const dmg = Math.floor(55 + this.level*5)
          target.hp -= dmg
          this._float(target.sprite.x, target.sprite.y-20, `-${dmg}`, '#ff4400')
          this._refreshHPBar(target)
          if (target.hp <= 0) this._killEnemy(target)
        }
        const names: Record<CharClass, string> = { mage:'🔥 FIREBALL!', warrior:'⚔ CHARGE!', rogue:'🗡 BACKSTAB!', archer:'🏹 VOLLEY!', knight:'🛡 SLAM!' }
        this._float(this.px, this.py-45, names[pClass]||'💥 BLAST!', '#ff6622')
      } else if (idx === 2) {
        const heal = Math.floor(30 + this.level*2)
        this.hp = Math.min(this.maxHp, this.hp + heal)
        this._float(this.px, this.py-40, `+${heal} HP`, '#44ff44')
      } else {
        // Ultimate
        this.enemies.forEach(e => {
          if (e.state==='dead') return
          const dmg = Math.floor(90 + this.level*8)
          e.hp -= dmg
          this._float(e.sprite.x, e.sprite.y-20, `-${dmg}`, '#ff0044')
          this._refreshHPBar(e)
          if (e.hp <= 0) this._killEnemy(e)
        })
        this._float(this.px, this.py-50, '💥 ULTIMATE!', '#ff00ff')
      }
    }

    private _sendHUD() {
      onHUD({
        hp: Math.max(0, Math.round(this.hp)),
        maxHp: this.maxHp,
        mp: Math.max(0, Math.round(this.mp)),
        maxMp: this.maxMp,
        xp: this.xp, xpNext: this.xpNext,
        level: this.level, gold: this.gold,
        playerName: pName, playerClass: pClass,
        enemyCount: this.enemies.filter(e=>e.state!=='dead').length,
        skillCooldowns: [...this.skillCds],
        chatMessages: [...this.chat],
        dead: this.dead, respTimer: this.respTimer,
      })
    }

    // ── Update loop ───────────────────────────────────────────────────

    update(_time: number, delta: number) {
      const dt = delta / 1000

      // Timers
      this.atkTimer  = Math.max(0, this.atkTimer - dt)
      this.invTimer  = Math.max(0, this.invTimer - dt)
      this.skillCds  = this.skillCds.map(c => Math.max(0, c - dt))
      this.mp        = Math.min(this.maxMp, this.mp + dt * 3)
      this.chat      = this.chat.map(m => ({ ...m, age: m.age + dt }))

      // Respawn
      if (this.dead) {
        this.respTimer -= dt
        if (this.respTimer <= 0) {
          this.dead = false; this.hp = this.maxHp; this.mp = this.maxMp
          this.playerSprite.play('p_idle')
        }
        this.hudTimer += dt
        if (this.hudTimer >= 0.15) { this.hudTimer = 0; this._sendHUD() }
        return
      }

      // Movement
      const spd = 148
      let vx = 0, vy = 0
      if (this.keysA.isDown) { vx = -spd; this.dir = 'walk_left'  }
      if (this.keysD.isDown) { vx =  spd; this.dir = 'walk_right' }
      if (this.keysW.isDown) { vy = -spd; this.dir = 'walk_up'    }
      if (this.keysS.isDown) { vy =  spd; this.dir = 'walk_down'  }
      if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707 }

      const nx = this.px + vx*dt
      const ny = this.py + vy*dt
      if (vx !== 0 && this._walkable(nx-10, this.py) && this._walkable(nx+10, this.py)) this.px = nx
      if (vy !== 0 && this._walkable(this.px, ny-10) && this._walkable(this.px, ny+10)) this.py = ny

      this.px = P.Math.Clamp(this.px, 16, MW*TS-16)
      this.py = P.Math.Clamp(this.py, 16, MH*TS-16)

      this.playerSprite.setPosition(this.px, this.py)
      this.playerShadow.setPosition(this.px, this.py+12)
      this.playerSprite.setDepth(this.py * 0.01 + 10)

      // Animations
      if (this.atkTimer < 0.3) {
        const animKey = (vx !== 0 || vy !== 0) ? `p_${this.dir}` : 'p_idle'
        if (this.playerSprite.anims.currentAnim?.key !== animKey) {
          this.playerSprite.play(animKey)
        }
      }

      // Combat input
      if (P.Input.Keyboard.JustDown(this.keySpace)) this._attack()
      if (P.Input.Keyboard.JustDown(this.keyQ))     this._skill(0)
      if (P.Input.Keyboard.JustDown(this.keyE))     this._skill(1)
      if (P.Input.Keyboard.JustDown(this.keyR))     this._skill(2)
      if (P.Input.Keyboard.JustDown(this.keyF))     this._skill(3)

      // Enemy AI
      this.enemies.forEach(e => {
        if (e.state === 'dead') return
        const dx = this.px - e.sprite.x, dy = this.py - e.sprite.y
        const dist = Math.sqrt(dx*dx + dy*dy)

        if (dist < 480 && dist > 1) {
          e.state = 'chase'
          const spd2: Record<EnemyType,number> = { skeleton:58, goblin:76, demon:95, dragon:45 }
          const s = spd2[e.type] || 60
          e.sprite.x += (dx/dist)*s*dt
          e.sprite.y += (dy/dist)*s*dt
          if (e.sprite.anims.currentAnim?.key !== `e_${e.type}_walk`) e.sprite.play(`e_${e.type}_walk`)
        } else {
          if (e.sprite.anims.currentAnim?.key !== `e_${e.type}_idle`) e.sprite.play(`e_${e.type}_idle`)
        }

        if (dist < 44) {
          e.atkTimer -= dt
          if (e.atkTimer <= 0) {
            e.atkTimer = 1.8 + Math.random()
            e.sprite.play(`e_${e.type}_attack`, true)
            this.time.delayedCall(350, () => {
              if (e.state !== 'dead') e.sprite.play(`e_${e.type}_walk`)
            })
            if (this.invTimer <= 0) {
              const dmg = Math.floor(e.level*8 + Math.random()*10)
              this.hp -= dmg
              this.invTimer = 0.6
              this._float(this.px, this.py-20, `-${dmg}`, '#ff2222')
              if (this.hp <= 0) {
                this.hp = 0; this.dead = true; this.respTimer = 5
                this.playerSprite.play('p_death', true)
                this._float(this.px, this.py-40, '☠ YOU DIED', '#ff0000')
              }
            }
          }
        }

        e.sprite.setDepth(e.sprite.y*0.01 + 5)
        e.shadow.setPosition(e.sprite.x, e.sprite.y+12)
        e.hpBg.setPosition(e.sprite.x, e.sprite.y-22)
        e.hpFg.setPosition(e.sprite.x-14, e.sprite.y-22)
      })

      // Floating texts
      this.floats = this.floats.filter(ft => {
        ft.obj.y += ft.vy
        ft.life -= dt
        ft.obj.setAlpha(Math.min(1, ft.life * 1.8))
        if (ft.life <= 0) { ft.obj.destroy(); return false }
        return true
      })

      // HUD
      this.hudTimer += dt
      if (this.hudTimer >= 0.1) { this.hudTimer = 0; this._sendHUD() }
    }
  }
}

// ── React component ───────────────────────────────────────────────────────────

export default function PhaserGame({ playerName, playerClass, onHUDUpdate }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const gameRef      = useRef<PhaserType.Game | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const container = containerRef.current

    const init = async () => {
      const { default: Phaser } = await import('phaser')
      if (gameRef.current) { gameRef.current.destroy(true); gameRef.current = null }

      const Scene = buildScene(Phaser, playerName, playerClass as CharClass, onHUDUpdate)

      gameRef.current = new Phaser.Game({
        type: Phaser.AUTO,
        parent: container,
        width: container.clientWidth || 800,
        height: 520,
        backgroundColor: '#0a0a15',
        scene: [Scene],
        audio: { noAudio: true },
        pixelArt: true,
        antialias: false,
        roundPixels: true,
        scale: {
          mode: Phaser.Scale.RESIZE,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
      })
    }

    init()
    return () => { gameRef.current?.destroy(true); gameRef.current = null }
  }, [playerName, playerClass, onHUDUpdate])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: 520, background: '#0a0a15', cursor: 'crosshair', outline: 'none' }}
      tabIndex={0}
      onClick={() => containerRef.current?.focus()}
    />
  )
}
