'use client'

import { useEffect, useRef, useCallback } from 'react'
import type Phaser from 'phaser'

// ── Types ─────────────────────────────────────────────────────────────────────
export type ClassType = 'warrior' | 'mage' | 'rogue' | 'archer' | 'paladin'
export type EnemyType = 'skeleton' | 'orc' | 'wolf' | 'dragon'

export interface HUDState {
  playerName: string
  playerClass: ClassType
  level: number
  hp: number
  maxHp: number
  mp: number
  maxMp: number
  xp: number
  xpNext: number
  gold: number
  skillCooldowns: number[]
  chatMessages: { name: string; text: string; color: string; age: number }[]
  dead: boolean
  respTimer: number
  onlineCount: number
}

interface Props {
  playerName: string
  playerClass: string
  onHUDUpdate: (state: HUDState) => void
}

// ── Constants ─────────────────────────────────────────────────────────────────
const TILE = 16
const SCALE = 3
const MAP_W = 50
const MAP_H = 50
const GAME_W = 960
const GAME_H = 580

// Tileset frame indices (column, row) → index in 16-wide sheet
const T = {
  GRASS: 0,    // col 0
  SAND: 1,
  STONE: 2,
  DUNGEON: 3,
  WATER1: 4,
  WATER2: 5,
  DEEP: 6,
  WALL: 7,
  DUNGWALL: 8,
  DIRT: 9,
  LAVA: 10,
  // Row 1
  TREE: 16,
  BUSH: 17,
  ROCK: 18,
  TORCH: 19,
  BARREL: 20,
  CHEST: 21,
  PORTAL: 22,
}

// Character spritesheet: 12 cols × 5 rows, each frame 16×24
// Row: 0=warrior,1=mage,2=rogue,3=archer,4=paladin
// Cols: 0-2=walk_down, 3-5=walk_left, 6-8=walk_right, 9-11=attack

// Enemy spritesheet: 9 cols × 4 rows, each frame 24×24
// Row: 0=skeleton,1=orc,2=wolf,3=dragon
// Cols: 0-2=walk, 3-5=attack, 6-8=death

// ── Map Generation ────────────────────────────────────────────────────────────
type TileId = number

function buildMap(): TileId[] {
  const map: TileId[] = new Array(MAP_W * MAP_H).fill(T.GRASS)
  const idx = (x: number, y: number) => y * MAP_W + x

  // Town center: stone
  for (let y = 20; y < 30; y++)
    for (let x = 20; x < 30; x++)
      map[idx(x, y)] = T.STONE

  // Roads
  for (let x = 0; x < MAP_W; x++) {
    map[idx(x, 24)] = T.SAND
    map[idx(x, 25)] = T.SAND
  }
  for (let y = 0; y < MAP_H; y++) {
    map[idx(24, y)] = T.SAND
    map[idx(25, y)] = T.SAND
  }

  // Forest (northwest)
  for (let y = 0; y < 18; y++)
    for (let x = 0; x < 18; x++)
      if ((x + y) % 3 !== 0) map[idx(x, y)] = T.DEEP

  // Dungeon (northeast)
  for (let y = 0; y < 14; y++)
    for (let x = 32; x < MAP_W; x++)
      map[idx(x, y)] = T.DUNGEON

  // Dungeon walls
  for (let y = 0; y < 14; y++) {
    map[idx(32, y)] = T.DUNGWALL
    map[idx(MAP_W - 1, y)] = T.DUNGWALL
  }
  for (let x = 32; x < MAP_W; x++) {
    map[idx(x, 0)] = T.DUNGWALL
    map[idx(x, 13)] = T.DUNGWALL
  }

  // Southwest: deep grass / swamp
  for (let y = 32; y < MAP_H; y++)
    for (let x = 0; x < 18; x++)
      if ((x * 2 + y) % 4 !== 0) map[idx(x, y)] = T.DEEP

  // Southeast: lava / boss area
  for (let y = 36; y < MAP_H; y++)
    for (let x = 32; x < MAP_W; x++)
      map[idx(x, y)] = T.LAVA

  // Water lake (center-left)
  for (let y = 28; y < 36; y++)
    for (let x = 4; x < 14; x++) {
      const d = Math.sqrt((y - 32) ** 2 + (x - 9) ** 2)
      if (d < 5) map[idx(x, y)] = T.WATER1
    }

  return map
}

// ── Phaser Scene ──────────────────────────────────────────────────────────────
function createScene(
  playerName: string,
  cls: ClassType,
  onHUDUpdate: (s: HUDState) => void
): typeof Phaser.Scene {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const PhaserLib = require('phaser') as typeof Phaser

  const classRow: Record<ClassType, number> = {
    warrior: 0, mage: 1, rogue: 2, archer: 3, paladin: 4,
  }
  const classStats = {
    warrior: { maxHp: 200, maxMp: 50, atk: 32, def: 18, spd: 120 },
    mage:    { maxHp: 110, maxMp: 140, atk: 55, def: 8,  spd: 130 },
    rogue:   { maxHp: 140, maxMp: 70,  atk: 42, def: 12, spd: 160 },
    archer:  { maxHp: 130, maxMp: 80,  atk: 38, def: 10, spd: 145 },
    paladin: { maxHp: 220, maxMp: 90,  atk: 28, def: 30, spd: 110 },
  }

  class GameScene extends PhaserLib.Scene {
    // Player
    private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody
    private playerStats!: {
      hp: number; maxHp: number; mp: number; maxMp: number
      level: number; xp: number; xpNext: number; gold: number
      atk: number; def: number; spd: number
      atkTimer: number; invTimer: number; dead: boolean; respTimer: number
      skillCooldowns: number[]
    }

    // Map
    private map!: Phaser.Tilemaps.Tilemap
    private groundLayer!: Phaser.Tilemaps.TilemapLayer
    private decorLayer!: Phaser.Tilemaps.TilemapLayer
    private collideLayer!: Phaser.Tilemaps.TilemapLayer

    // Enemies
    private enemies!: Phaser.Physics.Arcade.Group
    private enemyData!: Map<Phaser.GameObjects.GameObject, {
      type: EnemyType; hp: number; maxHp: number; state: string
      xp: number; gold: number; homeX: number; homeY: number; stateTimer: number
      atkTimer: number; hpBar: Phaser.GameObjects.Graphics; label: Phaser.GameObjects.Text
    }>

    // UI
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
    private wasd!: { up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key }
    private keys!: { space: Phaser.Input.Keyboard.Key; q: Phaser.Input.Keyboard.Key; e: Phaser.Input.Keyboard.Key; r: Phaser.Input.Keyboard.Key; f: Phaser.Input.Keyboard.Key }
    private dmgTexts: { obj: Phaser.GameObjects.Text; life: number; vy: number }[] = []
    private chatMessages: HUDState['chatMessages'] = []
    private chatTimer = 5

    private readonly fakePlayers = [
      { name: 'Eeyo', color: '#ff9060' },
      { name: 'MageKing', color: '#cc66ff' },
      { name: 'ShadowBlade', color: '#44ff88' },
      { name: 'IronShield', color: '#60d0ff' },
      { name: 'ArrowStorm', color: '#ffcc44' },
    ]
    private readonly fakeMsgs = [
      'LFG dungeon raid!', 'Dragon boss is up!', 'WTS rare sword NFT',
      'Just hit level 15!', 'Guild recruiting!', 'Portal spawned NE!',
      'Dragon drops 200g!', 'Anyone have heals?', 'Orc camp is cleared',
    ]

    constructor() {
      super({ key: 'GameScene' })
    }

    preload() {
      this.load.spritesheet('characters', '/assets/characters.png', {
        frameWidth: 16, frameHeight: 24,
      })
      this.load.spritesheet('enemies', '/assets/enemies.png', {
        frameWidth: 24, frameHeight: 24,
      })
      this.load.image('tileset-img', '/assets/tileset.png')
      this.load.image('icons', '/assets/icons.png')
    }

    create() {
      const stats = classStats[cls]
      this.playerStats = {
        hp: stats.maxHp, maxHp: stats.maxHp,
        mp: stats.maxMp, maxMp: stats.maxMp,
        level: 1, xp: 0, xpNext: 100, gold: 0,
        atk: stats.atk, def: stats.def, spd: stats.spd,
        atkTimer: 0, invTimer: 0, dead: false, respTimer: 0,
        skillCooldowns: [0, 0, 0, 0],
      }

      this.chatMessages = [
        { name: 'SYSTEM', text: 'Welcome! WASD=move SPACE=attack', color: '#ffd700', age: 0 },
        { name: 'SYSTEM', text: 'Q/E/R/F = skills  I = inventory', color: '#cc88ff', age: 0 },
      ]

      this.buildTilemap()
      this.createAnimations()
      this.createPlayer()
      this.createEnemies()
      this.setupInput()
      this.setupCamera()
      this.addDecorations()
    }

    // ── Tilemap ──────────────────────────────────────────────────────────────
    buildTilemap() {
      const tileData = buildMap()

      // Create tilemap from blank
      this.map = this.make.tilemap({
        width: MAP_W, height: MAP_H,
        tileWidth: TILE, tileHeight: TILE,
      })
      const tileset = this.map.addTilesetImage('tileset-img', undefined, TILE, TILE, 0, 0)!

      // Ground layer
      this.groundLayer = this.map.createBlankLayer('ground', tileset, 0, 0, MAP_W, MAP_H)!
      this.groundLayer.setScale(SCALE)
      tileData.forEach((t, i) => {
        const x = i % MAP_W
        const y = Math.floor(i / MAP_W)
        this.groundLayer.putTileAt(t, x, y)
      })

      // Decor layer (empty, used for props)
      this.decorLayer = this.map.createBlankLayer('decor', tileset, 0, 0, MAP_W, MAP_H)!
      this.decorLayer.setScale(SCALE)

      // Collision layer (walls, water)
      this.collideLayer = this.map.createBlankLayer('collide', tileset, 0, 0, MAP_W, MAP_H)!
      this.collideLayer.setScale(SCALE)
      this.collideLayer.setAlpha(0)
      // Mark water and dungeon walls as collideable
      tileData.forEach((t, i) => {
        const x = i % MAP_W
        const y = Math.floor(i / MAP_W)
        if (t === T.WATER1 || t === T.WATER2 || t === T.DUNGWALL) {
          this.collideLayer.putTileAt(t, x, y)
        }
      })
      // Mark specific tile indices as collidable
      ;[T.WATER1, T.WATER2, T.DUNGWALL].forEach(idx => {
        this.collideLayer.setCollisionBetween(idx, idx)
      })
    }

    addDecorations() {
      // Trees in forest zone
      const treePositions = [
        [2,2],[4,5],[6,1],[8,3],[1,7],[3,9],[9,6],[11,2],[12,8],[0,10],
        [2,11],[7,13],[10,11],[14,4],[15,1],[16,6],[5,14],[13,11],[15,7],
      ]
      for (const [tx, ty] of treePositions) {
        const x = tx * TILE * SCALE + TILE * SCALE / 2
        const y = ty * TILE * SCALE + TILE * SCALE / 2
        this.decorLayer.putTileAt(T.TREE, tx, ty)
        // Add glowing circle behind tree (atmosphere)
        const gfx = this.add.graphics()
        gfx.fillStyle(0x1a4010, 0.3)
        gfx.fillCircle(x, y, 20)
      }

      // Rocks
      const rockPositions = [[6,20],[22,6],[40,20],[20,40],[9,32],[32,9]]
      for (const [tx, ty] of rockPositions) {
        this.decorLayer.putTileAt(T.ROCK, tx, ty)
      }

      // Torches near town
      const torchPositions = [[19,19],[30,19],[19,30],[30,30],[24,18],[24,31]]
      for (const [tx, ty] of torchPositions) {
        this.decorLayer.putTileAt(T.TORCH, tx, ty)
        // Torch glow
        const x = tx * TILE * SCALE + TILE * SCALE / 2
        const y = ty * TILE * SCALE + TILE * SCALE / 2
        const light = this.add.graphics()
        light.fillStyle(0xff8820, 0.12)
        light.fillCircle(x, y, 60)
        // Flicker tween
        this.tweens.add({
          targets: light,
          alpha: { from: 0.6, to: 1.0 },
          duration: 300 + Math.random() * 400,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        })
      }

      // Barrels near buildings
      const barrelPositions = [[21,21],[28,21],[21,28],[28,28]]
      for (const [tx, ty] of barrelPositions) {
        this.decorLayer.putTileAt(T.BARREL, tx, ty)
      }

      // Portal at dungeon entrance
      const portalX = 33 * TILE * SCALE
      const portalY = 7 * TILE * SCALE
      this.decorLayer.putTileAt(T.PORTAL, 33, 7)
      // Portal glow effect
      const portalGlow = this.add.graphics()
      portalGlow.fillStyle(0xcc44ff, 0.2)
      portalGlow.fillCircle(portalX, portalY, 80)
      this.tweens.add({
        targets: portalGlow,
        alpha: { from: 0.4, to: 1.0 },
        duration: 1200,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })

      // Portal label
      const portalLabel = this.add.text(portalX, portalY - 50, '[ DUNGEON PORTAL ]', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '8px',
        color: '#cc88ff',
        stroke: '#000000',
        strokeThickness: 3,
      }).setOrigin(0.5)
      this.tweens.add({
        targets: portalLabel,
        y: portalLabel.y - 4,
        duration: 1500,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })

      // Buildings (text signs)
      const buildings = [
        { tx: 21, ty: 21, label: 'TAVERN', color: '#ffcc44' },
        { tx: 27, ty: 21, label: 'MAGIC SHOP', color: '#cc88ff' },
        { tx: 21, ty: 27, label: 'FORGE', color: '#ff8844' },
        { tx: 27, ty: 27, label: 'GUILD', color: '#44ff88' },
      ]
      for (const b of buildings) {
        this.add.text(
          b.tx * TILE * SCALE + TILE * SCALE,
          b.ty * TILE * SCALE - 8,
          b.label,
          {
            fontFamily: 'monospace',
            fontSize: '9px',
            color: b.color,
            stroke: '#000000',
            strokeThickness: 3,
            backgroundColor: 'rgba(8,5,20,0.7)',
            padding: { x: 4, y: 2 },
          }
        ).setOrigin(0.5)
      }

      // Background atmospheric fog (radial gradient via graphics)
      const fog = this.add.graphics()
      fog.fillStyle(0x0a0818, 0.15)
      fog.fillRect(0, 0, MAP_W * TILE * SCALE, MAP_H * TILE * SCALE)
      fog.setDepth(-1)
    }

    // ── Animations ───────────────────────────────────────────────────────────
    createAnimations() {
      const classNames: ClassType[] = ['warrior', 'mage', 'rogue', 'archer', 'paladin']
      classNames.forEach((name, row) => {
        const base = row * 12
        this.anims.create({
          key: `${name}_walk_down`,
          frames: this.anims.generateFrameNumbers('characters', { frames: [base, base+1, base+2] }),
          frameRate: 8, repeat: -1,
        })
        this.anims.create({
          key: `${name}_walk_left`,
          frames: this.anims.generateFrameNumbers('characters', { frames: [base+3, base+4, base+5] }),
          frameRate: 8, repeat: -1,
        })
        this.anims.create({
          key: `${name}_walk_right`,
          frames: this.anims.generateFrameNumbers('characters', { frames: [base+6, base+7, base+8] }),
          frameRate: 8, repeat: -1,
        })
        this.anims.create({
          key: `${name}_attack`,
          frames: this.anims.generateFrameNumbers('characters', { frames: [base+9, base+10, base+11] }),
          frameRate: 12, repeat: 0,
        })
        this.anims.create({
          key: `${name}_idle`,
          frames: this.anims.generateFrameNumbers('characters', { frames: [base] }),
          frameRate: 1, repeat: -1,
        })
      })

      // Enemy animations
      const enemyTypes: EnemyType[] = ['skeleton', 'orc', 'wolf', 'dragon']
      enemyTypes.forEach((name, row) => {
        const base = row * 9
        this.anims.create({
          key: `${name}_walk`,
          frames: this.anims.generateFrameNumbers('enemies', { frames: [base, base+1, base+2] }),
          frameRate: 6, repeat: -1,
        })
        this.anims.create({
          key: `${name}_attack`,
          frames: this.anims.generateFrameNumbers('enemies', { frames: [base+3, base+4, base+5] }),
          frameRate: 10, repeat: 0,
        })
        this.anims.create({
          key: `${name}_death`,
          frames: this.anims.generateFrameNumbers('enemies', { frames: [base+6, base+7, base+8] }),
          frameRate: 4, repeat: 0,
        })
      })
    }

    // ── Player ───────────────────────────────────────────────────────────────
    createPlayer() {
      const startX = 24 * TILE * SCALE
      const startY = 24 * TILE * SCALE
      const row = classRow[cls]

      this.player = this.physics.add.sprite(startX, startY, 'characters', row * 12)
      this.player.setScale(SCALE)
      this.player.setCollideWorldBounds(true)
      this.player.setDepth(10)
      // Hitbox
      this.player.setBodySize(8, 10, true)
      this.player.setOffset(4, 14)
      this.player.play(`${cls}_idle`)

      // Player name tag
      const nameTag = this.add.text(0, -30, playerName, {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '7px',
        color: '#ffd700',
        stroke: '#000000',
        strokeThickness: 3,
      }).setOrigin(0.5).setDepth(11)

      const levelTag = this.add.text(0, -20, 'Lv.1', {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#ff9900',
        stroke: '#000000',
        strokeThickness: 2,
      }).setOrigin(0.5).setDepth(11)

      // Attach tags to player via update
      this.events.on('update', () => {
        if (!this.player) return
        nameTag.setPosition(this.player.x, this.player.y - 28)
        levelTag.setPosition(this.player.x, this.player.y - 18)
        levelTag.setText(`Lv.${this.playerStats.level}`)
      })

      // Collide with tilemap
      if (this.physics.add.collider) {
        this.physics.add.collider(this.player, this.collideLayer)
      }

      // Player shadow
      const shadow = this.add.ellipse(startX, startY + 16, 18, 6, 0x000000, 0.3)
      shadow.setDepth(9)
      this.events.on('update', () => {
        shadow.setPosition(this.player.x, this.player.y + 16)
      })
    }

    // ── Enemies ──────────────────────────────────────────────────────────────
    createEnemies() {
      this.enemies = this.physics.add.group()
      this.enemyData = new Map()

      const spawnData: { type: EnemyType; tx: number; ty: number; hp: number; xp: number; gold: number }[] = [
        { type: 'skeleton', tx: 5,  ty: 5,  hp: 70,  xp: 30,  gold: 12 },
        { type: 'skeleton', tx: 9,  ty: 3,  hp: 70,  xp: 30,  gold: 12 },
        { type: 'skeleton', tx: 12, ty: 8,  hp: 70,  xp: 30,  gold: 12 },
        { type: 'skeleton', tx: 35, ty: 3,  hp: 90,  xp: 45,  gold: 15 },
        { type: 'skeleton', tx: 40, ty: 7,  hp: 90,  xp: 45,  gold: 15 },
        { type: 'orc',      tx: 6,  ty: 38, hp: 130, xp: 60,  gold: 22 },
        { type: 'orc',      tx: 10, ty: 42, hp: 130, xp: 60,  gold: 22 },
        { type: 'orc',      tx: 14, ty: 40, hp: 130, xp: 60,  gold: 22 },
        { type: 'wolf',     tx: 36, ty: 40, hp: 100, xp: 50,  gold: 18 },
        { type: 'wolf',     tx: 40, ty: 38, hp: 100, xp: 50,  gold: 18 },
        { type: 'wolf',     tx: 44, ty: 42, hp: 100, xp: 50,  gold: 18 },
        { type: 'dragon',   tx: 36, ty: 44, hp: 400, xp: 250, gold: 120 },
        { type: 'dragon',   tx: 44, ty: 46, hp: 400, xp: 250, gold: 120 },
      ]

      for (const d of spawnData) {
        const worldX = d.tx * TILE * SCALE + TILE * SCALE / 2
        const worldY = d.ty * TILE * SCALE + TILE * SCALE / 2
        const rowMap: Record<EnemyType, number> = { skeleton: 0, orc: 1, wolf: 2, dragon: 3 }
        const sprite = this.physics.add.sprite(worldX, worldY, 'enemies', rowMap[d.type] * 9) as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody
        sprite.setScale(SCALE * (d.type === 'dragon' ? 1.5 : 1))
        sprite.setDepth(10)
        sprite.setBodySize(d.type === 'dragon' ? 20 : 14, d.type === 'dragon' ? 20 : 14)
        sprite.play(`${d.type}_walk`)

        // HP bar (graphics object)
        const hpBar = this.add.graphics().setDepth(12)
        const barW = d.type === 'dragon' ? 60 : 40
        hpBar.fillStyle(0x220000)
        hpBar.fillRect(-barW/2, -22, barW, 5)
        hpBar.fillStyle(0xdd2222)
        hpBar.fillRect(-barW/2, -22, barW, 5)

        const label = this.add.text(0, -30, `Lv.${d.type === 'dragon' ? 15 : d.type === 'orc' ? 8 : 5} ${d.type}`, {
          fontFamily: 'monospace',
          fontSize: '7px',
          color: d.type === 'dragon' ? '#88ff88' : d.type === 'orc' ? '#ff8844' : '#ddddaa',
          stroke: '#000', strokeThickness: 2,
        }).setOrigin(0.5).setDepth(12)

        this.enemies.add(sprite)
        this.enemyData.set(sprite, {
          type: d.type, hp: d.hp, maxHp: d.hp,
          state: 'patrol', xp: d.xp, gold: d.gold,
          homeX: worldX, homeY: worldY,
          stateTimer: Math.random() * 3, atkTimer: 0,
          hpBar, label,
        })
      }
    }

    // ── Input ────────────────────────────────────────────────────────────────
    setupInput() {
      this.cursors = this.input.keyboard!.createCursorKeys()
      this.wasd = {
        up: this.input.keyboard!.addKey('W'),
        down: this.input.keyboard!.addKey('S'),
        left: this.input.keyboard!.addKey('A'),
        right: this.input.keyboard!.addKey('D'),
      }
      this.keys = {
        space: this.input.keyboard!.addKey('SPACE'),
        q: this.input.keyboard!.addKey('Q'),
        e: this.input.keyboard!.addKey('E'),
        r: this.input.keyboard!.addKey('R'),
        f: this.input.keyboard!.addKey('F'),
      }
    }

    // ── Camera ───────────────────────────────────────────────────────────────
    setupCamera() {
      this.cameras.main.setBounds(0, 0, MAP_W * TILE * SCALE, MAP_H * TILE * SCALE)
      this.cameras.main.startFollow(this.player, true, 0.1, 0.1)
      this.cameras.main.setZoom(1)
      // Dark vignette
      this.cameras.main.setBackgroundColor('#0a0818')
    }

    // ── Combat ───────────────────────────────────────────────────────────────
    doAttack() {
      const p = this.playerStats
      if (p.atkTimer > 0 || p.dead) return
      const range = cls === 'archer' ? 200 : cls === 'mage' ? 180 : 120

      this.player.play(`${cls}_attack`, true)
      this.player.once('animationcomplete', () => {
        if (!this.playerStats.dead) this.player.play(`${cls}_idle`)
      })

      let hitAny = false
      this.enemies.getChildren().forEach(obj => {
        const sprite = obj as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody
        const data = this.enemyData.get(sprite)
        if (!data || data.state === 'dead') return
        const dist = PhaserLib.Math.Distance.Between(
          this.player.x, this.player.y, sprite.x, sprite.y
        )
        if (dist <= range) {
          const dmg = Math.max(1, p.atk + Math.floor(Math.random() * 15))
          data.hp -= dmg
          hitAny = true
          this.showDamageNumber(sprite.x, sprite.y - 20, `-${dmg}`, '#ff4444')
          this.spawnHitParticles(sprite.x, sprite.y, 0xff4444)

          if (data.hp <= 0) {
            data.state = 'dead'
            sprite.play(`${data.type}_death`)
            sprite.once('animationcomplete', () => {
              this.tweens.add({
                targets: sprite,
                alpha: 0,
                duration: 800,
                onComplete: () => {
                  sprite.setActive(false).setVisible(false)
                  data.hpBar.setVisible(false)
                  data.label.setVisible(false)
                  // Respawn after 20s
                  this.time.delayedCall(20000, () => {
                    data.hp = data.maxHp
                    data.state = 'patrol'
                    sprite.setPosition(data.homeX, data.homeY)
                    sprite.setAlpha(1).setActive(true).setVisible(true)
                    data.hpBar.setVisible(true)
                    data.label.setVisible(true)
                    sprite.play(`${data.type}_walk`)
                  })
                },
              })
            })
            p.xp += data.xp
            p.gold += data.gold
            this.showDamageNumber(sprite.x, sprite.y - 40, `+${data.xp}xp`, '#ffd700')
            this.spawnHitParticles(sprite.x, sprite.y, 0xffd700)
            this.chatMessages.push({
              name: 'SYSTEM',
              text: `${data.type} defeated! +${data.gold}g`,
              color: '#44ff88',
              age: 0,
            })
            // Level up check
            while (p.xp >= p.xpNext) {
              p.xp -= p.xpNext
              p.level++
              p.xpNext = Math.floor(p.xpNext * 1.65)
              p.maxHp += 25; p.hp = p.maxHp
              p.atk += 3; p.def += 2
              this.showDamageNumber(this.player.x, this.player.y - 50, 'LEVEL UP!', '#ffffff')
              this.chatMessages.push({
                name: 'SYSTEM',
                text: `${playerName} reached Level ${p.level}!`,
                color: '#ffd700',
                age: 0,
              })
              // Level up flash
              this.cameras.main.flash(400, 255, 220, 50, true)
            }
          } else {
            this.updateEnemyHPBar(sprite, data)
          }
        }
      })

      if (!hitAny) {
        // Miss swing animation still plays
      }
      p.atkTimer = cls === 'warrior' ? 0.5 : cls === 'mage' ? 1.0 : cls === 'rogue' ? 0.3 : cls === 'archer' ? 0.6 : 0.7
    }

    useSkill(slot: number) {
      const p = this.playerStats
      if (p.skillCooldowns[slot] > 0 || p.dead) return
      const mpCosts = [20, 30, 25, 45]
      if (p.mp < mpCosts[slot]) {
        this.showDamageNumber(this.player.x, this.player.y - 30, 'NO MP!', '#4488ff')
        return
      }
      p.mp -= mpCosts[slot]
      p.skillCooldowns[slot] = [3, 8, 5, 12][slot]
      const ranges = [160, 280, 200, 320]
      const dmgMults = [1.8, 3.0, 2.5, 4.0]
      const colors = [0xffaa00, 0xcc44ff, 0x44ffaa, 0xff4400]
      const textColors = ['#ffaa00', '#cc44ff', '#44ffaa', '#ff4400']

      this.player.play(`${cls}_attack`, true)
      this.spawnHitParticles(this.player.x, this.player.y, colors[slot], 12)

      this.enemies.getChildren().forEach(obj => {
        const sprite = obj as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody
        const data = this.enemyData.get(sprite)
        if (!data || data.state === 'dead') return
        const dist = PhaserLib.Math.Distance.Between(
          this.player.x, this.player.y, sprite.x, sprite.y
        )
        if (dist <= ranges[slot]) {
          const dmg = Math.floor((p.atk + Math.random() * 20) * dmgMults[slot])
          data.hp -= dmg
          this.showDamageNumber(sprite.x, sprite.y - 20, `-${dmg}`, textColors[slot])
          this.spawnHitParticles(sprite.x, sprite.y, colors[slot], 6)
          if (data.hp <= 0) {
            data.state = 'dead'
            p.xp += data.xp; p.gold += data.gold
            sprite.play(`${data.type}_death`)
          } else {
            this.updateEnemyHPBar(sprite, data)
          }
        }
      })
    }

    updateEnemyHPBar(sprite: Phaser.GameObjects.Sprite, data: ReturnType<typeof this.enemyData.get>) {
      if (!data) return
      const barW = data.type === 'dragon' ? 60 : 40
      data.hpBar.clear()
      data.hpBar.fillStyle(0x220000)
      data.hpBar.fillRect(sprite.x - barW/2, sprite.y - 30, barW, 5)
      const pct = Math.max(0, data.hp / data.maxHp)
      const barColor = pct > 0.5 ? 0xdd2222 : pct > 0.25 ? 0xdd8800 : 0xff4444
      data.hpBar.fillStyle(barColor)
      data.hpBar.fillRect(sprite.x - barW/2, sprite.y - 30, barW * pct, 5)
    }

    showDamageNumber(x: number, y: number, text: string, color: string) {
      const txt = this.add.text(x, y, text, {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: text.includes('LEVEL') ? '9px' : '8px',
        color,
        stroke: '#000000',
        strokeThickness: 3,
      }).setOrigin(0.5).setDepth(20)
      this.dmgTexts.push({ obj: txt, life: 1, vy: -60 })
    }

    spawnHitParticles(x: number, y: number, color: number, count = 6) {
      for (let i = 0; i < count; i++) {
        const dot = this.add.rectangle(x, y, 4, 4, color).setDepth(15)
        const vx = (Math.random() - 0.5) * 150
        const vy = -Math.random() * 150 - 50
        this.tweens.add({
          targets: dot,
          x: x + vx * 0.5,
          y: y + vy * 0.5 + 30,
          alpha: 0,
          duration: 500 + Math.random() * 300,
          ease: 'Quad.easeOut',
          onComplete: () => dot.destroy(),
        })
      }
    }

    // ── Main Update ──────────────────────────────────────────────────────────
    update(time: number, delta: number) {
      const dt = delta / 1000
      const p = this.playerStats

      // Timers
      p.atkTimer = Math.max(0, p.atkTimer - dt)
      p.invTimer = Math.max(0, p.invTimer - dt)
      p.skillCooldowns = p.skillCooldowns.map(cd => Math.max(0, cd - dt))
      if (p.mp < p.maxMp) p.mp = Math.min(p.maxMp, p.mp + dt * 7)

      // Respawn
      if (p.dead) {
        p.respTimer -= dt
        if (p.respTimer <= 0) {
          p.dead = false
          p.hp = p.maxHp
          p.mp = Math.floor(p.maxMp * 0.5)
          this.player.setAlpha(1)
          this.player.setPosition(24 * TILE * SCALE, 24 * TILE * SCALE)
          this.player.play(`${cls}_idle`)
        }
        this.pushHUD()
        return
      }

      // Movement
      let vx = 0, vy = 0
      const spd = p.spd * SCALE

      if (this.wasd.left.isDown || this.cursors.left.isDown) { vx = -spd; this.player.play(`${cls}_walk_left`, true) }
      else if (this.wasd.right.isDown || this.cursors.right.isDown) { vx = spd; this.player.play(`${cls}_walk_right`, true) }
      else if (this.wasd.up.isDown || this.cursors.up.isDown) { vy = -spd; this.player.play(`${cls}_walk_down`, true) }
      else if (this.wasd.down.isDown || this.cursors.down.isDown) { vy = spd; this.player.play(`${cls}_walk_down`, true) }
      else if (p.atkTimer === 0) { this.player.play(`${cls}_idle`, true) }

      if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707 }
      this.player.setVelocity(vx, vy)

      // Clamp to world bounds
      this.player.x = PhaserLib.Math.Clamp(this.player.x, TILE * SCALE, (MAP_W - 1) * TILE * SCALE)
      this.player.y = PhaserLib.Math.Clamp(this.player.y, TILE * SCALE, (MAP_H - 1) * TILE * SCALE)

      // Invincibility flicker
      if (p.invTimer > 0) {
        this.player.setAlpha(Math.floor(p.invTimer * 10) % 2 === 0 ? 0.4 : 1)
      } else {
        this.player.setAlpha(1)
      }

      // Skills
      if (PhaserLib.Input.Keyboard.JustDown(this.keys.space)) this.doAttack()
      if (PhaserLib.Input.Keyboard.JustDown(this.keys.q)) this.useSkill(0)
      if (PhaserLib.Input.Keyboard.JustDown(this.keys.e)) this.useSkill(1)
      if (PhaserLib.Input.Keyboard.JustDown(this.keys.r)) this.useSkill(2)
      if (PhaserLib.Input.Keyboard.JustDown(this.keys.f)) this.useSkill(3)

      // Enemy AI
      this.enemies.getChildren().forEach(obj => {
        const sprite = obj as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody
        const data = this.enemyData.get(sprite)
        if (!data || data.state === 'dead' || !sprite.active) return

        data.atkTimer = Math.max(0, data.atkTimer - dt)
        data.stateTimer -= dt

        const dist = PhaserLib.Math.Distance.Between(
          this.player.x, this.player.y, sprite.x, sprite.y
        )

        const aggroRange = data.type === 'dragon' ? 400 : data.type === 'orc' ? 280 : 220
        const atkRange = data.type === 'dragon' ? 100 : 70
        const eneSpd = (data.type === 'dragon' ? 60 : data.type === 'wolf' ? 100 : data.type === 'orc' ? 80 : 70) * SCALE / 3

        if (data.state === 'patrol') {
          if (data.stateTimer <= 0) {
            data.stateTimer = 2 + Math.random() * 3
            const angle = Math.random() * Math.PI * 2
            sprite.setVelocity(Math.cos(angle) * eneSpd * 0.4, Math.sin(angle) * eneSpd * 0.4)
          }
          if (!p.dead && dist < aggroRange) {
            data.state = 'chase'
            sprite.play(`${data.type}_walk`, true)
          }
          // Return home if strayed
          const homeDist = PhaserLib.Math.Distance.Between(sprite.x, sprite.y, data.homeX, data.homeY)
          if (homeDist > 300) {
            const ang = PhaserLib.Math.Angle.Between(sprite.x, sprite.y, data.homeX, data.homeY)
            sprite.setVelocity(Math.cos(ang) * eneSpd, Math.sin(ang) * eneSpd)
          }
        } else if (data.state === 'chase') {
          if (p.dead || dist > aggroRange * 1.5) { data.state = 'patrol'; sprite.setVelocity(0, 0); return }
          if (dist < atkRange) { data.state = 'attack'; sprite.setVelocity(0, 0); return }
          const angle = PhaserLib.Math.Angle.Between(sprite.x, sprite.y, this.player.x, this.player.y)
          sprite.setVelocity(Math.cos(angle) * eneSpd, Math.sin(angle) * eneSpd)
          sprite.play(`${data.type}_walk`, true)
        } else if (data.state === 'attack') {
          if (p.dead || dist > atkRange * 2) { data.state = 'chase'; return }
          sprite.setVelocity(0, 0)
          if (data.stateTimer <= 0 && data.atkTimer === 0) {
            const cooldown = data.type === 'dragon' ? 2.0 : data.type === 'wolf' ? 0.9 : 1.3
            data.stateTimer = cooldown
            sprite.play(`${data.type}_attack`, true)
            sprite.once('animationcomplete', () => {
              if (data.state !== 'dead') sprite.play(`${data.type}_walk`, true)
            })
            if (!p.dead && p.invTimer === 0) {
              const baseDmg = data.type === 'dragon' ? 55 : data.type === 'orc' ? 28 : data.type === 'wolf' ? 20 : 18
              const dmg = Math.max(0, baseDmg - p.def + Math.floor(Math.random() * 10))
              p.hp = Math.max(0, p.hp - dmg)
              p.invTimer = 0.8
              this.showDamageNumber(this.player.x, this.player.y - 20, `-${dmg}`, '#ff8800')
              this.spawnHitParticles(this.player.x, this.player.y, 0xff4444, 4)
              this.cameras.main.shake(150, 0.006)
              if (p.hp <= 0) {
                p.dead = true
                p.respTimer = 5
                this.player.setAlpha(0.3)
                this.cameras.main.flash(600, 150, 0, 0, true)
                this.chatMessages.push({ name: 'SYSTEM', text: 'You died! Respawning in 5s...', color: '#ff4444', age: 0 })
              }
            }
            data.atkTimer = 0.3
          }
        }

        // Update HP bar position
        this.updateEnemyHPBar(sprite, data)
        data.label.setPosition(sprite.x, sprite.y - (data.type === 'dragon' ? 55 : 40))
      })

      // Damage number floating
      this.dmgTexts = this.dmgTexts.filter(d => {
        d.life -= dt * 1.5
        d.obj.y += d.vy * dt
        d.obj.setAlpha(d.life)
        if (d.life <= 0) { d.obj.destroy(); return false }
        return true
      })

      // Chat
      this.chatMessages = this.chatMessages.filter(m => { m.age += dt; return m.age < 10 })
      this.chatTimer -= dt
      if (this.chatTimer <= 0) {
        this.chatTimer = 4 + Math.random() * 6
        const fp = this.fakePlayers[Math.floor(Math.random() * this.fakePlayers.length)]
        this.chatMessages.push({
          name: fp.name,
          text: this.fakeMsgs[Math.floor(Math.random() * this.fakeMsgs.length)],
          color: fp.color,
          age: 0,
        })
        if (this.chatMessages.length > 8) this.chatMessages = this.chatMessages.slice(-8)
      }

      this.pushHUD()
    }

    pushHUD() {
      const p = this.playerStats
      onHUDUpdate({
        playerName,
        playerClass: cls,
        level: p.level,
        hp: Math.floor(p.hp),
        maxHp: p.maxHp,
        mp: Math.floor(p.mp),
        maxMp: p.maxMp,
        xp: p.xp,
        xpNext: p.xpNext,
        gold: p.gold,
        skillCooldowns: [...p.skillCooldowns],
        chatMessages: [...this.chatMessages],
        dead: p.dead,
        respTimer: p.respTimer,
        onlineCount: 1284 + Math.floor(Math.random() * 10),
      })
    }
  }

  return GameScene as unknown as typeof Phaser.Scene
}

// ── React Component ───────────────────────────────────────────────────────────
export default function PhaserGame({ playerName, playerClass, onHUDUpdate }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Phaser.Game | null>(null)

  const getClass = useCallback((): ClassType => {
    const valid: ClassType[] = ['warrior', 'mage', 'rogue', 'archer', 'paladin']
    return valid.includes(playerClass as ClassType) ? (playerClass as ClassType) : 'warrior'
  }, [playerClass])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount || gameRef.current) return

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const PhaserLib = require('phaser') as typeof import('phaser')
    const cls = getClass()
    const Scene = createScene(playerName, cls, onHUDUpdate)

    const config: Phaser.Types.Core.GameConfig = {
      type: PhaserLib.AUTO,
      width: GAME_W,
      height: GAME_H,
      parent: mount,
      backgroundColor: '#0a0818',
      pixelArt: true,
      antialias: false,
      roundPixels: true,
      physics: {
        default: 'arcade',
        arcade: { gravity: { x: 0, y: 0 }, debug: false },
      },
      scene: [Scene],
    }

    gameRef.current = new PhaserLib.Game(config)

    return () => {
      gameRef.current?.destroy(true)
      gameRef.current = null
    }
  }, [getClass, onHUDUpdate, playerName])

  return (
    <div
      ref={mountRef}
      style={{ width: GAME_W, height: GAME_H, maxWidth: '100%', background: '#0a0818' }}
    />
  )
}
