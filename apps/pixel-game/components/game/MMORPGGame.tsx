'use client'

import { useEffect, useRef, useCallback } from 'react'
import * as THREE from 'three'

// ── Constants ─────────────────────────────────────────────────────────────────
const TILE = 2.0          // world units per tile
const MAP_W = 40
const MAP_H = 40
const PLAYER_SPEED = 6.0  // units/sec
const ISO_ANGLE = Math.PI / 6  // 30°

// ── Pixel Texture Factory ─────────────────────────────────────────────────────
function makePixelTexture(draw: (ctx: CanvasRenderingContext2D) => void, size = 32): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  draw(ctx)
  const tex = new THREE.CanvasTexture(canvas)
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  return tex
}

function makeGrassTex(): THREE.CanvasTexture {
  return makePixelTexture(ctx => {
    ctx.fillStyle = '#4a8c30'
    ctx.fillRect(0, 0, 32, 32)
    const darks = ['#3a7020', '#388020', '#428c28']
    const lights = ['#5aaa3c', '#60b040', '#52a034']
    for (let i = 0; i < 20; i++) {
      const x = (i * 13 + 7) % 32
      const y = (i * 17 + 3) % 32
      ctx.fillStyle = i % 3 === 0 ? lights[i % 3] : darks[i % 3]
      ctx.fillRect(x, y, 2, 2)
    }
    // Grass blades
    ctx.fillStyle = '#68c044'
    ;[[4,2],[12,6],[20,2],[28,8],[8,14],[16,10],[24,14],[2,20],[10,18],[18,22],[26,16],[6,26],[14,24],[22,28],[30,22]].forEach(([x, y]) => {
      ctx.fillRect(x, y, 1, 3)
    })
  })
}

function makeSandTex(): THREE.CanvasTexture {
  return makePixelTexture(ctx => {
    ctx.fillStyle = '#c8904a'
    ctx.fillRect(0, 0, 32, 32)
    for (let i = 0; i < 24; i++) {
      const x = (i * 11 + 5) % 32
      const y = (i * 9 + 7) % 32
      ctx.fillStyle = i % 2 === 0 ? '#d4a060' : '#b87838'
      ctx.fillRect(x, y, 2, 1)
    }
  })
}

function makeStoneTex(): THREE.CanvasTexture {
  return makePixelTexture(ctx => {
    ctx.fillStyle = '#888070'
    ctx.fillRect(0, 0, 32, 32)
    // Stone blocks
    ctx.fillStyle = '#706860'
    ctx.fillRect(0, 15, 32, 2)
    ctx.fillRect(15, 0, 2, 15)
    ctx.fillRect(7, 17, 2, 15)
    ctx.fillRect(23, 17, 2, 15)
    ctx.fillStyle = '#a09888'
    ctx.fillRect(2, 2, 11, 11)
    ctx.fillRect(18, 2, 11, 11)
    ctx.fillRect(9, 18, 12, 11)
    ctx.fillStyle = '#b0a898'
    ctx.fillRect(3, 3, 4, 4)
    ctx.fillRect(19, 3, 4, 4)
  })
}

function makeDungeonTex(): THREE.CanvasTexture {
  return makePixelTexture(ctx => {
    ctx.fillStyle = '#18102a'
    ctx.fillRect(0, 0, 32, 32)
    ctx.fillStyle = '#221840'
    ctx.fillRect(0, 15, 32, 2)
    ctx.fillRect(15, 0, 2, 15)
    ctx.fillRect(7, 17, 2, 15)
    ctx.fillStyle = '#2a2048'
    ctx.fillRect(2, 2, 11, 11)
    ctx.fillRect(18, 2, 11, 11)
    ctx.fillRect(9, 18, 12, 11)
  })
}

function makeWaterTex(t: number): THREE.CanvasTexture {
  return makePixelTexture(ctx => {
    ctx.fillStyle = '#2060a0'
    ctx.fillRect(0, 0, 32, 32)
    const wave = Math.sin(t * 2) * 2
    ctx.fillStyle = '#3080cc'
    ctx.fillRect(2, 8 + wave, 28, 3)
    ctx.fillRect(2, 20 + wave, 28, 3)
    ctx.fillStyle = '#60a8e8'
    ctx.fillRect(6, 9 + wave, 8, 1)
    ctx.fillRect(18, 21 + wave, 8, 1)
  })
}

// Character textures
function makeCharTex(bodyColor: string, headColor: string, accentColor: string): THREE.CanvasTexture {
  return makePixelTexture(ctx => {
    // Body
    ctx.fillStyle = bodyColor
    ctx.fillRect(8, 14, 16, 14)
    // Head
    ctx.fillStyle = headColor
    ctx.fillRect(10, 4, 12, 12)
    // Eyes
    ctx.fillStyle = '#000000'
    ctx.fillRect(12, 8, 2, 2)
    ctx.fillRect(18, 8, 2, 2)
    // Accent (belt / trim)
    ctx.fillStyle = accentColor
    ctx.fillRect(8, 22, 16, 2)
    // Legs
    ctx.fillStyle = bodyColor
    ctx.fillRect(10, 28, 5, 4)
    ctx.fillRect(17, 28, 5, 4)
    // Outline
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'
    ctx.lineWidth = 1
    ctx.strokeRect(10, 4, 12, 12)
    ctx.strokeRect(8, 14, 16, 14)
  })
}

function makeEnemyTex(type: 'skeleton' | 'orc' | 'wolf' | 'dragon'): THREE.CanvasTexture {
  return makePixelTexture(ctx => {
    switch (type) {
      case 'skeleton': {
        ctx.fillStyle = '#d8d0b0'
        ctx.fillRect(10, 2, 12, 12)
        ctx.fillStyle = '#000'
        ctx.fillRect(12, 6, 3, 3)
        ctx.fillRect(17, 6, 3, 3)
        ctx.fillRect(13, 11, 6, 1)
        ctx.fillStyle = '#c0c0a0'
        ctx.fillRect(9, 14, 14, 14)
        ctx.fillStyle = '#a0a080'
        for (let i = 0; i < 4; i++) ctx.fillRect(9, 16 + i * 3, 14, 1)
        ctx.fillRect(11, 28, 4, 4)
        ctx.fillRect(17, 28, 4, 4)
        break
      }
      case 'orc': {
        ctx.fillStyle = '#50a040'
        ctx.fillRect(8, 4, 16, 12)
        ctx.fillStyle = '#40803a'
        ctx.fillRect(10, 16, 12, 14)
        ctx.fillStyle = '#000'
        ctx.fillRect(11, 8, 3, 3)
        ctx.fillRect(18, 8, 3, 3)
        ctx.fillStyle = '#fff'
        ctx.fillRect(12, 12, 3, 3)
        ctx.fillRect(17, 12, 3, 3)
        ctx.fillStyle = '#804020'
        ctx.fillRect(8, 24, 6, 2)
        ctx.fillRect(18, 24, 6, 2)
        ctx.fillRect(10, 28, 5, 4)
        ctx.fillRect(17, 28, 5, 4)
        break
      }
      case 'wolf': {
        ctx.fillStyle = '#808898'
        ctx.fillRect(6, 10, 20, 12)
        ctx.fillRect(8, 6, 6, 6)
        ctx.fillRect(18, 6, 6, 6)
        ctx.fillStyle = '#000'
        ctx.fillRect(9, 8, 2, 2)
        ctx.fillRect(21, 8, 2, 2)
        ctx.fillStyle = '#e04040'
        ctx.fillRect(12, 14, 8, 2)
        ctx.fillStyle = '#606878'
        ctx.fillRect(8, 22, 4, 10)
        ctx.fillRect(14, 22, 4, 10)
        ctx.fillRect(20, 22, 4, 10)
        break
      }
      case 'dragon': {
        ctx.fillStyle = '#206830'
        ctx.fillRect(6, 8, 20, 16)
        ctx.fillStyle = '#18501e'
        ctx.fillRect(2, 4, 8, 12)
        ctx.fillRect(22, 4, 8, 12)
        ctx.fillStyle = '#60d060'
        ctx.fillRect(8, 10, 16, 10)
        ctx.fillStyle = '#ffff20'
        ctx.fillRect(10, 10, 3, 3)
        ctx.fillRect(19, 10, 3, 3)
        ctx.fillStyle = '#000'
        ctx.fillRect(11, 11, 1, 1)
        ctx.fillRect(20, 11, 1, 1)
        ctx.fillStyle = '#206830'
        ctx.fillRect(14, 24, 4, 8)
        break
      }
    }
  })
}

// ── Map Generation ────────────────────────────────────────────────────────────
type TileType = 'grass' | 'sand' | 'stone' | 'dungeon' | 'water' | 'deep_grass'

function buildWorldMap(): TileType[][] {
  const map: TileType[][] = Array.from({ length: MAP_H }, () =>
    Array(MAP_W).fill('grass') as TileType[]
  )

  // Town center (stone)
  for (let y = 16; y < 24; y++)
    for (let x = 16; x < 24; x++)
      map[y][x] = 'stone'

  // Main roads (sand)
  for (let i = 0; i < MAP_W; i++) {
    map[19][i] = 'sand'
    map[20][i] = 'sand'
  }
  for (let i = 0; i < MAP_H; i++) {
    map[i][19] = 'sand'
    map[i][20] = 'sand'
  }

  // Forest areas (deep grass)
  for (let y = 0; y < 14; y++)
    for (let x = 0; x < 14; x++)
      if ((x + y) % 3 !== 0) map[y][x] = 'deep_grass'

  for (let y = 26; y < MAP_H; y++)
    for (let x = 26; x < MAP_W; x++)
      if ((x + y) % 3 !== 0) map[y][x] = 'deep_grass'

  // Dungeon area
  for (let y = 0; y < 10; y++)
    for (let x = 26; x < MAP_W; x++)
      map[y][x] = 'dungeon'

  // Water lake
  for (let y = 26; y < 34; y++)
    for (let x = 2; x < 12; x++) {
      const d = Math.sqrt((y - 30) ** 2 + (x - 7) ** 2)
      if (d < 5) map[y][x] = 'water'
    }

  return map
}

// ── Types ─────────────────────────────────────────────────────────────────────
type ClassType = 'warrior' | 'mage' | 'rogue' | 'archer' | 'paladin'
type EnemyType = 'skeleton' | 'orc' | 'wolf' | 'dragon'
type Dir = 'up' | 'down' | 'left' | 'right'

interface ClassStats {
  maxHp: number
  maxMp: number
  atk: number
  def: number
  spd: number
  bodyColor: string
  headColor: string
  accentColor: string
}

const CLASS_STATS: Record<ClassType, ClassStats> = {
  warrior: { maxHp: 180, maxMp: 40, atk: 32, def: 20, spd: 5, bodyColor: '#4060c0', headColor: '#f5c870', accentColor: '#ffd700' },
  mage:    { maxHp: 100, maxMp: 120, atk: 50, def: 8, spd: 5.5, bodyColor: '#8020d0', headColor: '#f5c870', accentColor: '#cc88ff' },
  rogue:   { maxHp: 130, maxMp: 60, atk: 40, def: 12, spd: 7, bodyColor: '#202030', headColor: '#f5c870', accentColor: '#44ff88' },
  archer:  { maxHp: 120, maxMp: 70, atk: 38, def: 10, spd: 6, bodyColor: '#286020', headColor: '#f5c870', accentColor: '#ffcc44' },
  paladin: { maxHp: 200, maxMp: 80, atk: 28, def: 28, spd: 4.5, bodyColor: '#c0a030', headColor: '#f5c870', accentColor: '#ffffff' },
}

interface PlayerState {
  x: number
  z: number
  hp: number
  maxHp: number
  mp: number
  maxMp: number
  level: number
  xp: number
  xpNext: number
  gold: number
  atk: number
  def: number
  spd: number
  dir: Dir
  atkTimer: number
  invTimer: number
  dead: boolean
  respTimer: number
  name: string
  cls: ClassType
  skillCooldowns: number[]
}

interface EnemyState {
  id: number
  type: EnemyType
  x: number
  z: number
  hp: number
  maxHp: number
  state: 'patrol' | 'chase' | 'attack' | 'dead'
  homeX: number
  homeZ: number
  stateTimer: number
  atkTimer: number
  xpReward: number
  goldReward: number
  mesh: THREE.Group
}

interface DamageNumber {
  value: number
  color: string
  x: number
  z: number
  life: number
  sprite: THREE.Sprite
}

interface Particle {
  mesh: THREE.Mesh
  vx: number
  vz: number
  vy: number
  life: number
}

interface GameState {
  player: PlayerState
  enemies: EnemyState[]
  damageNumbers: DamageNumber[]
  particles: Particle[]
  keys: Set<string>
  lastTime: number
  chatMessages: { name: string; text: string; color: string; age: number }[]
  chatTimer: number
}

// ── HUD Callback Types ────────────────────────────────────────────────────────
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
  enemyCount: number
}

interface Props {
  playerName: string
  playerClass: string
  onHUDUpdate: (state: HUDState) => void
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function MMORPGGame({ playerName, playerClass, onHUDUpdate }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const gsRef = useRef<GameState | null>(null)
  const rafRef = useRef<number>(0)

  const getClass = useCallback((): ClassType => {
    const valid: ClassType[] = ['warrior', 'mage', 'rogue', 'archer', 'paladin']
    return valid.includes(playerClass as ClassType) ? (playerClass as ClassType) : 'warrior'
  }, [playerClass])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const W = mount.clientWidth || 960
    const H = mount.clientHeight || 580

    // ── Scene setup ───────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: false })
    renderer.setSize(W, H)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.setClearColor(0x0a0818)
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog(0x0a0818, 30, 70)

    // Isometric orthographic camera
    const aspect = W / H
    const frustH = 20
    const frustW = frustH * aspect
    const camera = new THREE.OrthographicCamera(
      -frustW / 2, frustW / 2,
      frustH / 2, -frustH / 2,
      0.1, 200
    )
    // Isometric position: looking down at 30° from the side
    camera.position.set(20, 24, 20)
    camera.lookAt(20, 0, 20)

    // ── Lighting ──────────────────────────────────────────────────────────────
    const ambientLight = new THREE.AmbientLight(0x8888cc, 0.6)
    scene.add(ambientLight)

    const sunLight = new THREE.DirectionalLight(0xfff0cc, 1.2)
    sunLight.position.set(10, 20, 5)
    sunLight.castShadow = true
    sunLight.shadow.mapSize.width = 2048
    sunLight.shadow.mapSize.height = 2048
    sunLight.shadow.camera.near = 0.1
    sunLight.shadow.camera.far = 100
    sunLight.shadow.camera.left = -30
    sunLight.shadow.camera.right = 30
    sunLight.shadow.camera.top = 30
    sunLight.shadow.camera.bottom = -30
    scene.add(sunLight)

    // Fill light (purple tint for fantasy feel)
    const fillLight = new THREE.DirectionalLight(0x6644aa, 0.3)
    fillLight.position.set(-10, 10, -10)
    scene.add(fillLight)

    // ── Textures ──────────────────────────────────────────────────────────────
    const textures = {
      grass: makeGrassTex(),
      sand: makeSandTex(),
      stone: makeStoneTex(),
      dungeon: makeDungeonTex(),
      water: makeWaterTex(0),
      deep_grass: makePixelTexture(ctx => {
        ctx.fillStyle = '#386a20'
        ctx.fillRect(0, 0, 32, 32)
        ctx.fillStyle = '#487830'
        for (let i = 0; i < 16; i++) {
          const x = (i * 13 + 3) % 32
          const y = (i * 7 + 5) % 32
          ctx.fillRect(x, y, 2, 4)
        }
      }),
    }

    const tileTexMap: Record<TileType, THREE.CanvasTexture> = {
      grass: textures.grass,
      sand: textures.sand,
      stone: textures.stone,
      dungeon: textures.dungeon,
      water: textures.water,
      deep_grass: textures.deep_grass,
    }

    const tileMats: Record<TileType, THREE.MeshLambertMaterial> = {
      grass: new THREE.MeshLambertMaterial({ map: textures.grass }),
      sand: new THREE.MeshLambertMaterial({ map: textures.sand }),
      stone: new THREE.MeshLambertMaterial({ map: textures.stone }),
      dungeon: new THREE.MeshLambertMaterial({ map: textures.dungeon }),
      water: new THREE.MeshLambertMaterial({ map: textures.water, transparent: true, opacity: 0.85 }),
      deep_grass: new THREE.MeshLambertMaterial({ map: textures.deep_grass }),
    }

    // ── World Build ──────────────────────────────────────────────────────────
    const worldMap = buildWorldMap()
    const tileGeo = new THREE.BoxGeometry(TILE, 0.3, TILE)
    const waterTiles: THREE.Mesh[] = []
    const torchLights: { light: THREE.PointLight; x: number; z: number }[] = []

    for (let tz = 0; tz < MAP_H; tz++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        const ttype = worldMap[tz][tx]
        const mesh = new THREE.Mesh(tileGeo, tileMats[ttype])
        mesh.position.set(tx * TILE + TILE / 2, -0.15, tz * TILE + TILE / 2)
        mesh.receiveShadow = true
        scene.add(mesh)
        if (ttype === 'water') waterTiles.push(mesh)
      }
    }

    // ── Decorations ───────────────────────────────────────────────────────────
    // Trees in forest areas
    const treeMat = new THREE.MeshLambertMaterial({ color: 0x285018 })
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6a3c18 })
    const treeGeo = new THREE.ConeGeometry(0.8, 2, 8)
    const trunkGeo = new THREE.CylinderGeometry(0.15, 0.2, 0.8, 6)

    const treePositions = [
      [2,2],[3,5],[5,1],[7,3],[1,7],[4,9],[8,6],[10,2],[11,8],[0,10],
      [2,11],[6,12],[9,11],[12,4],[13,1],[27,27],[28,30],[30,28],[31,25],
      [33,29],[35,27],[29,32],[32,33],[34,30],[36,28],[38,26],[27,33],
    ]
    for (const [tx, tz] of treePositions) {
      if (worldMap[tz]?.[tx] === 'deep_grass' || worldMap[tz]?.[tx] === 'grass') {
        const group = new THREE.Group()
        const trunk = new THREE.Mesh(trunkGeo, trunkMat)
        trunk.position.y = 0.4
        trunk.castShadow = true
        const canopy = new THREE.Mesh(treeGeo, treeMat)
        canopy.position.y = 1.8
        canopy.castShadow = true
        // Second layer canopy
        const canopy2 = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.6, 8), treeMat)
        canopy2.position.y = 2.6
        group.add(trunk, canopy, canopy2)
        group.position.set(tx * TILE + TILE / 2, 0.3, tz * TILE + TILE / 2)
        scene.add(group)
      }
    }

    // Rocks
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x888070 })
    const rockGeo = new THREE.DodecahedronGeometry(0.4, 0)
    const rockPositions = [[5,15],[15,5],[34,15],[15,34],[8,25],[25,8],[35,8],[8,35]]
    for (const [tx, tz] of rockPositions) {
      const rock = new THREE.Mesh(rockGeo, rockMat)
      rock.position.set(tx * TILE + TILE / 2, 0.4, tz * TILE + TILE / 2)
      rock.rotation.y = Math.random() * Math.PI
      rock.castShadow = true
      scene.add(rock)
    }

    // Buildings in town
    const buildingData = [
      { tx: 17, tz: 17, w: 3, d: 2, color: 0x8a5a2a, roofColor: 0x8a1a1a, label: 'TAVERN' },
      { tx: 21, tz: 17, w: 2, d: 2, color: 0x222040, roofColor: 0x3a1a60, label: 'MAGIC SHOP' },
      { tx: 17, tz: 21, w: 2, d: 2, color: 0x4a3c38, roofColor: 0x382828, label: 'FORGE' },
      { tx: 21, tz: 21, w: 2, d: 2, color: 0x7a5e28, roofColor: 0xcc2222, label: 'GUILD' },
    ]
    for (const b of buildingData) {
      const bw = b.w * TILE - 0.2
      const bd = b.d * TILE - 0.2
      const bh = 2.5
      // Walls
      const wallGeo = new THREE.BoxGeometry(bw, bh, bd)
      const wallMat = new THREE.MeshLambertMaterial({ color: b.color })
      const wall = new THREE.Mesh(wallGeo, wallMat)
      wall.position.set(
        (b.tx + b.w / 2) * TILE,
        bh / 2 + 0.3,
        (b.tz + b.d / 2) * TILE
      )
      wall.castShadow = true
      wall.receiveShadow = true
      scene.add(wall)
      // Roof
      const roofGeo = new THREE.ConeGeometry(Math.max(bw, bd) * 0.8, 1.2, 4)
      const roofMat = new THREE.MeshLambertMaterial({ color: b.roofColor })
      const roof = new THREE.Mesh(roofGeo, roofMat)
      roof.rotation.y = Math.PI / 4
      roof.position.set(
        (b.tx + b.w / 2) * TILE,
        bh + 0.9 + 0.3,
        (b.tz + b.d / 2) * TILE
      )
      roof.castShadow = true
      scene.add(roof)

      // Torch light near each building
      const torchLight = new THREE.PointLight(0xff8820, 2.5, 8)
      torchLight.position.set(
        (b.tx + b.w / 2) * TILE,
        2.5,
        (b.tz + b.d / 2) * TILE - bd / 2 - 0.5
      )
      scene.add(torchLight)
      torchLights.push({ light: torchLight, x: b.tx + b.w / 2, z: b.tz + b.d / 2 - 0.5 })
    }

    // Portal at dungeon entrance
    const portalGeo = new THREE.TorusGeometry(1.2, 0.2, 8, 24)
    const portalMat = new THREE.MeshBasicMaterial({ color: 0xcc44ff })
    const portal = new THREE.Mesh(portalGeo, portalMat)
    portal.position.set(30 * TILE, 1.5, 5 * TILE)
    portal.rotation.x = Math.PI / 2
    scene.add(portal)
    const portalLight = new THREE.PointLight(0xcc44ff, 3, 10)
    portalLight.position.copy(portal.position)
    scene.add(portalLight)

    // ── Character meshes ──────────────────────────────────────────────────────
    function buildCharMesh(cls: ClassType): THREE.Group {
      const stats = CLASS_STATS[cls]
      const tex = makeCharTex(stats.bodyColor, stats.headColor, stats.accentColor)
      const group = new THREE.Group()

      // Body
      const bodyGeo = new THREE.BoxGeometry(0.6, 0.8, 0.35)
      const bodyMat = new THREE.MeshLambertMaterial({ map: tex })
      const body = new THREE.Mesh(bodyGeo, bodyMat)
      body.position.y = 0.7
      body.castShadow = true

      // Head
      const headGeo = new THREE.BoxGeometry(0.5, 0.45, 0.45)
      const headMat = new THREE.MeshLambertMaterial({ map: tex })
      const head = new THREE.Mesh(headGeo, headMat)
      head.position.y = 1.35
      head.castShadow = true

      // Hat / helmet depending on class
      if (cls === 'mage') {
        const hatGeo = new THREE.ConeGeometry(0.28, 0.6, 6)
        const hatMat = new THREE.MeshLambertMaterial({ color: 0x6814cc })
        const hat = new THREE.Mesh(hatGeo, hatMat)
        hat.position.y = 1.85
        group.add(hat)
      } else if (cls === 'paladin') {
        const helmGeo = new THREE.BoxGeometry(0.55, 0.3, 0.5)
        const helmMat = new THREE.MeshLambertMaterial({ color: 0xc0a030 })
        const helm = new THREE.Mesh(helmGeo, helmMat)
        helm.position.y = 1.7
        group.add(helm)
      }

      // Legs
      const legGeo = new THREE.BoxGeometry(0.22, 0.55, 0.3)
      const legMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(stats.bodyColor).multiplyScalar(0.7) })
      const leftLeg = new THREE.Mesh(legGeo, legMat)
      leftLeg.position.set(-0.16, 0.27, 0)
      leftLeg.castShadow = true
      const rightLeg = new THREE.Mesh(legGeo, legMat)
      rightLeg.position.set(0.16, 0.27, 0)
      rightLeg.castShadow = true

      group.add(body, head, leftLeg, rightLeg)
      group.name = 'character'
      return group
    }

    function buildEnemyMesh(type: EnemyType): THREE.Group {
      const group = new THREE.Group()
      const tex = makeEnemyTex(type)
      const mat = new THREE.MeshLambertMaterial({ map: tex })

      switch (type) {
        case 'skeleton': {
          const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), mat)
          body.position.y = 0.65
          const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), mat)
          head.position.y = 1.2
          const leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 0.2), mat)
          leg1.position.set(-0.12, 0.25, 0)
          const leg2 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 0.2), mat)
          leg2.position.set(0.12, 0.25, 0)
          group.add(body, head, leg1, leg2)
          break
        }
        case 'orc': {
          const body = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.85, 0.45), mat)
          body.position.y = 0.75
          const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.55, 0.5), mat)
          head.position.y = 1.45
          const leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.6, 0.35), mat)
          leg1.position.set(-0.2, 0.3, 0)
          const leg2 = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.6, 0.35), mat)
          leg2.position.set(0.2, 0.3, 0)
          group.add(body, head, leg1, leg2)
          break
        }
        case 'wolf': {
          const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.5), mat)
          body.position.set(0, 0.55, 0)
          body.rotation.x = 0.2
          const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.4, 0.55), mat)
          head.position.set(0, 0.9, 0.3)
          const leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.5, 0.18), mat)
          leg1.position.set(-0.3, 0.25, -0.15)
          const leg2 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.5, 0.18), mat)
          leg2.position.set(0.3, 0.25, -0.15)
          const leg3 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.5, 0.18), mat)
          leg3.position.set(-0.3, 0.25, 0.15)
          const leg4 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.5, 0.18), mat)
          leg4.position.set(0.3, 0.25, 0.15)
          group.add(body, head, leg1, leg2, leg3, leg4)
          break
        }
        case 'dragon': {
          const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 1.0), mat)
          body.position.y = 1.0
          const head = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.9), mat)
          head.position.set(0, 1.75, 0.4)
          const wing1 = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.05, 1.0), mat)
          wing1.position.set(-1.2, 1.5, 0)
          wing1.rotation.z = 0.4
          const wing2 = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.05, 1.0), mat)
          wing2.position.set(1.2, 1.5, 0)
          wing2.rotation.z = -0.4
          group.add(body, head, wing1, wing2)
          break
        }
      }

      group.traverse(c => { if ((c as THREE.Mesh).isMesh) c.castShadow = true })
      return group
    }

    // ── Player Mesh ───────────────────────────────────────────────────────────
    const cls = getClass()
    const playerMesh = buildCharMesh(cls)
    playerMesh.position.set(20 * TILE, 0.3, 20 * TILE)
    scene.add(playerMesh)

    // Player glow
    const playerLight = new THREE.PointLight(0x8888ff, 1.5, 5)
    playerLight.position.copy(playerMesh.position)
    playerLight.position.y += 2
    scene.add(playerLight)

    // Player shadow circle
    const shadowGeo = new THREE.CircleGeometry(0.4, 8)
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4 })
    const playerShadow = new THREE.Mesh(shadowGeo, shadowMat)
    playerShadow.rotation.x = -Math.PI / 2
    playerShadow.position.set(20 * TILE, 0.31, 20 * TILE)
    scene.add(playerShadow)

    // ── Sprites for damage numbers ────────────────────────────────────────────
    function makeDamageSprite(text: string, color: string): THREE.Sprite {
      const canvas = document.createElement('canvas')
      canvas.width = 128
      canvas.height = 48
      const ctx = canvas.getContext('2d')!
      ctx.font = 'bold 28px monospace'
      ctx.fillStyle = color
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      // Outline
      ctx.strokeStyle = '#000000'
      ctx.lineWidth = 4
      ctx.strokeText(text, 64, 24)
      ctx.fillText(text, 64, 24)
      const tex = new THREE.CanvasTexture(canvas)
      tex.magFilter = THREE.NearestFilter
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
      const sprite = new THREE.Sprite(mat)
      sprite.scale.set(1.5, 0.6, 1)
      return sprite
    }

    // ── Enemies ───────────────────────────────────────────────────────────────
    const enemySpawnData: { type: EnemyType; tx: number; tz: number; hp: number; xp: number; gold: number }[] = [
      { type: 'skeleton', tx: 5,  tz: 5,  hp: 60,  xp: 30,  gold: 12 },
      { type: 'skeleton', tx: 8,  tz: 3,  hp: 60,  xp: 30,  gold: 12 },
      { type: 'skeleton', tx: 10, tz: 8,  hp: 60,  xp: 30,  gold: 12 },
      { type: 'skeleton', tx: 30, tz: 3,  hp: 80,  xp: 40,  gold: 15 },
      { type: 'skeleton', tx: 34, tz: 6,  hp: 80,  xp: 40,  gold: 15 },
      { type: 'orc',      tx: 28, tz: 28, hp: 110, xp: 55,  gold: 20 },
      { type: 'orc',      tx: 32, tz: 30, hp: 110, xp: 55,  gold: 20 },
      { type: 'orc',      tx: 35, tz: 26, hp: 110, xp: 55,  gold: 20 },
      { type: 'wolf',     tx: 3,  tz: 28, hp: 85,  xp: 42,  gold: 18 },
      { type: 'wolf',     tx: 6,  tz: 32, hp: 85,  xp: 42,  gold: 18 },
      { type: 'wolf',     tx: 10, tz: 30, hp: 85,  xp: 42,  gold: 18 },
      { type: 'dragon',   tx: 33, tz: 3,  hp: 350, xp: 200, gold: 100 },
      { type: 'dragon',   tx: 36, tz: 7,  hp: 350, xp: 200, gold: 100 },
    ]

    const enemies: EnemyState[] = enemySpawnData.map((d, i) => {
      const mesh = buildEnemyMesh(d.type)
      const wx = d.tx * TILE + TILE / 2
      const wz = d.tz * TILE + TILE / 2
      mesh.position.set(wx, 0.3, wz)
      scene.add(mesh)
      return {
        id: i,
        type: d.type,
        x: wx, z: wz,
        hp: d.hp, maxHp: d.hp,
        state: 'patrol',
        homeX: wx, homeZ: wz,
        stateTimer: Math.random() * 3,
        atkTimer: 0,
        xpReward: d.xp,
        goldReward: d.gold,
        mesh,
      }
    })

    // ── Game State ────────────────────────────────────────────────────────────
    const clsStats = CLASS_STATS[cls]
    const gs: GameState = {
      player: {
        x: 20 * TILE + TILE / 2,
        z: 20 * TILE + TILE / 2,
        hp: clsStats.maxHp,
        maxHp: clsStats.maxHp,
        mp: clsStats.maxMp,
        maxMp: clsStats.maxMp,
        level: 1,
        xp: 0,
        xpNext: 100,
        gold: 0,
        atk: clsStats.atk,
        def: clsStats.def,
        spd: clsStats.spd,
        dir: 'down',
        atkTimer: 0,
        invTimer: 0,
        dead: false,
        respTimer: 0,
        name: playerName || 'HERO',
        cls,
        skillCooldowns: [0, 0, 0, 0],
      },
      enemies,
      damageNumbers: [],
      particles: [],
      keys: new Set(),
      lastTime: 0,
      chatMessages: [
        { name: 'SYSTEM', text: 'Welcome! WASD=move SPACE=attack Q/W/E/R=skills', color: '#ffd700', age: 0 },
        { name: 'SYSTEM', text: 'Dungeon portal at northeast!', color: '#cc88ff', age: 0.5 },
      ],
      chatTimer: 5,
    }
    gsRef.current = gs

    // ── Input ─────────────────────────────────────────────────────────────────
    const onKey = (e: KeyboardEvent) => {
      if (e.type === 'keydown') {
        gs.keys.add(e.code)
        if (e.code === 'Space') { e.preventDefault(); doAttack() }
        if (e.code === 'KeyQ') useSkill(0)
        if (e.code === 'KeyW' && e.shiftKey) useSkill(1)
        if (e.code === 'KeyE') useSkill(2)
        if (e.code === 'KeyR') useSkill(3)
      } else {
        gs.keys.delete(e.code)
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)

    // ── Combat ────────────────────────────────────────────────────────────────
    function spawnParticles(x: number, z: number, color: string, count = 5) {
      const geo = new THREE.BoxGeometry(0.1, 0.1, 0.1)
      const mat = new THREE.MeshBasicMaterial({ color })
      for (let i = 0; i < count; i++) {
        const mesh = new THREE.Mesh(geo, mat)
        mesh.position.set(x, 0.8, z)
        scene.add(mesh)
        gs.particles.push({
          mesh,
          vx: (Math.random() - 0.5) * 4,
          vz: (Math.random() - 0.5) * 4,
          vy: Math.random() * 4 + 2,
          life: 1,
        })
      }
    }

    function spawnDamageNumber(x: number, z: number, value: number, color: string) {
      const text = value === 0 ? 'LEVEL UP!' : `-${value}`
      const sprite = makeDamageSprite(text, color)
      sprite.position.set(x, 2.5, z)
      scene.add(sprite)
      gs.damageNumbers.push({ value, color, x, z, life: 1, sprite })
    }

    function doAttack() {
      const { player } = gs
      if (player.atkTimer > 0 || player.dead) return
      const range = player.cls === 'archer' ? 8 : player.cls === 'mage' ? 6 : 3.5
      for (const en of gs.enemies) {
        if (en.state === 'dead') continue
        const dx = player.x - en.x
        const dz = player.z - en.z
        const dist = Math.sqrt(dx * dx + dz * dz)
        if (dist <= range) {
          const dmg = Math.max(1, player.atk + Math.floor(Math.random() * 12) - Math.floor(en.type === 'dragon' ? 10 : 0))
          en.hp -= dmg
          spawnDamageNumber(en.x, en.z, dmg, '#ff4444')
          spawnParticles(en.x, en.z, '#ff4444', 4)
          if (en.hp <= 0) {
            en.state = 'dead'
            en.mesh.visible = false
            spawnParticles(en.x, en.z, '#ffd700', 8)
            player.xp += en.xpReward
            player.gold += en.goldReward
            spawnDamageNumber(en.x, en.z - 0.5, en.xpReward, '#ffd700')
            // Level up
            while (player.xp >= player.xpNext) {
              player.xp -= player.xpNext
              player.level++
              player.xpNext = Math.floor(player.xpNext * 1.6)
              player.maxHp += 20
              player.hp = player.maxHp
              player.atk += 3
              player.def += 2
              spawnDamageNumber(player.x, player.z, 0, '#ffffff')
              gs.chatMessages.push({ name: 'SYSTEM', text: `${player.name} reached Level ${player.level}!`, color: '#ffd700', age: 0 })
            }
            // Respawn after 15s
            setTimeout(() => {
              en.hp = en.maxHp
              en.state = 'patrol'
              en.x = en.homeX
              en.z = en.homeZ
              en.mesh.position.set(en.x, 0.3, en.z)
              en.mesh.visible = true
            }, 15000)
          }
        }
      }
      player.atkTimer = player.cls === 'warrior' ? 0.5 : player.cls === 'mage' ? 1.0 : player.cls === 'rogue' ? 0.3 : player.cls === 'archer' ? 0.6 : 0.7
    }

    function useSkill(slot: number) {
      const { player } = gs
      if (player.skillCooldowns[slot] > 0 || player.dead) return
      const mpCost = [20, 30, 25, 40]
      if (player.mp < mpCost[slot]) return
      player.mp -= mpCost[slot]
      const cooldowns = [3, 8, 5, 12]
      player.skillCooldowns[slot] = cooldowns[slot]

      // Skill effects
      const range = [6, 10, 5, 8][slot]
      let hits = 0
      for (const en of gs.enemies) {
        if (en.state === 'dead') continue
        const dx = player.x - en.x
        const dz = player.z - en.z
        if (Math.sqrt(dx * dx + dz * dz) <= range) {
          const dmgMult = [1.5, 2.5, 2.0, 3.0][slot]
          const dmg = Math.floor((player.atk + Math.random() * 15) * dmgMult)
          en.hp -= dmg
          spawnDamageNumber(en.x, en.z, dmg, ['#ffaa00', '#cc44ff', '#44ffaa', '#ff4400'][slot])
          spawnParticles(en.x, en.z, ['#ff8800', '#aa44ff', '#44ffaa', '#ff4400'][slot], 6)
          hits++
          if (en.hp <= 0) {
            en.state = 'dead'
            en.mesh.visible = false
            player.xp += en.xpReward
            player.gold += en.goldReward
          }
        }
      }
      spawnParticles(player.x, player.z, ['#ffaa00', '#cc44ff', '#44ffaa', '#ff4400'][slot], hits > 0 ? 10 : 5)
    }

    // ── Fake chat ─────────────────────────────────────────────────────────────
    const fakePlayers = [
      { name: 'Eeyo', color: '#ff9060' },
      { name: 'MageKing', color: '#cc66ff' },
      { name: 'ShadowBlade', color: '#60ff80' },
      { name: 'IronShield', color: '#60d0ff' },
    ]
    const fakeMsgs = [
      'Anyone want to raid dungeon?', 'LFG dragon boss!', 'WTS rare sword NFT',
      'Dragon drops 200g!', 'Guild recruiting!', 'WASD to move, SPACE to attack!',
      'Just hit level 10!', 'Portal is open tonight!',
    ]

    // ── Helpers ───────────────────────────────────────────────────────────────
    function isWalkable(x: number, z: number): boolean {
      const tx = Math.floor(x / TILE)
      const tz = Math.floor(z / TILE)
      if (tx < 0 || tz < 0 || tx >= MAP_W || tz >= MAP_H) return false
      const t = worldMap[tz][tx]
      return t !== 'water'
    }

    // ── Update ────────────────────────────────────────────────────────────────
    function update(dt: number) {
      const { player } = gs
      dt = Math.min(dt, 0.05)

      // Respawn
      if (player.dead) {
        player.respTimer -= dt
        if (player.respTimer <= 0) {
          player.dead = false
          player.hp = player.maxHp
          player.mp = Math.floor(player.maxMp * 0.5)
          player.x = 20 * TILE + TILE / 2
          player.z = 20 * TILE + TILE / 2
          playerMesh.visible = true
        }
        return
      }

      // Timers
      player.atkTimer = Math.max(0, player.atkTimer - dt)
      player.invTimer = Math.max(0, player.invTimer - dt)
      player.skillCooldowns = player.skillCooldowns.map(cd => Math.max(0, cd - dt))
      if (player.mp < player.maxMp) player.mp = Math.min(player.maxMp, player.mp + dt * 6)

      // Movement
      let dx = 0, dz = 0
      if (gs.keys.has('KeyW') || gs.keys.has('ArrowUp')) dz -= 1
      if (gs.keys.has('KeyS') || gs.keys.has('ArrowDown')) dz += 1
      if (gs.keys.has('KeyA') || gs.keys.has('ArrowLeft')) dx -= 1
      if (gs.keys.has('KeyD') || gs.keys.has('ArrowRight')) dx += 1
      if (dx !== 0 && dz !== 0) { dx *= 0.707; dz *= 0.707 }

      const spd = player.spd * dt
      const nx = player.x + dx * spd
      const nz = player.z + dz * spd
      if (isWalkable(nx, player.z)) player.x = Math.max(TILE, Math.min((MAP_W - 1) * TILE, nx))
      if (isWalkable(player.x, nz)) player.z = Math.max(TILE, Math.min((MAP_H - 1) * TILE, nz))

      // Walking bob animation
      if (dx !== 0 || dz !== 0) {
        const bob = Math.sin(Date.now() * 0.01) * 0.06
        playerMesh.position.set(player.x, 0.3 + bob, player.z)
        // Face direction
        if (Math.abs(dx) > Math.abs(dz)) {
          playerMesh.rotation.y = dx > 0 ? -Math.PI / 2 : Math.PI / 2
        } else {
          playerMesh.rotation.y = dz > 0 ? 0 : Math.PI
        }
      } else {
        playerMesh.position.set(player.x, 0.3, player.z)
      }
      playerShadow.position.set(player.x, 0.31, player.z)
      playerLight.position.set(player.x, 2.5, player.z)

      // Camera follow (smooth)
      const targetCamX = player.x
      const targetCamZ = player.z
      camera.position.x += (targetCamX - (camera.position.x - 20)) * 0.08
      camera.position.z += (targetCamZ - (camera.position.z - 20)) * 0.08
      camera.lookAt(camera.position.x - 20, 0, camera.position.z - 20)

      // Enemy AI
      for (const en of gs.enemies) {
        if (en.state === 'dead') continue
        en.atkTimer = Math.max(0, en.atkTimer - dt)
        en.stateTimer -= dt

        const dx2 = player.x - en.x
        const dz2 = player.z - en.z
        const dist = Math.sqrt(dx2 * dx2 + dz2 * dz2)

        const aggroRange = en.type === 'dragon' ? 15 : en.type === 'orc' ? 10 : 8
        const attackRange = en.type === 'dragon' ? 4 : 2.5
        const enemySpd = en.type === 'dragon' ? 2.0 : en.type === 'wolf' ? 3.5 : en.type === 'orc' ? 2.5 : 2.0

        if (en.state === 'patrol') {
          if (en.stateTimer <= 0) {
            en.stateTimer = 1.5 + Math.random() * 2
            const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]]
            const [pdx, pdz] = dirs[Math.floor(Math.random() * 4)]
            const px = en.x + pdx * 0.8
            const pz = en.z + pdz * 0.8
            if (isWalkable(px, pz)) { en.x = px; en.z = pz }
          }
          if (!player.dead && dist < aggroRange) en.state = 'chase'
        } else if (en.state === 'chase') {
          if (player.dead || dist > aggroRange * 1.5) { en.state = 'patrol'; continue }
          if (dist < attackRange) { en.state = 'attack'; continue }
          const angle = Math.atan2(dz2, dx2)
          const mx = Math.cos(angle) * enemySpd * dt
          const mz = Math.sin(angle) * enemySpd * dt
          if (isWalkable(en.x + mx, en.z)) en.x += mx
          if (isWalkable(en.x, en.z + mz)) en.z += mz
          en.mesh.rotation.y = -angle - Math.PI / 2
        } else if (en.state === 'attack') {
          if (player.dead || dist > attackRange * 2) { en.state = 'chase'; continue }
          if (en.stateTimer <= 0 && en.atkTimer === 0) {
            en.stateTimer = en.type === 'dragon' ? 2.0 : en.type === 'wolf' ? 1.0 : 1.4
            if (!player.dead && player.invTimer === 0) {
              const baseDmg = en.type === 'dragon' ? 45 : en.type === 'orc' ? 25 : en.type === 'wolf' ? 18 : 15
              const dmg = Math.max(0, baseDmg - player.def + Math.floor(Math.random() * 8))
              player.hp -= dmg
              player.invTimer = 0.7
              spawnDamageNumber(player.x, player.z, dmg, '#ff8800')
              spawnParticles(player.x, player.z, '#ff4444', 3)
              if (player.hp <= 0) {
                player.hp = 0
                player.dead = true
                player.respTimer = 5
                playerMesh.visible = false
                gs.chatMessages.push({ name: 'SYSTEM', text: 'You died! Respawning in 5s...', color: '#ff4444', age: 0 })
              }
            }
            en.atkTimer = 0.3
          }
        }

        en.mesh.position.set(en.x, 0.3, en.z)
        // Hover bob
        const eBob = Math.sin(Date.now() * 0.008 + en.id) * 0.05
        en.mesh.position.y = 0.3 + eBob
      }

      // Damage numbers
      gs.damageNumbers = gs.damageNumbers.filter(d => {
        d.life -= dt * 1.2
        d.sprite.position.y += dt * 1.5
        d.sprite.material.opacity = d.life
        if (d.life <= 0) { scene.remove(d.sprite); d.sprite.material.dispose() }
        return d.life > 0
      })

      // Particles
      gs.particles = gs.particles.filter(p => {
        p.life -= dt * 2
        p.mesh.position.x += p.vx * dt
        p.mesh.position.y += p.vy * dt
        p.mesh.position.z += p.vz * dt
        p.vy -= 9.8 * dt
        const mat = p.mesh.material as THREE.MeshBasicMaterial
        mat.opacity = p.life
        mat.transparent = true
        if (p.life <= 0) { scene.remove(p.mesh); p.mesh.geometry.dispose(); mat.dispose() }
        return p.life > 0
      })

      // Portal rotation
      portal.rotation.z += dt * 1.2
      portalLight.intensity = 3 + Math.sin(Date.now() * 0.003) * 1

      // Torch flicker
      for (const t of torchLights) {
        t.light.intensity = 2.5 + Math.sin(Date.now() * 0.004 + t.x) * 0.8
      }

      // Chat
      gs.chatMessages = gs.chatMessages.filter(m => { m.age += dt; return m.age < 10 })
      gs.chatTimer -= dt
      if (gs.chatTimer <= 0) {
        gs.chatTimer = 4 + Math.random() * 6
        const fp = fakePlayers[Math.floor(Math.random() * fakePlayers.length)]
        gs.chatMessages.push({ name: fp.name, text: fakeMsgs[Math.floor(Math.random() * fakeMsgs.length)], color: fp.color, age: 0 })
        if (gs.chatMessages.length > 8) gs.chatMessages = gs.chatMessages.slice(-8)
      }

      // HUD update
      onHUDUpdate({
        playerName: player.name,
        playerClass: player.cls,
        level: player.level,
        hp: player.hp,
        maxHp: player.maxHp,
        mp: player.mp,
        maxMp: player.maxMp,
        xp: player.xp,
        xpNext: player.xpNext,
        gold: player.gold,
        skillCooldowns: [...player.skillCooldowns],
        chatMessages: [...gs.chatMessages],
        dead: player.dead,
        respTimer: player.respTimer,
        enemyCount: gs.enemies.filter(e => e.state !== 'dead').length,
      })
    }

    // ── Render Loop ───────────────────────────────────────────────────────────
    function loop(ts: number) {
      const dt = gs.lastTime ? (ts - gs.lastTime) / 1000 : 0
      gs.lastTime = ts
      update(dt)
      renderer.render(scene, camera)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)

    // ── Resize ────────────────────────────────────────────────────────────────
    const onResize = () => {
      const w = mount.clientWidth || 960
      const h = mount.clientHeight || 580
      renderer.setSize(w, h)
      const asp = w / h
      const fH = 20
      const fW = fH * asp
      ;(camera as THREE.OrthographicCamera).left = -fW / 2
      ;(camera as THREE.OrthographicCamera).right = fW / 2
      ;(camera as THREE.OrthographicCamera).top = fH / 2
      ;(camera as THREE.OrthographicCamera).bottom = -fH / 2
      camera.updateProjectionMatrix()
    }
    window.addEventListener('resize', onResize)

    // ── Cleanup ───────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
      window.removeEventListener('resize', onResize)
      renderer.dispose()
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement)
      // Dispose textures
      Object.values(textures).forEach(t => t.dispose())
      Object.values(tileMats).forEach(m => m.dispose())
    }
  }, [getClass, onHUDUpdate, playerName])

  return (
    <div
      ref={mountRef}
      className="w-full"
      style={{ height: '580px', background: '#0a0818', cursor: 'crosshair' }}
      tabIndex={0}
    />
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(MMORPGGame as any).displayName = 'MMORPGGame'
