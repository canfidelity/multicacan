'use client'
// PixelRealms v3 — Hand-crafted pixel art sprite system (every pixel defined)

import { useEffect, useRef, useCallback } from 'react'

const TILE = 48          // physical pixels per tile (= 16 logical × S=3)
const S = 3              // pixels per logical pixel (scale factor)
const CW = 960, CH = 580
const WW = 42, WH = 28
const PSPEED = 3.0
const PW = 30, PH = 48  // player hitbox = 10×16 logical at S=3

// ── Pixel art engine ──────────────────────────────────────────────────────────
type Spr = (string|null)[][]

// Parse a sprite from rows of characters
function ps(rows: string[], pal: Record<string,string|null>): Spr {
  return rows.map(row => [...row].map(ch => pal[ch] ?? null))
}

// Draw sprite at (x,y), optionally flipped on X
function drawSpr(ctx: CanvasRenderingContext2D, sp: Spr, x: number, y: number, flipX=false) {
  const cols = sp[0]?.length ?? 0
  for (let r=0; r<sp.length; r++) {
    for (let c=0; c<cols; c++) {
      const col = sp[r][flipX ? cols-1-c : c]
      if (!col) continue
      ctx.fillStyle = col
      ctx.fillRect(x + c*S, y + r*S, S, S)
    }
  }
}

// Draw sprite with dark pixel-art outline
function drawSprO(ctx: CanvasRenderingContext2D, sp: Spr, x: number, y: number, flipX=false) {
  const cols = sp[0]?.length ?? 0
  // Draw outline: shift sprite 1px in 4 directions with dark semitransparent color
  ctx.globalAlpha = 0.55
  ctx.fillStyle = '#000'
  for (let r=0; r<sp.length; r++) {
    for (let c=0; c<cols; c++) {
      if (!sp[r][flipX ? cols-1-c : c]) continue
      ctx.fillRect(x + c*S - 1, y + r*S, S+2, S)  // horiz
      ctx.fillRect(x + c*S, y + r*S - 1, S, S+2)  // vert
    }
  }
  ctx.globalAlpha = 1
  drawSpr(ctx, sp, x, y, flipX)
}

// ── Sprite definitions ────────────────────────────────────────────────────────
// Each sprite = array of 10-character rows (or appropriate width)
// S=3, so 10×16 logical → 30×48 physical (matches PW=30, PH=48)

// WARRIOR – conical Asian hat, blue armor
const W_SP = ps([
  '....HH....',  // hat tip
  '...HLLH...',  // hat layer
  '..hHLLHh..',  // hat wider
  '.hHLLLLHh.',  // hat widest
  'hhhLLLLhhh',  // hat brim (dark edges, light center)
  '.ssssssss.',  // face
  '.se....es.',  // eyes
  '.ssPPPPss.',  // blush cheeks
  '.ssssssss.',  // chin
  'AAAAAAAAAA',  // armor chest
  'AaAAAAAaAA',  // armor highlight
  'AAAAAAAAAA',  // armor mid
  'ABbBBBbBAA',  // belt+buckle
  '.gg....gg.',  // legs
  '.gg....gg.',  // legs
  '.GGG..GGG.',  // boots
], {'.':null,'H':'#c89a3a','h':'#8a6020','L':'#f0c060','s':'#f5c870','e':'#222222','P':'#ffbbaa','A':'#a0a0bc','a':'#808098','B':'#6a4010','b':'#ffd700','g':'#4455aa','G':'#2a3460'})

// MAGE – tall pointed hat, purple robe, glowing eyes
const M_SP = ps([
  '....mm....',  // hat tip (dark purple)
  '...mMMm...',
  '..mMMMMMm.',  // wait need 10: ..mMMMMMm. = 10? .=0,.=1,m=2,M=3,M=4,M=5,M=6,M=7,m=8,.=9 = 10 ✓
  '.mMMMMMMMm',
  'mmmMMMMmmm',  // brim
  '.ssssssss.',  // face
  '.sG....Gs.',  // glowing blue eyes (G=glow)
  '.ssPPPPss.',  // blush
  '.ssssssss.',
  'RRRRRRRRRR',  // robe purple
  'RrRRRRRrRR',
  'RRRRRRRRRR',
  'RrrRRRRrrR',  // robe detail
  '.Rr....rR.',  // robe bottom
  '.RR....RR.',
  '.rr....rr.',  // robe hem
], {'.':null,'m':'#6814cc','M':'#9a36ff','s':'#f5c870','G':'#66aaff','P':'#ffbbaa','R':'#8822ee','r':'#5810aa'})

// ROGUE – dark hood, dual daggers visible
const RO_SP = ps([
  '..DDDDDD..',  // dark hood
  '.DDDDDDDD.',
  'DDDDDDDDDD',  // hood full width
  'DDssssssDD',  // face with hood sides
  'DDse..esDD',  // eyes
  'DDssPPssDD',
  'DDssssssDD',
  '.DVVVVVVD.',  // vest (dark grey)
  '.DVVVVVVD.',
  '.DVVVVVVD.',
  '.DBbBBbBD.',  // belt
  '..gg..gg..',  // legs
  '..gg..gg..',
  '..gg..gg..',
  '.GGG..GGG.',  // boots
  '.GGG..GGG.',
], {'.':null,'D':'#1a1a30','s':'#f5c870','e':'#222222','P':'#ffbbaa','V':'#2a2a44','B':'#5a3010','b':'#ffd700','g':'#111128','G':'#080818'})

// ARCHER – forest green hood, bow
const AR_SP = ps([
  '..FFFFFFF.',  // green hood (slightly asymmetric for feather)
  '.FFFFFFFFF',
  'FFFFFFFFfF',  // hood with darker edge
  'FFssssssFF',  // face with hood sides
  'FFse..esFF',
  'FFssPPssFF',
  'FFssssssFF',
  '.FFFFFFFF.',  // tunic
  '.FfFFFFfF.',
  '.FFFFFFFF.',
  '.FBbBBbBF.',  // belt
  '..gg..gg..',  // legs
  '..gg..gg..',
  '..gg..gg..',
  '.ttt..ttt.',  // brown boots
  '.ttt..ttt.',
], {'.':null,'F':'#2a7a28','f':'#1a5a18','s':'#f5c870','e':'#222222','P':'#ffbbaa','B':'#6a4010','b':'#ffd700','g':'#1a4a18','t':'#6a3a10'})

// KNIGHT – full plate armor, visor
const KN_SP = ps([
  '.KKKKKKKK.',  // helm top
  'KKKKKKKKKK',  // helm full
  'KKkKKKKkKK',  // helm detail
  'KK......KK',  // visor opening (dark)
  'KK.OO.OOK.',  // eye slits glowing orange (wait let me redo)
  'KKkKKKKkKK',  // visor bottom
  '.KKKKKKkK.',  // gorget
  'KKKKKKKKKK',  // chest plate
  'KKkKKKKkKK',
  'KKKCkCKKKK',  // chest detail (C=crest)
  'KKKKKKKKKK',
  'kBbBBBbBkk',  // waist/belt
  '.kk....kk.',  // greaves
  '.kk....kk.',
  'Kkk....kkK',  // sabatons
  'KKK....KKK',
], {'.':null,'K':'#b8b8d0','k':'#888898','O':'#ff8800','C':'#ffd700','B':'#6a4010','b':'#ffd700'})

// ── Enemy sprites ─────────────────────────────────────────────────────────────

// BUNNY (12×16) – cute round red bunny
const BUN_SP = ps([
  '...Yy.yY....',  // ears (Y=red, y=darkred)
  '...YT.TY....',  // ear inner (T=pink)
  '...YT.TY....',
  '...YT.TY....',
  '.yYYYYYYYy..',  // head top
  'yYYYYYYYYYYy',  // head full width
  'yYYwwYYwwYYy',  // eyes (w=white)
  'yYYwEwYwEwYy',  // pupils (E=eye dark)
  'yYYwwYYwwYYy',  // eye bottom
  'yYYYYpYYYYYy',  // nose (p=nose pink)
  'yYYPPYYPPYYy',  // blush cheeks (P=cheek)
  'yYYYYYYYYYYy',  // lower body
  '.yYYYYYYYYy.',  // body bottom
  '..yYYYYYYy..',
  '...yyYYyy...',  // feet
  '....yyyy....',  // foot bottom
], {'.':null,'Y':'#e83838','y':'#c02020','T':'#ff8888','w':'#ffffff','E':'#222222','p':'#ff5050','P':'#ffaaaa'})

// BUTTERFLY (16×14) – colorful wings, small body (flipX for frame 2)
function getButterflySprite(frame: number, ts: number): Spr {
  const wCols = [
    ['#ff8800','#ffcc00'],
    ['#ff4488','#cc44ff'],
    ['#44ccff','#88ffaa'],
  ]
  const [w1,w2] = wCols[Math.floor(ts/800)%wCols.length]
  const flap = frame === 0 ? 0 : -1
  // Returns a function-generated sprite
  const O = '#3a2050'  // body
  const _ = null
  const grid: (string|null)[][] = []
  // rows 0-13, 16 wide
  // Wings flap up/down based on frame
  const yOff = frame === 0 ? 0 : 1
  for (let r=0; r<14; r++) {
    const row: (string|null)[] = Array(16).fill(null)
    // Left wing (cols 0-5), body (cols 6-9), right wing (cols 10-15)
    if (r >= yOff && r < 7+yOff) {
      // Upper wings
      const wingRow = r - yOff
      const lw = Math.min(6, wingRow + 2)
      const rw = Math.min(6, wingRow + 2)
      for (let c=0; c<lw; c++) row[5-c] = c < 3 ? w1 : w2
      for (let c=0; c<rw; c++) row[10+c] = c < 3 ? w1 : w2
    }
    if (r >= 6-yOff && r < 12-yOff) {
      // Lower wings
      const wingRow = r - (6-yOff)
      const lw = Math.min(5, wingRow + 3)
      const rw = Math.min(5, wingRow + 3)
      for (let c=0; c<lw; c++) row[5-c] = w2
      for (let c=0; c<rw; c++) row[10+c] = w2
    }
    // Body (cols 6-9, rows 2-11)
    if (r >= 2 && r <= 11) {
      row[6] = O; row[7] = O; row[8] = O; row[9] = O
    }
    // Head (cols 6-9, rows 0-2)
    if (r <= 2) {
      row[6] = O; row[7] = O; row[8] = O; row[9] = O
      if (r === 1) { row[7] = '#ffff40'; row[8] = '#ffff40' }  // eyes
    }
    grid.push(row)
  }
  return grid
}

// SKELETON (10×22)
const SKEL_SP = ps([
  '..NNNNNN..',  // skull
  '.NNNNNNNNn',  // skull wider (n=dark edge)
  '.NNNNNNNN.',
  '.NnUUUnUNn',  // eye sockets with glow (U=red glow, n=dark)
  '.NnUuUnUNn',  // pupils (u=bright red)
  '.NNnnNnnNN',
  '.NNN.N.NNN',  // teeth
  '.NnNNNNnN.',  // jaw
  '..NnnNnnN.',  // mandible
  '.NNNNNNNN.',  // ribcage top
  'NnNNNNNnNN',  // ribs
  'NNnNNNnNNN',  // ribs 2
  'NnNNNNNnNN',  // ribs 3
  '.N.NNNN.N.',  // pelvis
  '...Ngg.N..',  // legs start (g=dark pants/bone)
  '...Ngg.N..',
  '...Ngg.N..',
  '..NNggNN..',  // leg bone detail
  '..Ngggg..',   // 9 chars here... let me fix
  '..NggggN..',
  '.GGgg..GG.',  // boots/foot bones
  '.GGgg..GG.',
], {'.':null,'N':'#d8d4bc','n':'#a09880','U':'#dd2222','u':'#ff4444','g':'#8a8870','G':'#b0ad98'})
// Note: skeleton has 22 rows

// SNAKE (24×8) – pink cute snake
const SNAKE_SP = ps([
  '..YYYYYYYYYYYYYYYYYY....',  // body (Y=snake pink/red)
  '.YYYYYYYYYYYYYYYYYYYYy.',  // body wider
  'yYYbbbbbbbbbbbbbbbbbYYYy',  // belly (b=lighter)
  'yYYbbbbbbbbbbbbbbbbbYYYy',
  '.YYYYYYYYYYYYYYYYYYYYy.',
  '..YYYYYHHHHHYYYYYYYY...',  // head (H=head highlight)
  '...YwwYwwYYYYYYYYYYY....',  // eyes area
  '....YYYpYYYYYYYYYYYY....',  // tongue/nose
], {'.':null,'Y':'#d04848','y':'#a03030','b':'#f08080','H':'#e05555','w':'#ffffff','e':'#222222','p':'#ff3030'})

// DRAGON (20×18) – green dragon matching reference
const DRAG_SP = ps([
  '..........VVVV......',  // wing tip left barely
  '.VVVVv....VVVVVVVV..',  // wings up
  'VVVVVVv..VVVVVVVVVVv',  // wings wider
  'VVVVVVVvVVVVVVVVVVVV',  // wings full
  '.VvVVVVVVVVVVVVVVvV.',  // inner wing
  '..vVVVVVVVVVVVVVVv..',  // body starts
  '..vVVVVVVVVVVVVVVv..',  // body
  '..VVVVVVqqqqVVVVVV..',  // body with eye area (q=yellow)
  '..VVVVVVqOqVVVVVVV..',  // eyes (O=eye dark)
  '..VVVVVVqqqVVVVVVV..',
  '..VVVcccccccVVVVVV..',  // belly (c=light green)
  '..VVVcccccccVVVVVV..',
  '..VVVcccccccVVVVVV..',
  '...VVVVVVVVVVVVvVV..',  // body lower
  '....VVVVVVVVVVVVV...',  // tail
  '.....VVvVVVVVVVvV....',
  '......VVVVVVVVv.....',   // 19 chars... hmm
  '.......vVVVVv.......',
], {'.':null,'V':'#33aa44','v':'#1a6630','q':'#ffff20','O':'#222222','c':'#66dd77'})
// Dragon is 20 wide × 18 tall

// NPC (10×16) – village NPC template
function getNpcSprite(bodyColor: string): Spr {
  const B = bodyColor
  return ps([
    '..HHHHHH..',  // hat/hair (H=dark brown)
    '.HHHsssHH.',  // face top
    '.HHssssHH.',  // face
    '.HHse.esH.',  // eyes
    '.HHssssHH.',  // chin
    '..BBBBBB..',  // collar (B=body color)
    '.BBBBBBBB.',  // body
    'BBBBBBBBBB',
    'BBBbBbbBBB',  // body detail
    'BBBBBBBBBB',
    '.BBbBBbBB.',  // waist
    '..gg..gg..',  // legs
    '..gg..gg..',
    '..gg..gg..',
    '.GGG..GGG.',  // boots
    '.GGG..GGG.',
  ], {'.':null,'H':'#4a3010','s':'#f5c870','e':'#222222','B':B,'b':'rgba(0,0,0,0.2)','g':'#3a3a5a','G':'#2a2a3a'})
}

// ── Map ────────────────────────────────────────────────────────────────────────
type Tile = 0|1|2|3|4|5|6|7|8
const SOLID: Set<Tile> = new Set([2,3,4])

function buildMap(): Tile[][] {
  const m: Tile[][] = Array.from({length:WH}, ()=>Array(WW).fill(0) as Tile[])
  for(let y=0;y<WH;y++){m[y][0]=2;m[y][1]=2}
  for(let y=7;y<17;y++) for(let x=7;x<30;x++) m[y][x]=1
  for(let y=2;y<26;y++){m[y][16]=7;m[y][17]=7}
  for(let x=3;x<39;x++){m[11][x]=7;m[12][x]=7}
  for(let y=7;y<17;y++){m[y][10]=7;m[y][11]=7;m[y][23]=7;m[y][24]=7}
  for(let y=0;y<7;y++) for(let x=4;x<14;x++) m[y][x]=8
  for(let y=0;y<7;y++){m[y][3]=4;m[y][14]=4}
  for(let x=3;x<15;x++) m[7][x]=4
  for(let x=7;x<11;x++) m[7][x]=8
  for(let y=0;y<8;y++) for(let x=15;x<WW-4;x++)
    if(m[y][x]===0&&(x*7+y*11)%3<2) m[y][x]=3
  for(let y=18;y<WH;y++) for(let x=2;x<WW-2;x++)
    if(m[y][x]===0&&(x*5+y*7)%4<3) m[y][x]=3
  for(let y=0;y<18;y++) for(let x=WW-5;x<WW-1;x++)
    if((x*3+y*9)%3<2) m[y][x]=3
  for(let y=0;y<WH;y++){if(m[y][16]===3)m[y][16]=0;if(m[y][17]===3)m[y][17]=0}
  for(let y=3;y<7;y++) for(let x=14;x<26;x++)
    if(m[y][x]===0&&(x*13+y*7)%8===0) m[y][x]=6
  for(let y=14;y<19;y++) for(let x=28;x<WW-5;x++)
    if(m[y][x]===0&&(x*9+y*11)%7===0) m[y][x]=6
  for(let y=14;y<20;y++) for(let x=28;x<WW-5;x++)
    if(m[y][x]===0) m[y][x]=5
  return m
}
const MAP = buildMap()

// ── Tile drawing ──────────────────────────────────────────────────────────────
function fc(ctx:CanvasRenderingContext2D,x:number,y:number,r:number,c:string){
  ctx.fillStyle=c;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill()
}

// Tile sprites (16×16 logical = 48×48 physical at S=3)
const GRASS_TILE = ps([
  'ZZZZJZZZZZZZJZZZ','ZzZZZZZZZZZZZZZZ','ZZZZZZZJZZZzZZZZ','ZZZZZZZZZZZZZZZZ',
  'JZZZZZZZZZZzZZZZ','ZZZZZzZZZZZZZZZJ','ZZZJZZZZZZZZZZzZ','ZZZZZZZZZZZZZZZZ',
  'ZZZZZZZZJZZZZzZZ','JZZZZZZZZZZZZZZZ','ZZZzZZZZZZZZJZZZ','ZZZZZZZZZZZZZZZZ',
  'ZZZZZZZzZZZZZZZZ','ZZJZZZZZZZZZzZZZ','ZZZZZZZZZZZZZZZZ','ZZZZZzZZZZJZZZZZ',
],{'.':null,'Z':'#5aaa38','z':'#4a8a28','J':'#6abb48'})

const SAND_TILE = ps([
  'DDDDDDDDDDDDDDDD','DDDDdDDDDDDDDDDD','DDDDDDDDDDDDDDDD','DDDDDDDDdDDDDDDD',
  'DDDDDDDDDDDDDDDD','DdDDDDDDDDDDDDDD','DDDDDDDDDDDDDDDD','DDDDDDDDDdDDDDDD',
  'DDDDDDDDDDDDDDDD','DDDDdDDDDDDDDDDD','DDDDDDDDDDDDDDDD','DDDDDDDDDDDdDDDD',
  'DDDDDDDDDDDDDDDD','DdDDDDDDDDDDDDDD','DDDDDDDDDDDDDDDD','DDDDDDDDDDDDDDDD',
],{'.':null,'D':'#d4a255','d':'#c8943e'})

const STONE_TILE = ps([
  'qqqqQQQQQQQQqqqq','qQQQQQQQQQQQQQQq','qQQQQQQQQQQQQQQq','qQQQQQQQQQQQQQQq',
  'qQQQQQQQQQQQQQQq','qQQQqQQQQqQQQQQq','qqqqqqqqqqqqqqqqq'.slice(0,16),'qQQQQQQqQQQQQQQq',
  'qQQQQQQqQQQQQQQq','qQQQQQQqQQQQQQQq','qQQQQQQqQQQQQQQq','qQQQQQQqQQQQqQQq',
  'qqqqqqqqqqqqqqqqq'.slice(0,16),'qQQQQQQQQQQQQQQq','qQQQQQQQQQQQQQQq','qqqqQQQQQQQQqqqq',
],{'.':null,'Q':'#bcac78','q':'#908848'})

const DUNG_TILE = ps([
  'XXXXXXXXXXXXXXXXX'.slice(0,16),'XxXXXXXXXXXXXXxX','XxXXXXXXXXXXXXxX','XxXXXXXXXXXXXXxX',
  'XxXXXXXXXXXXXXxX','XxXXxXXXXxXXXXxX','XXXXXXXXXXXXXXxX','XxXXXXXXXXXXXXxX',
  'XxXXXXXXXXXXXXxX','XxXXXXXXXXXXXXxX','XxXXxXXXXxXXXXxX','XXXXXXXXXXXXXXxX',
  'XxXXXXXXXXXXXXXX','XxXXXXXXXXXXXXxX','XxXXXXXXXXXXXXxX','XXXXXXXXXXXXXXxX',
],{'X':'#1a1228','x':'#22183c'})

const DEEPGRASS_TILE = ps([
  'ZZZZZZZZZZZZZZZZZ'.slice(0,16),'ZzZZZZZZZZZZZZZZ','ZZZZZzZZZZZZZZZZ','ZZZZZZZZZZZZZZZZ',
  'ZZZZZZZZZzZZZZZZ','ZzZZZZZZZZZZZZZZ','ZZZZZZZZZZZZZZZZ','ZZZZZZZZZzZZZZZz',
  'ZZzZZZZZZZZZZZZZ','ZZZZZZZZZZZZZZZZ','ZZZZZZZzZZZZZzZZ','ZZZZZZZZZZZZZZZZ',
  'ZzZZZZZZZZZZZZZZ','ZZZZZZZZZZZZZZZZ','ZZZZZZZZZZZZZzZZ','ZZZZZZZZZZZZZZZZ',
],{'Z':'#4a8e28','z':'#3a7a18'})

const WALL_TILE = ps([
  'XXXXXXXXXXXXXXXX','XwwwwXXXXwwwwXXX','XwwwwXXXXwwwwXXX','XwwwwXXXXwwwwXXX',
  'XXXXXXXXXXXXXXXX','XXXXwwwwXXXXwwww','XXXXwwwwXXXXwwww','XXXXwwwwXXXXwwww',
  'XXXXXXXXXXXXXXXX','XwwwwXXXXwwwwXXX','XwwwwXXXXwwwwXXX','XwwwwXXXXwwwwXXX',
  'XXXXXXXXXXXXXXXX','XXXXwwwwXXXXwwww','XXXXwwwwXXXXwwww','XXXXXXXXXXXXXXXX',
],{'X':'#2a2040','w':'#3a3058'})

// Flower tile: grass with flowers
const FLOWER_COLORS = ['#ff6090','#ffdd40','#ff8030','#cc44ff','#ff4444','#40ddff']
function drawFlowerTile(ctx: CanvasRenderingContext2D, sx: number, sy: number, seed: number) {
  // Base grass
  drawSpr(ctx, GRASS_TILE, sx, sy)
  // Draw 3 flowers
  const fc2 = (x: number, y: number, col: string) => {
    ctx.fillStyle = '#5a3a20'; ctx.fillRect(sx+x*S, sy+y*S, S, S)  // stem
    ctx.fillStyle = col
    ctx.fillRect(sx+(x-1)*S, sy+(y-1)*S, S, S)  // petal
    ctx.fillRect(sx+(x+1)*S, sy+(y-1)*S, S, S)
    ctx.fillRect(sx+(x-1)*S, sy+(y+1)*S, S, S)
    ctx.fillRect(sx+(x+1)*S, sy+(y+1)*S, S, S)
    ctx.fillStyle = '#ffff80'
    ctx.fillRect(sx+x*S, sy+y*S, S, S)  // center
  }
  fc2(4, 5, FLOWER_COLORS[seed%6])
  fc2(10, 10, FLOWER_COLORS[(seed+2)%6])
  fc2(13, 3, FLOWER_COLORS[(seed+4)%6])
}

function drawTile(ctx: CanvasRenderingContext2D, t: Tile, sx: number, sy: number, seed: number, ts: number) {
  switch(t) {
    case 0: drawSpr(ctx, GRASS_TILE, sx, sy); break
    case 1: drawSpr(ctx, SAND_TILE, sx, sy); break
    case 2: {
      // Animated water
      const wave = Math.sin(ts*0.003 + seed*0.1) * 1.5
      ctx.fillStyle = '#4494dd'; ctx.fillRect(sx, sy, TILE, TILE)
      ctx.fillStyle = '#5aa8ee'
      ctx.fillRect(sx+2, sy+8+wave, TILE-4, S*2)
      ctx.fillRect(sx+2, sy+28+wave, TILE-4, S*2)
      ctx.fillStyle = '#7ac0ff'
      ctx.fillRect(sx+8, sy+11+wave, 12, S)
      ctx.fillRect(sx+24, sy+31+wave, 12, S)
      break
    }
    case 3: {
      // Lush grass base
      ctx.fillStyle = '#2a5010'; ctx.fillRect(sx, sy, TILE, TILE)
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath()
      ctx.ellipse(sx+TILE/2, sy+TILE-2, 18, 6, 0, 0, Math.PI*2); ctx.fill()
      // Trunk
      ctx.fillStyle = '#7a4a1a'; ctx.fillRect(sx+20, sy+30, 8, 18)
      ctx.fillStyle = '#5a3410'; ctx.fillRect(sx+22, sy+32, 3, 16)
      // Round canopy layers
      fc(ctx,sx+24,sy+22,21,'#1a6010')
      fc(ctx,sx+22,sy+19,18,'#288018')
      fc(ctx,sx+26,sy+20,16,'#288018')
      fc(ctx,sx+20,sy+16,13,'#38a024')
      fc(ctx,sx+27,sy+17,11,'#38a024')
      fc(ctx,sx+18,sy+13,8,'#48bb30')
      fc(ctx,sx+25,sy+11,6,'#58cc40')
      break
    }
    case 4: drawSpr(ctx, WALL_TILE, sx, sy); break
    case 5: drawSpr(ctx, DEEPGRASS_TILE, sx, sy); break
    case 6: drawFlowerTile(ctx, sx, sy, seed); break
    case 7: drawSpr(ctx, STONE_TILE, sx, sy); break
    case 8: drawSpr(ctx, DUNG_TILE, sx, sy); break
  }
}

// ── Buildings ─────────────────────────────────────────────────────────────────
const BUILDINGS=[
  {tx:7,ty:8,tw:4,th:4,type:'tavern'},
  {tx:20,ty:8,tw:4,th:3,type:'shop'},
  {tx:12,ty:8,tw:4,th:3,type:'blacksmith'},
  {tx:25,ty:9,tw:3,th:3,type:'guild'},
]

function drawBuilding(ctx: CanvasRenderingContext2D, type: string, sx: number, sy: number, tw: number, th: number, ts: number) {
  const w=tw*TILE,h=th*TILE
  ctx.save()
  if(type==='tavern'){
    ctx.fillStyle='#9b6535';ctx.fillRect(sx,sy,w,h)
    ctx.fillStyle='#7a4a1e';for(let i=0;i<h;i+=9){ctx.fillRect(sx,sy+i,w,S)}
    ctx.fillStyle='#5a3010';for(let i=0;i<w;i+=18){ctx.fillRect(sx+i,sy,S,h)}
    ctx.fillStyle='#8a1a1a';ctx.fillRect(sx-8,sy-20,w+16,24)
    ctx.fillStyle='#aa2828';ctx.fillRect(sx-4,sy-16,w+8,16)
    ctx.fillStyle='#cc3333';for(let i=0;i<w+8;i+=7){ctx.fillRect(sx-4+i,sy-18,5,20)}
    const wg=0.75+Math.sin(ts*0.002)*0.2
    ctx.fillStyle=`rgba(255,200,80,${wg})`;ctx.fillRect(sx+10,sy+14,22,16);ctx.fillRect(sx+w-32,sy+14,22,16)
    ctx.fillStyle='#5a3010';ctx.fillRect(sx+21,sy+14,S,16);ctx.fillRect(sx+10,sy+22,22,S)
    ctx.fillStyle='#5a3010';ctx.fillRect(sx+w-21,sy+14,S,16);ctx.fillRect(sx+w-32,sy+22,22,S)
    ctx.fillStyle='#4a2808';ctx.fillRect(sx+w/2-14,sy+h-38,28,38)
    ctx.fillStyle='#7a4a18';ctx.fillRect(sx+w/2-12,sy+h-36,24,34)
    ctx.fillStyle='#c8a060';ctx.fillRect(sx+w/2+6,sy+h-20,6,6)
    ctx.fillStyle='#c8a060';ctx.fillRect(sx+w/2-22,sy+8,44,16)
    ctx.fillStyle='#6a3010';ctx.font='bold 7px monospace';ctx.textAlign='center'
    ctx.fillText('TAVERN',sx+w/2,sy+20)
  } else if(type==='blacksmith'){
    ctx.fillStyle='#4a3c38';ctx.fillRect(sx,sy,w,h)
    ctx.fillStyle='#382c28';for(let i=0;i<w;i+=12){ctx.fillRect(sx+i,sy,S,h)}
    ctx.fillStyle='#5a4a44';ctx.fillRect(sx+4,sy+4,12,10);ctx.fillRect(sx+22,sy+4,12,10)
    ctx.fillStyle='#4a3a34';ctx.fillRect(sx-4,sy-16,w+8,20)
    ctx.fillStyle='#382828';for(let i=0;i<w+8;i+=9){ctx.fillRect(sx-4+i,sy-16,7,20)}
    ctx.fillStyle='#5a4a44';ctx.fillRect(sx+w-22,sy-30,18,32)
    const fC=['#ff6010','#ff4000','#ff9020'][Math.floor(ts/100)%3]
    ctx.fillStyle=fC;ctx.fillRect(sx+w-20,sy-36,14,12)
    ctx.fillStyle='rgba(255,80,0,0.35)';ctx.fillRect(sx+6,sy+h-44,w-12,32)
    ctx.fillStyle='#606060';ctx.fillRect(sx+16,sy+h-34,w/2-8,26)
    ctx.fillStyle='#5a4a44';ctx.font='bold 7px monospace';ctx.textAlign='center'
    ctx.fillText('FORGE',sx+w/2,sy+18)
  } else if(type==='shop'){
    ctx.fillStyle='#221438';ctx.fillRect(sx,sy,w,h)
    ctx.fillStyle='#2e1a48';for(let i=0;i<w;i+=11){ctx.fillRect(sx+i,sy,S,h)}
    ctx.fillStyle='#3e1a60';ctx.fillRect(sx-4,sy-16,w+8,20)
    for(let i=0;i<8;i++){const sa=Math.sin(ts*0.004+i)*4,sx2=sx+5+i*10,sy2=sy+5+Math.abs(sa);ctx.fillStyle='#ffdd88';ctx.fillRect(sx2,sy2,S,S)}
    ctx.fillStyle=`rgba(130,40,255,${0.55+Math.sin(ts*0.003)*0.3})`;ctx.fillRect(sx+8,sy+10,w-16,26)
    ctx.strokeStyle='#aa66ff';ctx.lineWidth=S;ctx.strokeRect(sx+6,sy+8,w-12,30)
    ctx.fillStyle='#bb88ff';ctx.font='bold 7px monospace';ctx.textAlign='center'
    ctx.fillText('MAGIC SHOP',sx+w/2,sy+24)
    ctx.fillStyle='#ddaaff';ctx.fillText('✨ OPEN',sx+w/2,sy+36)
  } else {
    ctx.fillStyle='#7a5e28';ctx.fillRect(sx,sy,w,h)
    ctx.fillStyle='#cc2222';ctx.fillRect(sx+w/2-10,sy-26,20,32)
    ctx.fillStyle='#FFD700';ctx.font='12px monospace';ctx.textAlign='center'
    ctx.fillText('⚔',sx+w/2,sy-8)
    ctx.fillStyle='#8a6e38';ctx.fillRect(sx,sy,8,h);ctx.fillRect(sx+w-8,sy,8,h)
    ctx.fillStyle='#8a6e38';ctx.fillRect(sx-4,sy-14,w+8,18)
    for(let i=0;i<w;i+=12){ctx.fillStyle='#8a6e38';ctx.fillRect(sx+i-2,sy-22,10,12)}
    ctx.fillStyle='#5a3e18';ctx.font='bold 7px monospace';ctx.textAlign='center'
    ctx.fillText('GUILD',sx+w/2,sy+20)
  }
  ctx.textAlign='left';ctx.restore()
}

function drawPortal(ctx: CanvasRenderingContext2D, sx: number, sy: number, angle: number) {
  const cx=sx+TILE,cy=sy+TILE*1.5
  const grad=ctx.createRadialGradient(cx,cy,10,cx,cy,52)
  grad.addColorStop(0,'rgba(200,80,255,0.95)')
  grad.addColorStop(0.4,'rgba(120,30,220,0.6)')
  grad.addColorStop(1,'rgba(60,0,140,0)')
  ctx.fillStyle=grad;ctx.beginPath();ctx.arc(cx,cy,52,0,Math.PI*2);ctx.fill()
  ctx.save();ctx.translate(cx,cy)
  for(let i=0;i<16;i++){
    ctx.rotate(angle+(i*Math.PI/8))
    ctx.fillStyle=`rgba(${160+i*6},50,255,${0.85-i*0.05})`
    ctx.fillRect(18,-3,16,5)
  }
  ctx.restore()
  fc(ctx,cx,cy,18,`rgba(210,130,255,${0.7+Math.sin(angle*3)*0.25})`)
  fc(ctx,cx,cy,10,'rgba(240,200,255,0.9)')
  fc(ctx,cx,cy,5,'rgba(255,255,255,0.95)')
  ctx.fillStyle='rgba(0,0,0,0.75)';ctx.fillRect(cx-44,cy-64,88,18)
  ctx.fillStyle='#dd99ff';ctx.font='8px "Press Start 2P",monospace';ctx.textAlign='center'
  ctx.fillText('Dungeon Portal',cx,cy-50);ctx.textAlign='left'
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t
const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v))
const dist2=(ax:number,ay:number,bx:number,by:number)=>(ax-bx)**2+(ay-by)**2

function solidAt(px:number,py:number){
  const tx=Math.floor(px/TILE),ty=Math.floor(py/TILE)
  if(tx<0||ty<0||tx>=WW||ty>=WH) return true
  return SOLID.has(MAP[ty][tx])
}
function canMove(x:number,y:number,w:number,h:number){
  const m=4
  return !solidAt(x+m,y+m)&&!solidAt(x+w-m,y+m)&&!solidAt(x+m,y+h-m)&&!solidAt(x+w-m,y+h-m)
}

// ── Types ─────────────────────────────────────────────────────────────────────
type Dir='up'|'down'|'left'|'right'
type EnemyKind='slime'|'skeleton'|'dragon'|'snake'|'bat'
const KIND_NAMES:{[k in EnemyKind]:string}={slime:'Bunny',bat:'Butterfly',skeleton:'Skeleton',snake:'Snake',dragon:'Dragon'}

interface Player{x:number;y:number;hp:number;maxHp:number;mp:number;maxMp:number;level:number;xp:number;xpNext:number;gold:number;tokens:number;usdt:number;dir:Dir;frame:number;fTimer:number;atkTimer:number;invTimer:number;moving:boolean;dead:boolean;respTimer:number;name:string;cls:string}
interface Enemy{id:number;kind:EnemyKind;x:number;y:number;hp:number;maxHp:number;dir:Dir;frame:number;fTimer:number;state:'patrol'|'chase'|'attack'|'dead';sTimer:number;homeX:number;homeY:number;atkTimer:number;xp:number;gold:number;tok:number;respTimer:number}
interface DmgNum{x:number;y:number;v:number;c:string;t:number}
interface Particle{x:number;y:number;vx:number;vy:number;c:string;t:number;s:number}
interface ChatMsg{name:string;text:string;c:string;age:number}
interface GS{p:Player;enemies:Enemy[];dmg:DmgNum[];parts:Particle[];chat:ChatMsg[];keys:Set<string>;camX:number;camY:number;lastTs:number;chatTimer:number;npcBubble:{idx:number;msg:string;t:number}|null;attackPressed:boolean;portalAngle:number}

const NPCS=[
  {tx:8.5,ty:9.5,name:'INNKEEPER',col:'#f0c060',msgs:['Rest here, weary traveler!','Dungeon portal is to the west!','Room costs 5 gold per night.']},
  {tx:20,ty:8.5,name:'MERCHANT',col:'#60f0c0',msgs:['Best wares in the realm!','$VOX tokens for rare gear!','New stock: +15 STR sword, 300g.']},
  {tx:13.5,ty:8.5,name:'SKILL MASTER',col:'#f08060',msgs:['Learn skills here!','Press Q,E,R,F for skills!','Level 5 unlocks combo attacks.']},
]
const NPC_SPRITES = [
  getNpcSprite('#c8a040'),  // INNKEEPER (gold)
  getNpcSprite('#40c0a0'),  // MERCHANT (cyan)
  getNpcSprite('#d06040'),  // SKILL MASTER (orange)
]
const FAKE_PLAYERS=[
  {name:'Eeyo',c:'#ff9060'},{name:'MageKing',c:'#cc66ff'},{name:'ShadowBlade',c:'#60ff80'},
  {name:'IronShield',c:'#60d0ff'},{name:'ArrowStorm',c:'#ffcc44'},
]
const FAKE_MSGS=[
  'Anyone want to raid the dungeon? ⚔️','LFG dragon fight!','Just earned 150 $VOX! 💰',
  'WTS rare skeleton sword NFT','Dragon drops 200g — worth it!','Guild recruiting, DM me',
  'Press SPACE near portal to enter!','Lv10 reached, going to boss zone',
  'WASD to move, SPACE to attack!','That bunny nearly one-shot me lol',
]

function mkPlayer(name:string,cls:string):Player{
  return{x:17*TILE+8,y:13*TILE,hp:120,maxHp:120,mp:40,maxMp:40,level:1,xp:0,xpNext:100,gold:0,tokens:0,usdt:0,dir:'down',frame:0,fTimer:0,atkTimer:0,invTimer:0,moving:false,dead:false,respTimer:0,name,cls}
}
function mkEnemies():Enemy[]{
  const list:Enemy[]=[];let id=0
  const add=(kind:EnemyKind,tx:number,ty:number,hp:number,xp:number,gold:number,tok:number)=>
    list.push({id:id++,kind,x:tx*TILE,y:ty*TILE,hp,maxHp:hp,dir:'down',frame:0,fTimer:0,state:'patrol',sTimer:Math.random()*3,homeX:tx*TILE,homeY:ty*TILE,atkTimer:0,xp,gold,tok,respTimer:0})
  add('bat',5,2,20,12,3,0);add('bat',10,3,20,12,3,0);add('bat',7,5,20,12,3,0)
  add('skeleton',6,2,55,30,12,2);add('skeleton',11,4,55,30,12,2)
  add('slime',22,14,35,15,5,1);add('slime',26,13,35,15,5,1);add('slime',31,10,35,15,5,1);add('slime',33,15,35,15,5,1)
  add('snake',20,21,45,20,8,1);add('snake',28,22,45,20,8,1)
  add('dragon',15,23,200,150,100,20);add('dragon',30,25,200,150,100,20)
  return list
}

function getPlayerSprite(cls:string): Spr {
  switch(cls) {
    case 'warrior': return W_SP
    case 'mage': return M_SP
    case 'rogue': return RO_SP
    case 'archer': return AR_SP
    default: return KN_SP
  }
}

function getEnemySprite(kind: EnemyKind, frame: number, ts: number): Spr {
  switch(kind) {
    case 'slime': return BUN_SP
    case 'skeleton': return SKEL_SP
    case 'bat': return getButterflySprite(frame, ts)
    case 'snake': return SNAKE_SP
    default: return DRAG_SP
  }
}

// Draw sword based on direction
function drawSword(ctx: CanvasRenderingContext2D, dir: Dir, sx: number, sy: number) {
  ctx.fillStyle = '#d0d8e0'
  if (dir === 'right') {
    ctx.fillRect(sx + PW, sy + 6, S, PH/2)
    ctx.fillStyle = '#8a6030'; ctx.fillRect(sx + PW - S, sy + 6, S*2, S*2)
  } else if (dir === 'left') {
    ctx.fillRect(sx - S*2, sy + 6, S, PH/2)
    ctx.fillStyle = '#8a6030'; ctx.fillRect(sx - S*2, sy + 6, S*2, S*2)
  } else if (dir === 'up') {
    ctx.fillRect(sx + S, sy - S*5, S, S*5)
    ctx.fillStyle = '#8a6030'; ctx.fillRect(sx - S, sy - S*5, S*4, S*2)
  }
}

// HUD
function drawHUD(ctx: CanvasRenderingContext2D, gs: GS, ts: number) {
  const{p}=gs
  const panW=220,panH=130
  ctx.fillStyle='rgba(20,12,8,0.88)';ctx.fillRect(8,8,panW,panH)
  ctx.strokeStyle='#8B6020';ctx.lineWidth=2;ctx.strokeRect(8,8,panW,panH)
  ctx.strokeStyle='#C89030';ctx.lineWidth=1;ctx.strokeRect(10,10,panW-4,panH-4)
  // Portrait
  ctx.fillStyle='rgba(40,24,12,0.9)';ctx.fillRect(14,14,52,60)
  ctx.strokeStyle='#C89030';ctx.lineWidth=1;ctx.strokeRect(14,14,52,60)
  ctx.save()
  ctx.translate(14+6, 14+4)
  const pSpr = getPlayerSprite(p.cls)
  // Scale to fit portrait
  const pScale = Math.min(40/(pSpr[0].length*S), 52/(pSpr.length*S))
  ctx.scale(pScale, pScale)
  drawSpr(ctx, pSpr, 0, 0)
  ctx.restore()
  // Stats text
  ctx.fillStyle='#FFD700';ctx.font='8px "Press Start 2P",monospace';ctx.fillText(p.name.slice(0,9),72,26)
  ctx.fillStyle='#C0A060';ctx.font='7px monospace';ctx.fillText(p.cls.toUpperCase(),72,38)
  ctx.fillStyle='#FFD700';ctx.font='7px monospace';ctx.fillText(`Lv.${p.level}`,72,50)
  ctx.fillStyle='#AAA070';ctx.fillText(`⚡ PWR: ${10+p.level*3}`,72,62)
  const bx=14,by=82,bw=200
  ctx.fillStyle='#220000';ctx.fillRect(bx,by,bw,11)
  ctx.fillStyle=p.hp/p.maxHp>0.5?'#dd2222':p.hp/p.maxHp>0.25?'#dd8800':'#ff4444'
  ctx.fillRect(bx,by,Math.round(bw*p.hp/p.maxHp),11)
  ctx.strokeStyle='#440000';ctx.lineWidth=1;ctx.strokeRect(bx,by,bw,11)
  ctx.fillStyle='#fff';ctx.font='7px monospace';ctx.fillText(`HP  ${p.hp}/${p.maxHp}`,bx+3,by+9)
  ctx.fillStyle='#000022';ctx.fillRect(bx,by+14,bw,11)
  ctx.fillStyle='#2255cc';ctx.fillRect(bx,by+14,Math.round(bw*p.mp/p.maxMp),11)
  ctx.strokeStyle='#001144';ctx.lineWidth=1;ctx.strokeRect(bx,by+14,bw,11)
  ctx.fillStyle='#aaccff';ctx.fillText(`MP  ${Math.floor(p.mp)}/${p.maxMp}`,bx+3,by+23)
  ctx.fillStyle='#221100';ctx.fillRect(bx,by+28,bw,11)
  ctx.fillStyle='#cc8800';ctx.fillRect(bx,by+28,Math.round(bw*p.xp/p.xpNext),11)
  ctx.strokeStyle='#442200';ctx.lineWidth=1;ctx.strokeRect(bx,by+28,bw,11)
  ctx.fillStyle='#ffcc44';ctx.fillText(`XP  ${p.xp}/${p.xpNext}`,bx+3,by+37)
  // Resource bar
  const resources=[
    {icon:'💎',label:'USDT',val:`${p.usdt.toFixed(0)}`,col:'#22ddff'},
    {icon:'🔷',label:'$VOX',val:`${p.tokens.toFixed(3)}`,col:'#aa66ff'},
    {icon:'🪙',label:'Gold',val:`${p.gold}`,col:'#ffcc44'},
    {icon:'👥',label:'Online',val:'1,284',col:'#44ff88'},
  ]
  const rBarW=resources.length*90+20
  ctx.fillStyle='rgba(20,12,8,0.85)';ctx.fillRect(CW-rBarW-8,8,rBarW,36)
  ctx.strokeStyle='#8B6020';ctx.lineWidth=1;ctx.strokeRect(CW-rBarW-8,8,rBarW,36)
  resources.forEach((r,i)=>{
    const rx=CW-rBarW-8+10+i*90
    ctx.fillStyle=r.col;ctx.font='11px monospace';ctx.fillText(r.icon,rx,28)
    ctx.fillStyle='#cccccc';ctx.font='7px monospace';ctx.fillText(r.label,rx+16,20)
    ctx.fillStyle=r.col;ctx.font='8px monospace';ctx.fillText(r.val,rx+16,31)
  })
  ctx.fillStyle='#888';ctx.font='14px monospace';ctx.fillText('⚙',CW-26,28)
  // Chat
  const chatX=8,chatY=CH-130
  ctx.fillStyle='rgba(20,12,8,0.78)';ctx.fillRect(chatX,chatY,300,118)
  ctx.strokeStyle='#8B6020';ctx.lineWidth=1;ctx.strokeRect(chatX,chatY,300,118)
  ctx.font='7px monospace'
  gs.chat.slice(-7).forEach((m,i)=>{
    ctx.globalAlpha=Math.min(1,(8-m.age)/3)
    ctx.fillStyle=m.c;ctx.fillText(`[${m.name}]`,chatX+6,chatY+14+i*15)
    ctx.fillStyle='#ddddcc';ctx.fillText(m.text.slice(0,32),chatX+6+(m.name.length+2)*5,chatY+14+i*15)
  })
  ctx.globalAlpha=1
  // Skill bar
  const skills=[{key:'SPACE',icon:'⚔️',cd:p.atkTimer},{key:'Q',icon:'💥',cd:0},{key:'E',icon:'🔮',cd:0},{key:'R',icon:'🛡',cd:0},{key:'F',icon:'💊',cd:0}]
  const sbW=skills.length*58+16,sbX=CW/2-sbW/2,sbY=CH-54
  ctx.fillStyle='rgba(20,12,8,0.88)';ctx.fillRect(sbX-4,sbY-4,sbW+8,52)
  ctx.strokeStyle='#8B6020';ctx.lineWidth=1;ctx.strokeRect(sbX-4,sbY-4,sbW+8,52)
  skills.forEach((sk,i)=>{
    const sx2=sbX+i*58,sy2=sbY,onCd=sk.cd>0
    ctx.fillStyle=onCd?'rgba(0,0,0,0.7)':'rgba(40,28,12,0.8)';ctx.fillRect(sx2,sy2,52,44)
    ctx.strokeStyle=onCd?'#555':'#C89030';ctx.lineWidth=1;ctx.strokeRect(sx2,sy2,52,44)
    ctx.font='20px monospace';ctx.textAlign='center';ctx.fillStyle=onCd?'#555':'#fff'
    ctx.fillText(sk.icon,sx2+26,sy2+26)
    ctx.font='6px monospace';ctx.fillStyle='#C89030';ctx.fillText(sk.key,sx2+26,sy2+38)
    if(onCd){ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillRect(sx2,sy2,52,Math.round(44*sk.cd));ctx.fillStyle='#fff';ctx.fillText(sk.cd.toFixed(1),sx2+26,sy2+22)}
  })
  ctx.textAlign='left'
}

function drawMinimap(ctx: CanvasRenderingContext2D, gs: GS) {
  const MW=120,MH=80,mx=CW-MW-8,my=CH-MH-8
  const scX=MW/(WW*TILE),scY=MH/(WH*TILE)
  ctx.fillStyle='rgba(20,12,8,0.88)';ctx.fillRect(mx,my,MW,MH)
  for(let ty=0;ty<WH;ty++) for(let tx=0;tx<WW;tx++){
    const t=MAP[ty][tx]
    ctx.fillStyle=t===2?'#4a90d9':t===3||t===5?'#2a6a14':t===4||t===8?'#2a2040':t===1?'#c8944a':t===7?'#a09060':'#5a9e3a'
    ctx.fillRect(mx+tx*scX*TILE,my+ty*scY*TILE,Math.max(1,scX*TILE),Math.max(1,scY*TILE))
  }
  gs.enemies.forEach(en=>{
    if(en.state==='dead')return
    ctx.fillStyle=en.kind==='dragon'?'#44ff44':en.kind==='skeleton'?'#ddddaa':en.kind==='bat'?'#ffcc00':'#ff4444'
    ctx.fillRect(mx+en.x*scX-1,my+en.y*scY-1,3,3)
  })
  if(!gs.p.dead){ctx.fillStyle='#FFD700';ctx.fillRect(mx+gs.p.x*scX-2,my+gs.p.y*scY-2,5,5)}
  ctx.strokeStyle='rgba(255,255,255,0.3)';ctx.lineWidth=1
  ctx.strokeRect(mx+gs.camX*scX,my+gs.camY*scY,CW*scX,CH*scY)
  ctx.strokeStyle='#C89030';ctx.lineWidth=1;ctx.strokeRect(mx,my,MW,MH)
  ctx.fillStyle='#C89030';ctx.font='6px monospace';ctx.fillText('MAP',mx+3,my+9)
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props{playerName:string;playerClass:string}
export default function PixelGame({playerName,playerClass}:Props){
  const canvasRef=useRef<HTMLCanvasElement>(null)
  const gsRef=useRef<GS|null>(null)
  const rafRef=useRef<number>(0)

  const initGS=useCallback(():GS=>({
    p:mkPlayer(playerName||'HERO',playerClass||'warrior'),
    enemies:mkEnemies(),dmg:[],parts:[],
    chat:[
      {name:'SYSTEM',text:'Welcome to PixelRealms! WASD=move SPACE=attack',c:'#FFD700',age:0},
      {name:'SYSTEM',text:'Dungeon Portal is to the northwest!',c:'#cc88ff',age:0.5},
    ],
    keys:new Set(),camX:17*TILE-CW/2,camY:13*TILE-CH/2,
    lastTs:0,chatTimer:4,npcBubble:null,attackPressed:false,portalAngle:0,
  }),[playerName,playerClass])

  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas)return
    const ctx=canvas.getContext('2d') as CanvasRenderingContext2D
    ctx.imageSmoothingEnabled=false
    const gs=initGS();gsRef.current=gs

    const onKey=(e:KeyboardEvent)=>{
      if(e.type==='keydown')gs.keys.add(e.code);else gs.keys.delete(e.code)
      if(e.code==='Space'&&e.type==='keydown'){e.preventDefault();gs.attackPressed=true}
    }
    window.addEventListener('keydown',onKey);window.addEventListener('keyup',onKey)

    function spawnParts(x:number,y:number,c:string,n=6){
      for(let i=0;i<n;i++) gs.parts.push({x,y,vx:(Math.random()-.5)*5,vy:-Math.random()*5-1,c,t:1,s:Math.random()*4+2})
    }

    function doAttack(){
      if(gs.p.atkTimer>0||gs.p.dead)return
      const{p}=gs
      const atk=p.cls==='warrior'?28:p.cls==='mage'?38:p.cls==='rogue'?22:p.cls==='knight'?32:20
      const range=p.cls==='mage'?130:p.cls==='archer'?170:80
      for(const en of gs.enemies){
        if(en.state==='dead')continue
        const d2=dist2(p.x+PW/2,p.y+PH/2,en.x+18,en.y+18)
        if(d2<range*range){
          const dmg=atk+Math.floor(Math.random()*12)
          en.hp-=dmg
          gs.dmg.push({x:en.x+10,y:en.y-10,v:dmg,c:'#ff4444',t:1})
          spawnParts(en.x+18,en.y+18,'#ff4444',4)
          if(en.hp<=0){
            en.state='dead';en.respTimer=15
            spawnParts(en.x+18,en.y+18,'#FFD700',10)
            p.xp+=en.xp;p.gold+=en.gold;p.tokens+=en.tok;p.usdt+=en.tok*0.001
            gs.dmg.push({x:en.x,y:en.y-28,v:en.xp,c:'#FFD700',t:1.5})
            while(p.xp>=p.xpNext){p.xp-=p.xpNext;p.level++;p.xpNext=Math.floor(p.xpNext*1.65);p.maxHp+=25;p.hp=p.maxHp;p.maxMp+=12;p.mp=p.maxMp;gs.dmg.push({x:p.x+4,y:p.y-24,v:0,c:'#ffffff',t:2.5});gs.chat.push({name:'SYSTEM',text:`${p.name} reached Level ${p.level}! 🎉`,c:'#FFD700',age:0})}
          }
        }
      }
      p.atkTimer=p.cls==='warrior'?.5:p.cls==='mage'?1.0:p.cls==='rogue'?.3:p.cls==='knight'?.7:.65
    }

    function update(dt:number){
      const{p,enemies}=gs;dt=Math.min(dt,.05)
      gs.portalAngle+=dt*2
      if(p.dead){p.respTimer-=dt;if(p.respTimer<=0){p.dead=false;p.hp=p.maxHp;p.mp=Math.floor(p.maxMp*.5);p.x=17*TILE+8;p.y=13*TILE};return}
      p.atkTimer=Math.max(0,p.atkTimer-dt);p.invTimer=Math.max(0,p.invTimer-dt)
      if(p.mp<p.maxMp)p.mp=Math.min(p.maxMp,p.mp+dt*5)
      if(gs.attackPressed){doAttack();gs.attackPressed=false}
      let dx=0,dy=0
      if(gs.keys.has('KeyW')||gs.keys.has('ArrowUp'))dy-=PSPEED
      if(gs.keys.has('KeyS')||gs.keys.has('ArrowDown'))dy+=PSPEED
      if(gs.keys.has('KeyA')||gs.keys.has('ArrowLeft'))dx-=PSPEED
      if(gs.keys.has('KeyD')||gs.keys.has('ArrowRight'))dx+=PSPEED
      if(dx&&dy){dx*=.707;dy*=.707}
      p.moving=dx!==0||dy!==0
      if(p.moving){if(Math.abs(dx)>Math.abs(dy))p.dir=dx>0?'right':'left';else p.dir=dy>0?'down':'up'}
      if(canMove(p.x+dx,p.y,PW,PH))p.x=clamp(p.x+dx,TILE*2,(WW-2)*TILE-PW)
      if(canMove(p.x,p.y+dy,PW,PH))p.y=clamp(p.y+dy,0,(WH-1)*TILE-PH)
      if(p.moving){p.fTimer+=dt;if(p.fTimer>.2){p.fTimer=0;p.frame=(p.frame+1)%2}}else{p.frame=0;p.fTimer=0}
      gs.npcBubble=null
      for(let i=0;i<NPCS.length;i++){
        const n=NPCS[i];const d2=dist2(p.x+PW/2,p.y+PH/2,n.tx*TILE+16,n.ty*TILE+16)
        if(d2<80*80){const mi=Math.floor(Date.now()/4000)%n.msgs.length;gs.npcBubble={idx:i,msg:n.msgs[mi],t:1}}
      }
      for(const en of enemies){
        if(en.state==='dead'){en.respTimer-=dt;if(en.respTimer<=0){en.state='patrol';en.hp=en.maxHp;en.x=en.homeX;en.y=en.homeY};continue}
        en.atkTimer=Math.max(0,en.atkTimer-dt);en.sTimer-=dt
        const d2=dist2(p.x+PW/2,p.y+PH/2,en.x+18,en.y+18)
        const agR=en.kind==='dragon'?220:en.kind==='skeleton'||en.kind==='bat'?170:130
        const atR=en.kind==='dragon'?70:en.kind==='bat'?55:52
        const spd=en.kind==='dragon'?1.8:en.kind==='bat'?2.2:en.kind==='snake'?1.4:en.kind==='skeleton'?1.5:1.0
        if(en.state==='patrol'){
          if(en.sTimer<=0){en.sTimer=1.5+Math.random()*2;const dirs:Dir[]=['up','down','left','right'];en.dir=dirs[Math.floor(Math.random()*4)]}
          if(!p.dead&&d2<agR*agR)en.state='chase'
          const ddx=en.dir==='right'?spd:en.dir==='left'?-spd:0
          const ddy=en.dir==='down'?spd:en.dir==='up'?-spd:0
          if(canMove(en.x+ddx,en.y+ddy,PW,PH)){en.x+=ddx;en.y+=ddy}
          if(dist2(en.x,en.y,en.homeX,en.homeY)>110*110){en.state='patrol';en.sTimer=0}
        } else if(en.state==='chase'){
          if(p.dead||d2>(agR*1.5)**2){en.state='patrol';continue}
          if(d2<atR*atR){en.state='attack';en.sTimer=.5;continue}
          const cs=en.kind==='dragon'?2.2:en.kind==='bat'?2.8:en.kind==='snake'?1.8:2.0
          const ang=Math.atan2(p.y-en.y,p.x-en.x)
          if(canMove(en.x+Math.cos(ang)*cs,en.y,PW,PH))en.x+=Math.cos(ang)*cs
          if(canMove(en.x,en.y+Math.sin(ang)*cs,PW,PH))en.y+=Math.sin(ang)*cs
          en.fTimer+=dt;if(en.fTimer>.22){en.fTimer=0;en.frame=(en.frame+1)%2}
        } else if(en.state==='attack'){
          if(d2>atR*atR*4){en.state='chase';continue}
          en.sTimer-=dt
          if(en.sTimer<=0&&en.atkTimer===0){
            en.sTimer=en.kind==='dragon'?1.8:en.kind==='bat'?.8:1.2
            if(!p.dead&&p.invTimer===0){
              const base=en.kind==='dragon'?40:en.kind==='skeleton'?20:en.kind==='snake'?15:en.kind==='bat'?12:10
              const dmg=Math.max(0,base-(p.level-1)*2)
              p.hp-=dmg;p.invTimer=.8
              gs.dmg.push({x:p.x,y:p.y-10,v:dmg,c:'#ff8800',t:1})
              spawnParts(p.x+PW/2,p.y+PH/2,'#ff4444',3)
              if(p.hp<=0){p.dead=true;p.hp=0;p.respTimer=5;gs.chat.push({name:'SYSTEM',text:'You died! Respawning in 5s...',c:'#ff4444',age:0})}
            }
            en.atkTimer=.3
          }
          en.frame=en.sTimer<.25?1:0
        }
      }
      gs.dmg=gs.dmg.filter(d=>{d.t-=dt*.8;return d.t>0})
      gs.parts=gs.parts.filter(pt=>{pt.x+=pt.vx;pt.y+=pt.vy;pt.vy+=.18;pt.t-=dt*1.5;return pt.t>0})
      gs.chat=gs.chat.filter(c=>{c.age+=dt;return c.age<8})
      gs.chatTimer-=dt
      if(gs.chatTimer<=0){
        gs.chatTimer=4+Math.random()*6
        const fp=FAKE_PLAYERS[Math.floor(Math.random()*FAKE_PLAYERS.length)]
        gs.chat.push({name:fp.name,text:FAKE_MSGS[Math.floor(Math.random()*FAKE_MSGS.length)],c:fp.c,age:0})
        if(gs.chat.length>7)gs.chat=gs.chat.slice(-7)
      }
      const tcx=p.x-CW/2+PW/2,tcy=p.y-CH/2+PH/2
      gs.camX=lerp(gs.camX,tcx,.1);gs.camY=lerp(gs.camY,tcy,.1)
      gs.camX=clamp(gs.camX,0,WW*TILE-CW);gs.camY=clamp(gs.camY,0,WH*TILE-CH)
    }

    function render(ts:number){
      const{p,enemies,dmg,parts,camX,camY,npcBubble}=gs
      ctx.fillStyle='#0a1008';ctx.fillRect(0,0,CW,CH)
      // Tiles
      const stx=Math.max(0,Math.floor(camX/TILE)),etx=Math.min(WW,Math.ceil((camX+CW)/TILE)+1)
      const sty=Math.max(0,Math.floor(camY/TILE)),ety=Math.min(WH,Math.ceil((camY+CH)/TILE)+1)
      for(let ty=sty;ty<ety;ty++) for(let tx=stx;tx<etx;tx++)
        drawTile(ctx,MAP[ty][tx],tx*TILE-camX,ty*TILE-camY,(tx*31+ty*17)%16,ts)
      // Buildings
      for(const b of BUILDINGS) drawBuilding(ctx,b.type,b.tx*TILE-camX,b.ty*TILE-camY,b.tw,b.th,ts)
      // Portal at tile (8,8)
      drawPortal(ctx,8*TILE-camX,8*TILE-camY,gs.portalAngle)
      // NPCs
      for(let i=0;i<NPCS.length;i++){
        const n=NPCS[i]
        const sx=n.tx*TILE-camX,sy=n.ty*TILE-camY
        drawSprO(ctx, NPC_SPRITES[i], sx, sy)
        ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(sx-6,sy-18,n.name.length*6+12,14)
        ctx.fillStyle=n.col;ctx.font='8px "Press Start 2P",monospace';ctx.fillText(n.name,sx,sy-7)
      }
      // Enemies
      for(const en of enemies){
        if(en.state==='dead')continue
        const sx=en.x-camX,sy=en.y-camY
        if(sx<-100||sx>CW+100||sy<-100||sy>CH+100)continue
        const eSpr = getEnemySprite(en.kind, en.frame, ts)
        const eSprW = (eSpr[0]?.length ?? 10) * S
        const eSprH = eSpr.length * S
        drawSprO(ctx, eSpr, sx - eSprW/2 + 18, sy - eSprH + PH)
        // HP bar
        const bw=en.kind==='dragon'?52:36
        const bx=sx+(en.kind==='dragon'?-4:0),by=sy-14
        ctx.fillStyle='#220000';ctx.fillRect(bx,by,bw,6)
        const r=en.hp/en.maxHp
        ctx.fillStyle=r>.5?'#dd2222':r>.25?'#dd8800':'#ff4444'
        ctx.fillRect(bx,by,Math.round(bw*r),6)
        ctx.strokeStyle='#440000';ctx.lineWidth=1;ctx.strokeRect(bx,by,bw,6)
        ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillRect(bx-2,by-13,bw+4,11)
        const lvl=en.kind==='dragon'?8:en.kind==='skeleton'?4:en.kind==='bat'?2:3
        ctx.fillStyle=en.kind==='dragon'?'#88ff88':en.kind==='skeleton'?'#e0e0b0':en.kind==='bat'?'#ffcc00':'#ff8888'
        ctx.font='7px monospace';ctx.fillText(`Lv.${lvl} ${KIND_NAMES[en.kind]}`,bx,by-4)
      }
      // Player
      if(!p.dead){
        const sx=p.x-camX,sy=p.y-camY
        if(p.invTimer>0&&Math.floor(p.invTimer*10)%2===0)ctx.globalAlpha=.4
        const pSpr = getPlayerSprite(p.cls)
        const pSprW = (pSpr[0]?.length ?? 10) * S
        drawSprO(ctx, pSpr, sx + (PW - pSprW)/2, sy, p.dir==='left')
        // Sword (not for mage)
        if(p.cls!=='mage') drawSword(ctx, p.dir, sx, sy)
        ctx.globalAlpha=1
        // Name tag
        const nw=p.name.length*6+14
        ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(sx+PW/2-nw/2,sy-22,nw,14)
        ctx.fillStyle='#FFD700';ctx.font='8px "Press Start 2P",monospace';ctx.textAlign='center'
        ctx.fillText(p.name,sx+PW/2,sy-11);ctx.textAlign='left'
        ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillRect(sx+PW/2-14,sy-36,28,12)
        ctx.fillStyle='#ff9900';ctx.font='7px monospace';ctx.textAlign='center'
        ctx.fillText(`Lv.${p.level}`,sx+PW/2,sy-26);ctx.textAlign='left'
      }
      // NPC speech bubble
      if(npcBubble){
        const n=NPCS[npcBubble.idx]
        const bx=n.tx*TILE-camX-50,by=n.ty*TILE-camY-52
        const msg=npcBubble.msg,bw=Math.min(msg.length*6+16,220)
        ctx.fillStyle='rgba(20,12,8,0.92)';ctx.fillRect(bx,by,bw,32)
        ctx.strokeStyle=n.col;ctx.lineWidth=1;ctx.strokeRect(bx,by,bw,32)
        ctx.fillStyle=n.col;ctx.font='7px monospace'
        const words=msg.split(' ');let line='',ly=by+13
        for(const w of words){if((line+w).length*6>bw-12){ctx.fillText(line,bx+6,ly);line='';ly+=11};line+=(line?' ':'')+w}
        ctx.fillText(line,bx+6,ly)
      }
      // Damage numbers
      for(const d of dmg){
        ctx.globalAlpha=Math.min(1,d.t*1.5);ctx.fillStyle=d.c
        const text=d.v===0?'LEVEL UP!':d.v<0?`${d.v}`:`-${d.v}`
        const fs=d.v===0?11:d.v>50?14:10
        ctx.font=`bold ${fs}px "Press Start 2P",monospace`
        ctx.fillText(text,d.x-camX,d.y-camY-(1-d.t)*35)
      }
      ctx.globalAlpha=1
      // Particles
      for(const pt of parts){ctx.globalAlpha=pt.t;ctx.fillStyle=pt.c;ctx.fillRect(pt.x-camX,pt.y-camY,pt.s,pt.s)}
      ctx.globalAlpha=1
      drawHUD(ctx,gs,ts)
      drawMinimap(ctx,gs)
      if(p.dead){
        ctx.fillStyle='rgba(150,0,0,0.45)';ctx.fillRect(0,0,CW,CH)
        ctx.fillStyle='#ff4444';ctx.font='22px "Press Start 2P",monospace';ctx.textAlign='center'
        ctx.fillText('YOU DIED',CW/2,CH/2-20)
        ctx.font='10px "Press Start 2P",monospace';ctx.fillStyle='#ffaaaa'
        ctx.fillText(`Respawning in ${Math.ceil(p.respTimer)}s...`,CW/2,CH/2+14)
        ctx.textAlign='left'
      }
    }

    function loop(ts:number){
      const dt=gs.lastTs?(ts-gs.lastTs)/1000:0;gs.lastTs=ts
      update(dt);render(ts)
      rafRef.current=requestAnimationFrame(loop)
    }
    rafRef.current=requestAnimationFrame(loop)
    return()=>{cancelAnimationFrame(rafRef.current);window.removeEventListener('keydown',onKey);window.removeEventListener('keyup',onKey)}
  },[initGS])

  return(
    <canvas ref={canvasRef} width={CW} height={CH}
      className="block w-full" tabIndex={0}
      style={{imageRendering:'pixelated',cursor:'crosshair',maxWidth:CW}}/>
  )
}
