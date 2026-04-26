// Generate pixel art assets programmatically using node-canvas style
// Creates PNG files in /public/assets/
const { createCanvas } = require('canvas')
const fs = require('fs')
const path = require('path')

const OUT = path.join(__dirname, '../public/assets')
fs.mkdirSync(OUT, { recursive: true })

// ── Palette ────────────────────────────────────────────────────────────────────
const P = {
  // Grass
  g1: '#4a8c30', g2: '#5aaa3c', g3: '#3a7020', g4: '#68c044',
  // Sand/path
  s1: '#c8904a', s2: '#d4a060', s3: '#b87838',
  // Stone
  t1: '#888070', t2: '#a09888', t3: '#706860', t4: '#b0a898',
  // Dungeon
  d1: '#18102a', d2: '#221840', d3: '#2a2048', d4: '#302060',
  // Water
  w1: '#1a4a8a', w2: '#2060b0', w3: '#3080cc', w4: '#60a8e8',
  // Wall
  wl1: '#3a3050', wl2: '#4a4068', wl3: '#5a5080',
  // Tree
  tr1: '#1a5010', tr2: '#286018', tr3: '#38801e', tr4: '#4aaa28',
  trunk: '#6a3c18', trunk2: '#8a5020',
  // Buildings
  bw: '#8a5a2a', br: '#8a1a1a', bs: '#6a4a3a',
  // Transparent
  _: null,
}

function hex2rgb(hex) {
  const r = parseInt(hex.slice(1,3),16)
  const g = parseInt(hex.slice(3,5),16)
  const b = parseInt(hex.slice(5,7),16)
  return [r, g, b]
}

// Draw a 16x16 tile onto canvas at (tx*16, ty*16)
function drawTile(ctx, tx, ty, pixels) {
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const col = pixels[y]?.[x]
      if (!col) continue
      const [r, g, b] = hex2rgb(col)
      ctx.fillStyle = `rgb(${r},${g},${b})`
      ctx.fillRect(tx * 16 + x, ty * 16 + y, 1, 1)
    }
  }
}

// ── TILESET: 16 tiles wide × 8 tiles tall = 256×128 ──────────────────────────
const TILESET_W = 16
const TILESET_H = 8
const tileCanvas = createCanvas(TILESET_W * 16, TILESET_H * 16)
const tCtx = tileCanvas.getContext('2d')

// Tile 0,0: Grass
const grassTile = [
  [P.g1,P.g1,P.g2,P.g1,P.g1,P.g4,P.g1,P.g1,P.g1,P.g2,P.g1,P.g1,P.g4,P.g1,P.g1,P.g1],
  [P.g1,P.g3,P.g1,P.g1,P.g1,P.g1,P.g1,P.g2,P.g1,P.g1,P.g1,P.g3,P.g1,P.g1,P.g1,P.g2],
  [P.g2,P.g1,P.g1,P.g4,P.g1,P.g1,P.g1,P.g1,P.g3,P.g1,P.g1,P.g1,P.g1,P.g4,P.g1,P.g1],
  [P.g1,P.g1,P.g3,P.g1,P.g1,P.g2,P.g1,P.g1,P.g1,P.g1,P.g4,P.g1,P.g1,P.g1,P.g3,P.g1],
  [P.g1,P.g4,P.g1,P.g1,P.g1,P.g1,P.g3,P.g1,P.g1,P.g1,P.g1,P.g2,P.g1,P.g1,P.g1,P.g1],
  [P.g3,P.g1,P.g1,P.g1,P.g2,P.g1,P.g1,P.g1,P.g4,P.g1,P.g1,P.g1,P.g1,P.g3,P.g1,P.g2],
  [P.g1,P.g1,P.g2,P.g1,P.g1,P.g1,P.g1,P.g3,P.g1,P.g1,P.g2,P.g1,P.g1,P.g1,P.g4,P.g1],
  [P.g1,P.g3,P.g1,P.g1,P.g1,P.g4,P.g1,P.g1,P.g1,P.g3,P.g1,P.g1,P.g1,P.g2,P.g1,P.g1],
  [P.g2,P.g1,P.g1,P.g1,P.g3,P.g1,P.g2,P.g1,P.g1,P.g1,P.g1,P.g4,P.g1,P.g1,P.g1,P.g3],
  [P.g1,P.g1,P.g4,P.g1,P.g1,P.g1,P.g1,P.g1,P.g3,P.g1,P.g1,P.g1,P.g2,P.g1,P.g1,P.g1],
  [P.g1,P.g2,P.g1,P.g1,P.g1,P.g3,P.g1,P.g4,P.g1,P.g1,P.g1,P.g1,P.g1,P.g3,P.g1,P.g2],
  [P.g3,P.g1,P.g1,P.g2,P.g1,P.g1,P.g1,P.g1,P.g2,P.g1,P.g4,P.g1,P.g1,P.g1,P.g1,P.g1],
  [P.g1,P.g1,P.g3,P.g1,P.g4,P.g1,P.g1,P.g1,P.g1,P.g1,P.g1,P.g1,P.g3,P.g1,P.g2,P.g1],
  [P.g1,P.g4,P.g1,P.g1,P.g1,P.g1,P.g2,P.g1,P.g1,P.g3,P.g1,P.g4,P.g1,P.g1,P.g1,P.g1],
  [P.g2,P.g1,P.g1,P.g1,P.g1,P.g3,P.g1,P.g1,P.g1,P.g1,P.g2,P.g1,P.g1,P.g4,P.g1,P.g3],
  [P.g1,P.g1,P.g4,P.g1,P.g2,P.g1,P.g1,P.g3,P.g1,P.g4,P.g1,P.g1,P.g1,P.g1,P.g1,P.g1],
]
drawTile(tCtx, 0, 0, grassTile)

// Tile 1,0: Sand/Path
const sandTile = Array.from({length:16}, (_,y) => Array.from({length:16}, (_,x) => {
  if ((x+y*3)%7===0) return P.s3
  if ((x*2+y)%9===0) return P.s2
  return P.s1
}))
drawTile(tCtx, 1, 0, sandTile)

// Tile 2,0: Stone floor
const stoneTile = Array.from({length:16}, (_,y) => Array.from({length:16}, (_,x) => {
  // Grout lines
  if (y === 7 || y === 8) return P.t3
  if ((y < 8 && x === 8) || (y >= 8 && x === 4) || (y >= 8 && x === 12)) return P.t3
  if (x === 0 || y === 0) return P.t3
  return (x+y)%3===0 ? P.t1 : (x*y)%5===0 ? P.t4 : P.t2
}))
drawTile(tCtx, 2, 0, stoneTile)

// Tile 3,0: Dungeon floor
const dungTile = Array.from({length:16}, (_,y) => Array.from({length:16}, (_,x) => {
  if (y === 7 || y === 8) return P.d1
  if ((y<8 && x===8) || (y>=8 && x===4) || (y>=8 && x===12)) return P.d1
  return (x+y)%4===0 ? P.d3 : (x*3+y*2)%7===0 ? P.d4 : P.d2
}))
drawTile(tCtx, 3, 0, dungTile)

// Tile 4,0: Water (frame 1)
const waterTile1 = Array.from({length:16}, (_,y) => Array.from({length:16}, (_,x) => {
  if (y===3||y===4||y===11||y===12) return P.w3
  if (y===5&&(x>4&&x<12)) return P.w4
  if (y===13&&(x>6&&x<14)) return P.w4
  return P.w2
}))
drawTile(tCtx, 4, 0, waterTile1)

// Tile 5,0: Water (frame 2 - animated)
const waterTile2 = Array.from({length:16}, (_,y) => Array.from({length:16}, (_,x) => {
  if (y===5||y===6||y===13||y===14) return P.w3
  if (y===7&&(x>3&&x<11)) return P.w4
  return P.w1
}))
drawTile(tCtx, 5, 0, waterTile2)

// Tile 6,0: Deep grass / forest floor
const deepGrassTile = Array.from({length:16}, (_,y) => Array.from({length:16}, (_,x) => {
  const dark = '#2a5a18', mid = '#3a7020', light = '#4a8020'
  if (x===2||x===3) return (y%4<2) ? mid : dark
  if (x===8||x===9) return (y%6<3) ? light : mid
  if (x===13||x===14) return (y%5<2) ? mid : dark
  return dark
}))
drawTile(tCtx, 6, 0, deepGrassTile)

// Tile 7,0: Wall top
const wallTopTile = Array.from({length:16}, (_,y) => Array.from({length:16}, (_,x) => {
  if (y >= 12) return P.wl3
  if (y >= 10) return P.wl2
  if (y === 9 || y === 0) return P.wl1
  if (x >= 12) return (y%4===0) ? P.wl1 : P.wl2
  if (x <= 3) return (y%4===2) ? P.wl1 : P.wl2
  return P.wl3
}))
drawTile(tCtx, 7, 0, wallTopTile)

// Tile 8,0: Dungeon wall
const dungWallTile = Array.from({length:16}, (_,y) => Array.from({length:16}, (_,x) => {
  if (x === 0 || x === 15 || y === 0 || y === 15) return '#0a0818'
  if ((x === 3 || x === 12) && y > 2 && y < 13) return '#100c1e'
  if (y === 7 || y === 8) return '#100c1e'
  return P.d3
}))
drawTile(tCtx, 8, 0, dungWallTile)

// Tile 9,0: Dirt/Earth
const dirtTile = Array.from({length:16}, (_,y) => Array.from({length:16}, (_,x) => {
  const c = ['#7a5030','#6a4028','#8a6038','#5a3820']
  return c[(x*3+y*5)%4]
}))
drawTile(tCtx, 9, 0, dirtTile)

// Tile 10,0: Lava/fire floor (for dungeon boss area)
const lavaTile = Array.from({length:16}, (_,y) => Array.from({length:16}, (_,x) => {
  const d = (x*7+y*11)%16
  if (d < 4) return '#ff4400'
  if (d < 8) return '#ff8800'
  if (d < 12) return '#cc3300'
  return '#aa2200'
}))
drawTile(tCtx, 10, 0, lavaTile)

// Row 1: Decoration tiles
// Tile 0,1: Tree (full tile)
const treeTile = Array.from({length:16}, (_,y) => Array.from({length:16}, (_,x) => {
  // Trunk center
  if (x >= 6 && x <= 9 && y >= 10 && y <= 15) return P.trunk
  if (x >= 7 && x <= 8 && y >= 8 && y <= 15) return P.trunk2
  // Canopy
  const cx = 8, cy = 6
  const dist = Math.sqrt((x-cx)**2 + (y-cy)**2)
  if (dist < 7) {
    if (dist < 3) return P.tr4
    if (dist < 5) return P.tr3
    return P.tr2
  }
  return null // transparent
}))
drawTile(tCtx, 0, 1, treeTile)

// Tile 1,1: Bush
const bushTile = Array.from({length:16}, (_,y) => Array.from({length:16}, (_,x) => {
  const dist1 = Math.sqrt((x-5)**2 + (y-9)**2)
  const dist2 = Math.sqrt((x-11)**2 + (y-9)**2)
  const dist3 = Math.sqrt((x-8)**2 + (y-7)**2)
  const inBush = dist1 < 4 || dist2 < 4 || dist3 < 4
  if (!inBush) return null
  if (dist3 < 2 || dist1 < 2 || dist2 < 2) return P.tr4
  if ((x+y)%3===0) return P.tr3
  return P.tr2
}))
drawTile(tCtx, 1, 1, bushTile)

// Tile 2,1: Rock
const rockTile = Array.from({length:16}, (_,y) => Array.from({length:16}, (_,x) => {
  const dist = Math.sqrt((x-8)**2 + (y-9)**2)
  if (dist > 6) return null
  const shade = ['#888070','#a09888','#706860','#b0a898','#c0b8a8']
  if (dist < 2) return shade[4]
  if (x < 8 && y < 9) return shade[3]
  if (x > 8 && y > 9) return shade[1]
  return shade[2]
}))
drawTile(tCtx, 2, 1, rockTile)

// Tile 3,1: Torch (base)
const torchTile = Array.from({length:16}, (_,y) => Array.from({length:16}, (_,x) => {
  // Pole
  if (x === 7 || x === 8) {
    if (y >= 6 && y <= 14) return '#6a4010'
    if (y >= 4 && y < 6) return '#ff8820'
    if (y >= 2 && y < 4) return '#ffcc40'
    if (y < 2) return '#ffee80'
  }
  if ((x===6||x===9) && y>=4&&y<=5) return '#ff6010'
  return null
}))
drawTile(tCtx, 3, 1, torchTile)

// Tile 4,1: Barrel
const barrelTile = Array.from({length:16}, (_,y) => Array.from({length:16}, (_,x) => {
  const dist = Math.sqrt((x-8)**2 + (y-9)**2)
  if (dist > 5.5) return null
  if (y === 4 || y === 14 || y === 9) return '#5a3010'  // hoops
  if (x < 9) return '#8a5828'
  return '#6a4018'
}))
drawTile(tCtx, 4, 1, barrelTile)

// Tile 5,1: Chest (closed)
const chestTile = Array.from({length:16}, (_,y) => Array.from({length:16}, (_,x) => {
  if (x<2||x>13||y<4||y>13) return null
  if (y === 4 || y === 13 || x === 2 || x === 13) return '#5a3010'
  if (y >= 4 && y <= 8) {
    // Lid
    if (y === 8) return '#5a3010'  // hinge
    return '#8a5020'
  }
  // Body
  if (x === 7 || x === 8) return y===10 ? '#ffd700' : '#8a5020'  // lock
  return '#7a4818'
}))
drawTile(tCtx, 5, 1, chestTile)

// Tile 6,1: Portal swirl (frame 1)
const portalTile = Array.from({length:16}, (_,y) => Array.from({length:16}, (_,x) => {
  const dist = Math.sqrt((x-8)**2 + (y-8)**2)
  const angle = Math.atan2(y-8, x-8)
  if (dist > 7) return null
  if (dist < 2) return '#ffffff'
  const hue = (angle / (2*Math.PI) + dist/7) % 1
  if (hue < 0.33) return '#cc44ff'
  if (hue < 0.66) return '#8822cc'
  return '#aa33ee'
}))
drawTile(tCtx, 6, 1, portalTile)

// Save tileset
fs.writeFileSync(path.join(OUT, 'tileset.png'), tileCanvas.toBuffer('image/png'))
console.log('tileset.png generated')

// ── CHARACTER SPRITESHEET ─────────────────────────────────────────────────────
// 16×24 per frame, 8 frames per row, 6 rows (5 classes + 1 enemy row)
// Row order: warrior, mage, rogue, archer, paladin
// Col order: walk_down(0-2), walk_left(3-5), walk_right(6-8), attack(9-11)
const SPR_W = 16, SPR_H = 24
const SPR_COLS = 12, SPR_ROWS = 5

const sprCanvas = createCanvas(SPR_W * SPR_COLS, SPR_H * SPR_ROWS)
const sCtx = sprCanvas.getContext('2d')
sCtx.clearRect(0, 0, sprCanvas.width, sprCanvas.height)

function drawCharSprite(ctx, sx, sy, bodyCol, headCol, accentCol, frame, dir, attacking) {
  const baseX = sx * SPR_W
  const baseY = sy * SPR_H
  // Clear
  ctx.clearRect(baseX, baseY, SPR_W, SPR_H)

  // Walking bob
  const bob = (frame === 1) ? 1 : 0
  // Leg swing
  const legSwing = (dir === 'attack') ? 0 : (frame % 2 === 0 ? 1 : -1)

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.fillRect(baseX + 4, baseY + 22, 8, 2)

  // Legs
  ctx.fillStyle = accentCol
  if (dir === 'left' || dir === 'right') {
    ctx.fillRect(baseX + 4, baseY + 16 + bob, 3, 6)
    ctx.fillRect(baseX + 9, baseY + 16 + bob, 3, 6 + (legSwing > 0 ? -1 : 1))
  } else {
    ctx.fillRect(baseX + 4, baseY + 16 + bob, 3, 6 + (legSwing > 0 ? 1 : 0))
    ctx.fillRect(baseX + 9, baseY + 16 + bob, 3, 6 - (legSwing > 0 ? 1 : 0))
  }

  // Body
  ctx.fillStyle = bodyCol
  ctx.fillRect(baseX + 3, baseY + 10 + bob, 10, 8)

  // Belt/trim
  ctx.fillStyle = accentCol
  ctx.fillRect(baseX + 3, baseY + 16 + bob, 10, 1)

  // Arms
  ctx.fillStyle = bodyCol
  if (attacking) {
    // Attack pose: right arm extended
    ctx.fillRect(baseX + 1, baseY + 11 + bob, 2, 4)
    ctx.fillRect(baseX + 13, baseY + 10 + bob, 3, 2)  // extended arm
    ctx.fillRect(baseX + 14, baseY + 10 + bob, 2, 6)  // weapon
  } else {
    ctx.fillRect(baseX + 1, baseY + 11 + bob, 2, 4)
    ctx.fillRect(baseX + 13, baseY + 11 + bob, 2, 4)
  }

  // Head
  ctx.fillStyle = headCol
  ctx.fillRect(baseX + 4, baseY + 3 + bob, 8, 8)
  // Eyes
  ctx.fillStyle = '#1a1010'
  if (dir === 'right') {
    ctx.fillRect(baseX + 10, baseY + 6 + bob, 1, 1)
    ctx.fillRect(baseX + 10, baseY + 7 + bob, 1, 1)
  } else if (dir === 'left') {
    ctx.fillRect(baseX + 5, baseY + 6 + bob, 1, 1)
    ctx.fillRect(baseX + 5, baseY + 7 + bob, 1, 1)
  } else {
    ctx.fillRect(baseX + 6, baseY + 6 + bob, 1, 2)
    ctx.fillRect(baseX + 9, baseY + 6 + bob, 1, 2)
  }

  // Hair/hat highlight
  ctx.fillStyle = accentCol
  ctx.fillRect(baseX + 4, baseY + 2 + bob, 8, 2)

  // Outline
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'
  ctx.lineWidth = 0.5
  ctx.strokeRect(baseX + 4, baseY + 3 + bob, 8, 8)
  ctx.strokeRect(baseX + 3, baseY + 10 + bob, 10, 8)
}

const classData = [
  { bodyCol: '#3a55b0', headCol: '#f5c870', accentCol: '#ffd700' },  // warrior
  { bodyCol: '#7010c0', headCol: '#f5c870', accentCol: '#cc88ff' },  // mage
  { bodyCol: '#1a1a28', headCol: '#f5c870', accentCol: '#44ff88' },  // rogue
  { bodyCol: '#1e6018', headCol: '#f5c870', accentCol: '#ffcc44' },  // archer
  { bodyCol: '#b89020', headCol: '#f5c870', accentCol: '#ffffff' },  // paladin
]

const dirs = ['down', 'left', 'right']
for (let row = 0; row < classData.length; row++) {
  const { bodyCol, headCol, accentCol } = classData[row]
  // Walk frames: 3 dirs × 3 frames
  for (let d = 0; d < 3; d++) {
    for (let f = 0; f < 3; f++) {
      drawCharSprite(sCtx, d*3+f, row, bodyCol, headCol, accentCol, f, dirs[d], false)
    }
  }
  // Attack frames: 3 frames
  for (let f = 0; f < 3; f++) {
    drawCharSprite(sCtx, 9+f, row, bodyCol, headCol, accentCol, f, 'attack', true)
  }
}

fs.writeFileSync(path.join(OUT, 'characters.png'), sprCanvas.toBuffer('image/png'))
console.log('characters.png generated')

// ── ENEMY SPRITESHEET ─────────────────────────────────────────────────────────
// 24×24 per frame, 9 frames per enemy (3 walk + 3 attack + 3 death), 4 enemy types
const ENE_W = 24, ENE_H = 24
const ENE_COLS = 9, ENE_ROWS = 4

const eneCanvas = createCanvas(ENE_W * ENE_COLS, ENE_H * ENE_ROWS)
const eCtx = eneCanvas.getContext('2d')
eCtx.clearRect(0, 0, eneCanvas.width, eneCanvas.height)

function drawEnemySprite(ctx, ex, ey, type, frame, state) {
  const bx = ex * ENE_W
  const by = ey * ENE_H
  ctx.clearRect(bx, by, ENE_W, ENE_H)
  const bob = state === 'walk' ? (frame % 2 === 0 ? 0 : 1) : 0
  const atk = state === 'attack'

  if (type === 'skeleton') {
    // Skull
    ctx.fillStyle = '#d8d0b0'
    ctx.fillRect(bx+7, by+2+bob, 10, 9)
    // Eye sockets
    ctx.fillStyle = '#cc2222'
    ctx.fillRect(bx+9, by+5+bob, 2, 2)
    ctx.fillRect(bx+13, by+5+bob, 2, 2)
    // Teeth
    ctx.fillStyle = '#f0ead0'
    for (let t=0;t<3;t++) ctx.fillRect(bx+9+t*2, by+10+bob, 1, 2)
    // Ribcage
    ctx.fillStyle = '#c8c0a0'
    ctx.fillRect(bx+6, by+12+bob, 12, 7)
    for (let r=0;r<3;r++) {
      ctx.fillStyle = '#a0988060'
      ctx.fillRect(bx+6, by+13+r*2+bob, 12, 1)
    }
    // Arms
    ctx.fillStyle = '#c8c0a0'
    if (atk) {
      ctx.fillRect(bx+2, by+12+bob, 4, 2)
      ctx.fillRect(bx+18, by+11+bob, 5, 2)
    } else {
      ctx.fillRect(bx+2, by+12+bob, 4, 6)
      ctx.fillRect(bx+18, by+12+bob, 4, 6)
    }
    // Legs
    ctx.fillRect(bx+8, by+19+bob, 3, 5)
    ctx.fillRect(bx+13, by+19+bob, 3, 5)
  }

  else if (type === 'orc') {
    // Body (big)
    ctx.fillStyle = '#40802a'
    ctx.fillRect(bx+4, by+10+bob, 16, 12)
    // Head
    ctx.fillStyle = '#50a038'
    ctx.fillRect(bx+5, by+3+bob, 14, 10)
    // Tusks
    ctx.fillStyle = '#f0e0b0'
    ctx.fillRect(bx+7, by+11+bob, 2, 3)
    ctx.fillRect(bx+15, by+11+bob, 2, 3)
    // Eyes (angry)
    ctx.fillStyle = '#cc2222'
    ctx.fillRect(bx+8, by+6+bob, 2, 1)
    ctx.fillRect(bx+14, by+6+bob, 2, 1)
    ctx.fillStyle = '#000'
    ctx.fillRect(bx+8, by+7+bob, 2, 2)
    ctx.fillRect(bx+14, by+7+bob, 2, 2)
    // Arms
    ctx.fillStyle = '#40802a'
    if (atk) {
      ctx.fillRect(bx+0, by+10+bob, 5, 3)
      ctx.fillRect(bx+19, by+9+bob, 5, 3)
    } else {
      ctx.fillRect(bx+0, by+10+bob, 4, 8)
      ctx.fillRect(bx+20, by+10+bob, 4, 8)
    }
    // Legs
    ctx.fillRect(bx+6, by+22+bob, 5, 2)
    ctx.fillRect(bx+13, by+22+bob, 5, 2)
    // Belt
    ctx.fillStyle = '#5a3010'
    ctx.fillRect(bx+4, by+18+bob, 16, 2)
  }

  else if (type === 'wolf') {
    // Body (horizontal)
    ctx.fillStyle = '#707888'
    ctx.fillRect(bx+2, by+10+bob, 18, 8)
    // Head (forward)
    ctx.fillStyle = '#808898'
    ctx.fillRect(bx+14, by+7+bob, 8, 8)
    // Ears
    ctx.fillStyle = '#707888'
    ctx.fillRect(bx+15, by+5+bob, 3, 3)
    ctx.fillRect(bx+20, by+5+bob, 3, 3)
    // Eyes
    ctx.fillStyle = '#ffaa00'
    ctx.fillRect(bx+16, by+9+bob, 2, 2)
    ctx.fillRect(bx+20, by+9+bob, 2, 2)
    // Nose
    ctx.fillStyle = '#222'
    ctx.fillRect(bx+22, by+12+bob, 2, 1)
    // Legs
    ctx.fillStyle = '#606878'
    if (atk) {
      ctx.fillRect(bx+2, by+16+bob, 4, 6)
      ctx.fillRect(bx+8, by+17+bob, 4, 5)
      ctx.fillRect(bx+14, by+14+bob, 4, 4)  // front leg raised
    } else {
      const legF = frame % 2
      ctx.fillRect(bx+3, by+17+bob+(legF?1:0), 3, 5-(legF?1:0))
      ctx.fillRect(bx+8, by+17+bob+(legF?0:1), 3, 5-(legF?0:1))
      ctx.fillRect(bx+13, by+17+bob+(legF?1:0), 3, 5-(legF?1:0))
      ctx.fillRect(bx+18, by+17+bob+(legF?0:1), 3, 5-(legF?0:1))
    }
    // Tail
    ctx.fillStyle = '#909aa8'
    ctx.fillRect(bx+0, by+8+bob, 3, 3)
    ctx.fillRect(bx+0, by+5+bob, 2, 4)
  }

  else if (type === 'dragon') {
    // Wings
    ctx.fillStyle = '#18501e'
    ctx.fillRect(bx+0, by+4+bob, 8, 6)
    ctx.fillRect(bx+16, by+4+bob, 8, 6)
    ctx.fillStyle = '#20682a'
    ctx.fillRect(bx+1, by+5+bob, 6, 4)
    ctx.fillRect(bx+17, by+5+bob, 6, 4)
    // Body
    ctx.fillStyle = '#1a6828'
    ctx.fillRect(bx+5, by+8+bob, 14, 12)
    // Belly
    ctx.fillStyle = '#40b050'
    ctx.fillRect(bx+7, by+10+bob, 10, 8)
    // Head
    ctx.fillStyle = '#1a6828'
    ctx.fillRect(bx+7, by+2+bob, 10, 8)
    // Snout
    ctx.fillRect(bx+9, by+7+bob, 7, 4)
    // Eyes
    ctx.fillStyle = '#ffff20'
    ctx.fillRect(bx+9, by+4+bob, 2, 2)
    ctx.fillRect(bx+14, by+4+bob, 2, 2)
    ctx.fillStyle = '#000'
    ctx.fillRect(bx+10, by+4+bob, 1, 2)
    ctx.fillRect(bx+15, by+4+bob, 1, 2)
    // Nostrils / fire breath
    if (atk) {
      ctx.fillStyle = '#ff4400'
      ctx.fillRect(bx+16, by+9+bob, 6, 2)
      ctx.fillStyle = '#ffaa00'
      ctx.fillRect(bx+17, by+8+bob, 5, 4)
    }
    // Legs
    ctx.fillStyle = '#1a6828'
    ctx.fillRect(bx+6, by+20+bob, 4, 4)
    ctx.fillRect(bx+14, by+20+bob, 4, 4)
  }
}

const enemyTypes = ['skeleton', 'orc', 'wolf', 'dragon']
for (let row = 0; row < 4; row++) {
  // Walk: cols 0-2
  for (let f = 0; f < 3; f++) {
    drawEnemySprite(eCtx, f, row, enemyTypes[row], f, 'walk')
  }
  // Attack: cols 3-5
  for (let f = 0; f < 3; f++) {
    drawEnemySprite(eCtx, 3+f, row, enemyTypes[row], f, 'attack')
  }
  // Death: cols 6-8 (fade out)
  for (let f = 0; f < 3; f++) {
    eCtx.globalAlpha = 1 - f * 0.35
    drawEnemySprite(eCtx, 6+f, row, enemyTypes[row], f, 'walk')
    eCtx.globalAlpha = 1
  }
}

fs.writeFileSync(path.join(OUT, 'enemies.png'), eneCanvas.toBuffer('image/png'))
console.log('enemies.png generated')

// ── UI SPRITESHEET ────────────────────────────────────────────────────────────
// Icons for HUD: 16×16 each, 1 row
const iconCanvas = createCanvas(16 * 8, 16)
const iCtx = iconCanvas.getContext('2d')

function drawIcon(ctx, ix, pixels) {
  const bx = ix * 16
  pixels.forEach((row, y) => {
    ;[...row].forEach((ch, x) => {
      const colors = {
        'R': '#dd2222', 'r': '#ff4444', 'B': '#2255cc', 'b': '#4488ff',
        'G': '#22aa22', 'g': '#44cc44', 'Y': '#ccaa00', 'y': '#ffdd44',
        'W': '#ffffff', 'P': '#cc44ff', 'O': '#ff8822', 'o': '#ffaa44',
        'N': '#888888', 'K': '#000000',
      }
      if (ch === '.' || ch === ' ') return
      ctx.fillStyle = colors[ch] || '#ffffff'
      ctx.fillRect(bx + x, y, 1, 1)
    })
  })
}

// Icon 0: Sword (attack)
drawIcon(iCtx, 0, [
  '..............WW',
  '.............WW.',
  '............WW..',
  '...........WW...',
  '..........WW....',
  '.........WW.....',
  '........WW......',
  '...NNNWWW.......',
  '..NNWWN.........',
  '.NWWNN..........',
  'WWN.............',
  'WN..............',
  'N...............',
  '................',
  '................',
  '................',
])

// Icon 1: Fire (skill 1)
drawIcon(iCtx, 1, [
  '........OO......',
  '.......OoO......',
  '......OooO.r....',
  '.....OoooOrr....',
  '....OoooOrRr....',
  '...OoooOrrRr....',
  '..RroooRrrRr....',
  '.RRrooRrrRRr....',
  'RRRRrRRrRRRR....',
  'RRRRRRRRRRRr....',
  '.RRRRRRRRRRr....',
  '..RRRRRRRRr.....',
  '....RRRRRr......',
  '......RRr.......',
  '................',
  '................',
])

// Icon 2: Magic (skill 2)
drawIcon(iCtx, 2, [
  '....PPPP........',
  '...PPbbPP.......',
  '..PPbbbbPP......',
  '.PPbbbbbbPP.....',
  'PPbbbbbbbbPP....',
  'PbbbbWWbbbbP....',
  'PbbbWWWWbbbP....',
  'PbbWWbbWWbbP....',
  'PbbbWWWWbbbP....',
  'PbbbbWWbbbbP....',
  'PPbbbbbbbbPP....',
  '.PPbbbbbbPP.....',
  '..PPbbbbPP......',
  '...PPPPPP.......',
  '................',
  '................',
])

// Icon 3: Shield (skill 3)
drawIcon(iCtx, 3, [
  '....NNNNNN......',
  '...NWwwwwNN.....',
  '..NWwYyywwN.....',
  '..NwwYYywwN.....',
  '..NwwYYYwwN.....',
  '..NwwwywwwN.....',
  '..NwwwwwwwN.....',
  '..NwwwwwwwN.....',
  '...NwwwwwN......',
  '....NwwwN.......',
  '.....NwN........',
  '......N.........',
  '................',
  '................',
  '................',
  '................',
])

// Icon 4: Heal (skill 4)
drawIcon(iCtx, 4, [
  '................',
  '....GggGGg......',
  '...GGggggGG.....',
  '..GGggGGggGG....',
  '.GGggGGGGggGG...',
  'GGggGGGGGGggGG..',
  'GGGGGGWWGGGGGg..',
  'GGGGGGWWGGGGGg..',
  'GGggGGGGGGggGG..',
  '.GGggGGGGggGG...',
  '..GGggGGggGG....',
  '...GGggggGG.....',
  '....GggGGg......',
  '................',
  '................',
  '................',
])

// Icon 5: Gold coin
drawIcon(iCtx, 5, [
  '......yyyy......',
  '....yyYYYYyy....',
  '...yYYYYYYYYy...',
  '..yYYYoYYYYYy...',
  '.yYYYoooYYYYYy..',
  '.yYYYoooYYYYYy..',
  '.yYYYYoYYYYYYy..',
  '.yYYYYYYYYYYYy..',
  '.yYYYYYYYYYYYy..',
  '.yYYYYYYYYYYYy..',
  '..yYYYYYYYYYy...',
  '...yYYYYYYYy....',
  '....yyYYYYyy....',
  '......yyyy......',
  '................',
  '................',
])

// Icon 6: XP star
drawIcon(iCtx, 6, [
  '......yy........',
  '.....yyyy.......',
  '....yyyyyy......',
  'YYYYyyyyyYYYY...',
  '.YYYyyyyy YYY...',
  '..YYyyyyYYY.....',
  '...YyyyYY.......',
  '....yyyyy.......',
  '...YYyyyYY......',
  '..YYYyyyYYY.....',
  '.YYYyyyyyyYYY...',
  'YYYyyyyyyYYYY...',
  '....yyyyyy......',
  '.....yyyy.......',
  '......yy........',
  '................',
])

// Icon 7: Level up arrow
drawIcon(iCtx, 7, [
  '......WW........',
  '.....WWWW.......',
  '....WWWWWW......',
  '...WWWWWWWW.....',
  '..WWWWWWWWWW....',
  '.....WWWW.......',
  '.....WWWW.......',
  '.....WWWW.......',
  '.....WWWW.......',
  '.....WWWW.......',
  '.....WWWW.......',
  '................',
  '................',
  '................',
  '................',
  '................',
])

fs.writeFileSync(path.join(OUT, 'icons.png'), iconCanvas.toBuffer('image/png'))
console.log('icons.png generated')

console.log('\nAll assets generated successfully!')
console.log('Output:', OUT)
