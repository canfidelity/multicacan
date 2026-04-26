'use client'
// Bright 2D pixel MMORPG — Vox Arena visual style

import { useEffect, useRef, useCallback } from 'react'

// ── Constants ──────────────────────────────────────────────────────────────────
const TILE = 48
const CW = 960, CH = 580
const WW = 42, WH = 28
const PSPEED = 3.2
const PW = 28, PH = 40

// ── Map ────────────────────────────────────────────────────────────────────────
// 0=grass 1=sand/path 2=water 3=tree(solid) 4=wall(solid) 5=deepgrass
// 6=flower 7=stone 8=dungeon_floor 9=sand_dark
type Tile = 0|1|2|3|4|5|6|7|8|9
const SOLID: Set<Tile> = new Set([2,3,4])

function buildMap(): Tile[][] {
  const m: Tile[][] = Array.from({length:WH}, ()=>Array(WW).fill(0) as Tile[])

  // Water border (west)
  for (let y=0;y<WH;y++) { m[y][0]=2; m[y][1]=2 }
  // Water (east edge)
  for (let y=8;y<20;y++) { m[y][WW-1]=2; m[y][WW-2]=2 }

  // Sandy village center (town square)
  for (let y=7;y<17;y++) for (let x=6;x<28;x++) m[y][x]=1

  // Main stone path (vertical + horizontal crossroads)
  for (let y=2;y<26;y++) { m[y][16]=7; m[y][17]=7 }
  for (let x=4;x<38;x++) { m[12][x]=7; m[13][x]=7 }

  // Stone roads in village
  for (let y=7;y<17;y++) { m[y][10]=7; m[y][11]=7; m[y][22]=7; m[y][23]=7 }

  // Dungeon area (north)
  for (let y=0;y<7;y++) for (let x=10;x<26;x++) m[y][x]=8
  for (let y=0;y<7;y++) { m[y][9]=4; m[y][26]=4 }
  for (let x=9;x<27;x++) { m[7][x]=4 }
  // Dungeon gate opening
  for (let x=15;x<19;x++) m[7][x]=8

  // Forest bands (north-west + south)
  for (let y=0;y<10;y++) for (let x=2;x<9;x++)
    if ((x*5+y*7)%4<3) m[y][x]=3
  for (let y=18;y<WH;y++) for (let x=2;x<WW-2;x++)
    if (m[y][x]===0 && (x*7+y*3)%4<3) m[y][x]=3
  // Keep paths through south forest
  for (let y=18;y<WH;y++) { m[y][16]=0; m[y][17]=0 }

  // Forest right side
  for (let y=0;y<8;y++) for (let x=WW-6;x<WW-1;x++)
    if ((x*3+y*11)%3<2) m[y][x]=3

  // Flowers in grass
  for (let y=14;y<19;y++) for (let x=28;x<WW-4;x++)
    if (m[y][x]===0 && (x*11+y*7)%9===0) m[y][x]=6
  for (let y=2;y<6;y++) for (let x=28;x<36;x++)
    if (m[y][x]===0 && (x*13+y*5)%7===0) m[y][x]=6

  // Deep grass patches
  for (let y=14;y<20;y++) for (let x=28;x<WW-4;x++)
    if (m[y][x]===0) m[y][x]=5

  return m
}
const MAP = buildMap()

// ── Helpers ────────────────────────────────────────────────────────────────────
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

// ── Types ──────────────────────────────────────────────────────────────────────
type Dir='up'|'down'|'left'|'right'
type EnemyKind='slime'|'skeleton'|'dragon'|'snake'|'bat'

interface Player {
  x:number;y:number;hp:number;maxHp:number;mp:number;maxMp:number
  level:number;xp:number;xpNext:number;gold:number;tokens:number;usdt:number
  dir:Dir;frame:number;fTimer:number;atkTimer:number;invTimer:number
  moving:boolean;dead:boolean;respTimer:number;name:string;cls:string
}
interface Enemy {
  id:number;kind:EnemyKind;x:number;y:number;hp:number;maxHp:number
  dir:Dir;frame:number;fTimer:number;state:'patrol'|'chase'|'attack'|'dead'
  sTimer:number;homeX:number;homeY:number;atkTimer:number
  xp:number;gold:number;tok:number;respTimer:number
}
interface DmgNum{x:number;y:number;v:number;c:string;t:number}
interface Particle{x:number;y:number;vx:number;vy:number;c:string;t:number;s:number}
interface ChatMsg{name:string;text:string;c:string;age:number}
interface GS{
  p:Player;enemies:Enemy[];dmg:DmgNum[];parts:Particle[];chat:ChatMsg[]
  keys:Set<string>;camX:number;camY:number;lastTs:number
  chatTimer:number;npcBubble:{idx:number;msg:string;t:number}|null
  attackPressed:boolean;portalAngle:number
}

// ── NPC/Chat data ──────────────────────────────────────────────────────────────
const NPCS=[
  {tx:14.5,ty:10.5,name:'INNKEEPER',col:'#f0c060',msgs:['Rest here, weary traveler!','Room costs 5 gold per night.','Heard dragons are restless down south.','A dungeon portal opened to the north!']},
  {tx:20,ty:9.5,name:'MERCHANT',col:'#60f0c0',msgs:['Best wares in the realm!','$VOX tokens for rare gear!','Dragon scales fetch 500g here.','New stock: +15 STR sword, 300g.']},
  {tx:8.5,ty:11.5,name:'BLACKSMITH',col:'#f08060',msgs:['I forge the finest blades.','Bring me dragon scales for a weapon.','My forge burns day and night!','Upgrade armor for 100g.']},
]
const FAKE_PLAYERS=[
  {name:'Eeyo',c:'#ff9060'},{name:'MageKing',c:'#cc66ff'},
  {name:'ShadowBlade',c:'#60ff80'},{name:'IronShield',c:'#60d0ff'},
  {name:'ArrowStorm',c:'#ffcc44'},
]
const FAKE_MSGS=[
  'Anyone want to raid the dungeon? ⚔️','LFG dragon fight!','Just earned 150 $VOX! 💰',
  'WTS rare skeleton sword NFT','Dragon drops 200g — worth it!',
  'Guild recruiting, DM me','Press E near portal to enter dungeon',
  'Lv10 reached, going to boss zone','WASD to move, SPACE to attack!',
  'That bat nearly one-shot me lol',
]

// ── Buildings data ─────────────────────────────────────────────────────────────
const BUILDINGS=[
  {tx:7,ty:8,tw:4,th:4,type:'tavern',name:'The Rusty Flagon'},
  {tx:20,ty:8,tw:4,th:3,type:'shop',name:'Magic Emporium'},
  {tx:13,ty:8,tw:4,th:3,type:'blacksmith',name:'Ironforge'},
  {tx:24,ty:9,tw:3,th:3,type:'guild',name:'Guild Hall'},
]

// ── Init ───────────────────────────────────────────────────────────────────────
function mkPlayer(name:string,cls:string):Player{
  return{x:16*TILE+8,y:15*TILE,hp:120,maxHp:120,mp:40,maxMp:40,level:1,xp:0,xpNext:100,gold:0,tokens:0,usdt:0,dir:'up',frame:0,fTimer:0,atkTimer:0,invTimer:0,moving:false,dead:false,respTimer:0,name,cls}
}
function mkEnemies():Enemy[]{
  const list:Enemy[]=[];let id=0
  const add=(kind:EnemyKind,tx:number,ty:number,hp:number,xp:number,gold:number,tok:number)=>
    list.push({id:id++,kind,x:tx*TILE,y:ty*TILE,hp,maxHp:hp,dir:'down',frame:0,fTimer:0,state:'patrol',sTimer:Math.random()*3,homeX:tx*TILE,homeY:ty*TILE,atkTimer:0,xp,gold,tok,respTimer:0})
  // Bats in dungeon
  add('bat',12,2,20,12,3,0); add('bat',19,3,20,12,3,0); add('bat',14,4,20,12,3,0)
  // Skeletons in dungeon
  add('skeleton',15,2,55,30,12,2); add('skeleton',18,4,55,30,12,2)
  // Slimes near village
  add('slime',30,14,35,15,5,1); add('slime',34,16,35,15,5,1); add('slime',31,18,35,15,5,1)
  // Snakes south
  add('snake',20,21,45,20,8,1); add('snake',25,23,45,20,8,1)
  // Dragons (south forest)
  add('dragon',14,22,200,150,100,20); add('dragon',28,24,200,150,100,20)
  return list
}

// ── Tile drawing ───────────────────────────────────────────────────────────────
function drawTile(ctx:CanvasRenderingContext2D,t:Tile,sx:number,sy:number,ts:number){
  const T=TILE
  switch(t){
    case 0:{// Bright grass
      ctx.fillStyle='#5a9e3a';ctx.fillRect(sx,sy,T,T)
      ctx.fillStyle='#6db84a';ctx.fillRect(sx+3,sy+3,5,5);ctx.fillRect(sx+24,sy+20,4,4);ctx.fillRect(sx+38,sy+36,5,5)
      ctx.fillStyle='#4a8e2a';ctx.fillRect(sx+12,sy+30,3,3);ctx.fillRect(sx+40,sy+10,3,3)
      break}
    case 1:{// Sandy village ground
      ctx.fillStyle='#c8944a';ctx.fillRect(sx,sy,T,T)
      ctx.fillStyle='#d4a85a';ctx.fillRect(sx+6,sy+6,8,5);ctx.fillRect(sx+22,sy+22,10,4)
      ctx.fillStyle='#b88038';ctx.fillRect(sx+36,sy+10,4,4)
      break}
    case 2:{// Water
      const wave=Math.sin(ts*0.003+(sx+sy)*0.05)*2
      ctx.fillStyle='#4a90d9';ctx.fillRect(sx,sy,T,T)
      ctx.fillStyle='#5aa0e9';ctx.fillRect(sx+2,sy+8+wave,T-4,5);ctx.fillRect(sx+2,sy+28+wave,T-4,5)
      ctx.fillStyle='#7ab8f5';ctx.fillRect(sx+6,sy+10+wave,12,3);ctx.fillRect(sx+20,sy+30+wave,14,3)
      break}
    case 3:{// Tree
      ctx.fillStyle='#2a5a14';ctx.fillRect(sx,sy,T,T)
      // Trunk
      ctx.fillStyle='#6a3a10';ctx.fillRect(sx+18,sy+30,12,18)
      // Canopy layers
      ctx.fillStyle='#2a7a18';ctx.fillRect(sx+8,sy+12,32,24);ctx.fillRect(sx+12,sy+4,24,14)
      ctx.fillStyle='#3a9a28';ctx.fillRect(sx+12,sy+14,24,18);ctx.fillRect(sx+16,sy+6,16,10)
      ctx.fillStyle='#50b838';ctx.fillRect(sx+16,sy+8,16,8);ctx.fillRect(sx+14,sy+16,20,10)
      break}
    case 4:{// Dungeon wall / castle wall
      ctx.fillStyle='#3a3048';ctx.fillRect(sx,sy,T,T)
      ctx.fillStyle='#4a405a';ctx.fillRect(sx+2,sy+2,14,14);ctx.fillRect(sx+18,sy+18,14,14)
      ctx.fillStyle='#2a2038';ctx.fillRect(sx+16,sy,2,T);ctx.fillRect(sx,sy+16,T,2)
      ctx.fillStyle='#5a5068';ctx.fillRect(sx+4,sy+4,6,6);ctx.fillRect(sx+20,sy+20,6,6)
      break}
    case 5:{// Deep/lush grass
      ctx.fillStyle='#4a8a2a';ctx.fillRect(sx,sy,T,T)
      ctx.fillStyle='#5aaa3a';ctx.fillRect(sx+4,sy+4,6,8);ctx.fillRect(sx+16,sy+22,5,7);ctx.fillRect(sx+32,sy+12,5,7)
      ctx.fillStyle='#3a7a1a';ctx.fillRect(sx+10,sy+30,4,4)
      break}
    case 6:{// Flower
      ctx.fillStyle='#5a9e3a';ctx.fillRect(sx,sy,T,T)
      ctx.fillStyle='#6db84a';ctx.fillRect(sx+3,sy+3,5,5)
      // Flowers
      const fc=['#ff6090','#ffdd40','#ff8030','#cc44ff','#40ddff']
      const fp=[(x:number,y:number,c:string)=>{ctx.fillStyle=c;ctx.fillRect(sx+x-2,sy+y,2,4);ctx.fillRect(sx+x,sy+y-2,4,2);ctx.fillStyle='#ffff80';ctx.fillRect(sx+x,sy+y,2,2)}]
      fp[0](10,14,fc[(sx+sy)%5]);fp[0](28,30,fc[(sx*2+sy)%5]);fp[0](38,8,fc[(sx+sy*3)%5])
      break}
    case 7:{// Stone path
      ctx.fillStyle='#a09060';ctx.fillRect(sx,sy,T,T)
      ctx.fillStyle='#907850';ctx.fillRect(sx,sy,2,T);ctx.fillRect(sx,sy,T,2)
      ctx.fillStyle='#b0a070';ctx.fillRect(sx+3,sy+3,18,18);ctx.fillRect(sx+24,sy+24,18,18)
      ctx.fillStyle='#c0b080';ctx.fillRect(sx+5,sy+5,6,6);ctx.fillRect(sx+26,sy+26,6,6)
      break}
    case 8:{// Dungeon floor
      ctx.fillStyle='#1e1630';ctx.fillRect(sx,sy,T,T)
      ctx.fillStyle='#261e40';ctx.fillRect(sx+2,sy+2,20,20);ctx.fillRect(sx+24,sy+24,20,20)
      ctx.fillStyle='#160c28';ctx.fillRect(sx+22,sy,4,T);ctx.fillRect(sx,sy+22,T,4)
      break}
    case 9:{// Dark sand
      ctx.fillStyle='#a07838';ctx.fillRect(sx,sy,T,T)
      ctx.fillStyle='#b08848';ctx.fillRect(sx+8,sy+8,8,5)
      break}
  }
}

// ── Building drawing ───────────────────────────────────────────────────────────
function drawBuilding(ctx:CanvasRenderingContext2D,type:string,sx:number,sy:number,tw:number,th:number,ts:number){
  const w=tw*TILE,h=th*TILE
  if(type==='tavern'){
    // Wood walls
    ctx.fillStyle='#8B5A2B';ctx.fillRect(sx,sy,w,h)
    // Wood planks
    ctx.fillStyle='#7A4A1A';for(let i=0;i<h;i+=12){ctx.fillRect(sx,sy+i,w,2)}
    // Roof
    ctx.fillStyle='#8B1A1A';ctx.fillRect(sx-8,sy-TILE/2,w+16,TILE/2+8)
    ctx.fillStyle='#AA2222';ctx.fillRect(sx-4,sy-TILE/2+4,w+8,TILE/2)
    // Windows (glowing)
    const wg=Math.sin(ts*0.002)*0.15+0.85
    ctx.fillStyle=`rgba(255,200,100,${wg})`;ctx.fillRect(sx+12,sy+16,20,16);ctx.fillRect(sx+w-32,sy+16,20,16)
    ctx.fillStyle='#5A3010';ctx.fillRect(sx+10,sy+14,24,20);ctx.fillRect(sx+w-34,sy+14,24,20)
    ctx.strokeStyle='#7A4A1A';ctx.lineWidth=2;ctx.strokeRect(sx+10,sy+14,24,20);ctx.strokeRect(sx+w-34,sy+14,24,20)
    // Door
    ctx.fillStyle='#4A2808';ctx.fillRect(sx+w/2-12,sy+h-36,24,36)
    ctx.fillStyle='#8B6030';ctx.fillRect(sx+w/2-10,sy+h-34,20,32)
    // Sign
    ctx.fillStyle='#C8A060';ctx.fillRect(sx+w/2-18,sy+16,36,14)
    ctx.fillStyle='#3A1808';ctx.font='7px monospace';ctx.textAlign='center'
    ctx.fillText('TAVERN',sx+w/2,sy+26)
  } else if(type==='blacksmith'){
    ctx.fillStyle='#4A4040';ctx.fillRect(sx,sy,w,h)
    ctx.fillStyle='#3A3030';for(let i=0;i<w;i+=16){ctx.fillRect(sx+i,sy,2,h)}
    // Chimney with fire
    ctx.fillStyle='#5A4A40';ctx.fillRect(sx+w-20,sy-TILE/2,16,TILE/2+8)
    const fCol=['#ff6010','#ff4000','#ff8020']
    ctx.fillStyle=fCol[Math.floor(ts/100)%3];ctx.fillRect(sx+w-18,sy-TILE/2-8,12,12)
    // Anvil glow
    ctx.fillStyle='rgba(255,80,0,0.4)';ctx.fillRect(sx+8,sy+h-40,w-16,30)
    ctx.fillStyle='#707070';ctx.fillRect(sx+16,sy+h-32,w/2-16,24)
    ctx.fillStyle='#606060';ctx.fillRect(sx+20,sy+h-24,w/2-24,16)
    // Roof
    ctx.fillStyle='#5A5050';ctx.fillRect(sx-4,sy-14,w+8,18)
    ctx.fillStyle='#2A2020';ctx.font='7px monospace';ctx.textAlign='center'
    ctx.fillText('FORGE',sx+w/2,sy+20)
  } else if(type==='shop'){
    ctx.fillStyle='#2A1A4A';ctx.fillRect(sx,sy,w,h)
    // Purple shimmer
    ctx.fillStyle='#3A2A5A';for(let i=0;i<w;i+=14){ctx.fillRect(sx+i,sy,2,h)}
    // Stars decoration
    const starT=ts*0.004
    for(let i=0;i<6;i++){
      const sa=Math.sin(starT+i)*3,sx2=sx+8+i*12,sy2=sy+8+Math.abs(sa)
      ctx.fillStyle='#ffdd88';ctx.fillRect(sx2,sy2,3,3)
    }
    // Roof
    ctx.fillStyle='#4A1A7A';ctx.fillRect(sx-4,sy-14,w+8,18)
    // Window (magic glow)
    ctx.fillStyle=`rgba(150,50,255,${0.6+Math.sin(ts*0.003)*0.3})`;ctx.fillRect(sx+10,sy+10,w-20,22)
    ctx.fillStyle='#AA66FF';ctx.strokeStyle='#CC88FF';ctx.lineWidth=2;ctx.strokeRect(sx+8,sy+8,w-16,26)
    ctx.fillStyle='#AA88FF';ctx.font='7px monospace';ctx.textAlign='center'
    ctx.fillText('MAGIC SHOP',sx+w/2,sy+22)
    ctx.fillText('✨ OPEN ✨',sx+w/2,sy+34)
  } else {// guild
    ctx.fillStyle='#6A5020';ctx.fillRect(sx,sy,w,h)
    // Banner
    ctx.fillStyle='#CC2222';ctx.fillRect(sx+w/2-10,sy-24,20,30)
    ctx.fillStyle='#FFD700';ctx.fillText('⚔',sx+w/2,sy-8)
    // Pillars
    ctx.fillStyle='#8A7040';ctx.fillRect(sx,sy,8,h);ctx.fillRect(sx+w-8,sy,8,h)
    // Roof with battlements
    ctx.fillStyle='#7A6030';ctx.fillRect(sx-4,sy-14,w+8,18)
    for(let i=0;i<w;i+=14){ctx.fillStyle='#7A6030';ctx.fillRect(sx+i-2,sy-22,10,12)}
    ctx.fillStyle='#4A3010';ctx.font='7px monospace';ctx.textAlign='center'
    ctx.fillText('GUILD',sx+w/2,sy+18)
  }
  ctx.textAlign='left'
}

// ── Dungeon portal ─────────────────────────────────────────────────────────────
function drawPortal(ctx:CanvasRenderingContext2D,sx:number,sy:number,angle:number){
  const cx=sx+TILE,cy=sy+TILE*1.5
  // Outer glow
  const grad=ctx.createRadialGradient(cx,cy,8,cx,cy,40)
  grad.addColorStop(0,'rgba(180,60,255,0.9)')
  grad.addColorStop(0.5,'rgba(100,20,200,0.5)')
  grad.addColorStop(1,'rgba(60,0,120,0)')
  ctx.fillStyle=grad;ctx.beginPath();ctx.arc(cx,cy,40,0,Math.PI*2);ctx.fill()
  // Swirling ring
  ctx.save();ctx.translate(cx,cy)
  for(let i=0;i<12;i++){
    ctx.rotate(angle+(i*Math.PI/6))
    ctx.fillStyle=`rgba(${150+i*8},${40},${255},${0.8-i*0.06})`
    ctx.fillRect(16,-4,14,4)
  }
  ctx.restore()
  // Center spark
  ctx.fillStyle=`rgba(220,140,255,${0.7+Math.sin(angle*3)*0.3})`
  ctx.beginPath();ctx.arc(cx,cy,12,0,Math.PI*2);ctx.fill()
  ctx.fillStyle='rgba(255,255,255,0.9)'
  ctx.beginPath();ctx.arc(cx,cy,5,0,Math.PI*2);ctx.fill()
  // Portal label
  ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(cx-38,cy-56,76,16)
  ctx.fillStyle='#cc88ff';ctx.font='8px "Press Start 2P",monospace';ctx.textAlign='center'
  ctx.fillText('Dungeon Portal',cx,cy-44);ctx.textAlign='left'
}

// ── Sprites ────────────────────────────────────────────────────────────────────
type R=[number,number,number,number,string]
function dr(ctx:CanvasRenderingContext2D,rs:R[],ox:number,oy:number){
  for(const [x,y,w,h,c] of rs){if(!c||c==='x')continue;ctx.fillStyle=c;ctx.fillRect(ox+x,oy+y,w,h)}
}

function playerSprite(cls:string,dir:Dir,frame:number,ts:number):R[]{
  const bob=frame===0?0:2
  const skin='#f5c580'
  if(cls==='warrior')return[
    [8,0,16,4,'#888888'],[6,2,20,6,'#bbbbbb'], // helmet
    [8,6,16,8,skin],[9,9,4,3,'#3355cc'],[19,9,4,3,'#3355cc'], // face/eyes
    [4,14,24,14,'#cccccc'],[4,27,24,2,'#8a5520'],[10,27,8,2,'#f0c030'], // armor/belt
    dir==='right'?[-2,12,6,14,'#b0b0b0']:[26,12,6,14,'#b0b0b0'], // sword
    dir==='left'?[24,14,8,10,'#4466cc']:[-4,14,8,10,'#4466cc'], // shield
    [6,28,8,8+bob,'#3333aa'],[16,28,8,8-bob,'#3333aa'], // legs
    [4,34+bob,10,4,'#22228a'],[14,34-bob,10,4,'#22228a'], // feet
  ]
  if(cls==='mage')return[
    [9,-8,14,4,'#4a1a8a'],[5,-4,22,5,'#4a1a8a'],[13,-6,6,3,'#f0d020'], // hat
    [8,4,16,10,skin],[9,7,4,3,'#aa22ee'],[19,7,4,3,'#aa22ee'], // face
    [3,13,26,16,'#7a20dd'],[9,14,14,12,'#9a40ff'], // robe
    [-6,0,5,32,'#8a5520'],[-6,-3,7,5,'rgba(30,200,255,0.9)'], // staff+orb
    [6,28,8,8+bob,'#5a14aa'],[16,28,8,8-bob,'#5a14aa'],
    [5,34+bob,10,4,'#3a0a7a'],[14,34-bob,10,4,'#3a0a7a'],
  ]
  if(cls==='rogue')return[
    [6,0,20,5,'#1a1a2e'],[8,4,16,9,skin],[8,7,4,3,'#22ee60'],[20,7,4,3,'#22ee60'],
    [5,12,22,16,'#1a1a2e'],[5,27,22,2,'#5a3010'],[10,27,8,2,'#f0c030'],
    [-4,10,5,18,'#c0c0c0'],[26,10,5,18,'#c0c0c0'], // dual daggers
    [6,28,8,8+bob,'#111111'],[16,28,8,8-bob,'#111111'],
    [4,34+bob,10,4,'#080808'],[14,34-bob,10,4,'#080808'],
  ]
  // archer
  return[
    [2,0,28,4,'#1a5a20'],[6,-4,20,5,'#1a5a20'],[24,0,3,6,'#f0d020'],
    [8,4,16,9,skin],[9,7,4,3,'#333333'],[19,7,4,3,'#333333'],
    [5,12,22,16,'#1a6a20'],
    [-7,2,4,30,'#8a5520'],[-6,4,2,24,'#e0e0e0'], // bow
    [27,10,5,16,'#8a5520'], // quiver
    [6,28,8,8+bob,'#1a4a20'],[16,28,8,8-bob,'#1a4a20'],
    [5,34+bob,10,4,'#5a3010'],[14,34-bob,10,4,'#5a3010'],
  ]
}

function enemySprite(kind:EnemyKind,frame:number,ts:number):R[]{
  if(kind==='slime'){
    const sq=frame===0?0:5
    return[
      [2,4+sq,28,18-sq,'#20cc40'],[0,8+sq,32,14-sq,'#18bb35'],
      [4,6+sq,12,6,'#40ee60'],
      [5,9+sq,6,5,'#ffffff'],[20,9+sq,6,5,'#ffffff'],
      [6,10+sq,3,3,'#111111'],[21,10+sq,3,3,'#111111'],
      [2,19,28,6,'#10aa25'],
    ]
  }
  if(kind==='skeleton'){
    const lf=frame===0?3:-3
    return[
      [7,0,18,14,'#e8e8d0'],[9,4,6,6,'#2a2a2a'],[17,4,6,6,'#2a2a2a'],
      [10,5,3,4,'#cc2222'],[18,5,3,4,'#cc2222'],
      [10,11,3,4,'#c8c8b0'],[14,11,3,4,'#c8c8b0'],[18,11,3,4,'#c8c8b0'],
      [7,14,18,12,'#d8d8c0'],
      [8,15,3,10,'#3a3a2a'],[13,15,3,10,'#3a3a2a'],[18,15,3,10,'#3a3a2a'],
      [1,14,6,5,'#d8d8c0'],[25,14,6,5,'#d8d8c0'],
      [0,18,5,10,'#d8d8c0'],[27,18,5,10,'#d8d8c0'],
      [28,10,3,20,'#b0b0b0'],[27,8,5,4,'#909090'], // sword
      [9,26,5,8+lf,'#d8d8c0'],[18,26,5,8-lf,'#d8d8c0'],
      [7,32+lf,8,4,'#d8d8c0'],[16,32-lf,8,4,'#d8d8c0'],
    ]
  }
  if(kind==='bat'){
    const flap=frame===0?0:-4
    return[
      [-10,8+flap,14,20,'#4a2060'],[-10,10+flap,12,16,'#6a3080'],
      [28,8+flap,14,20,'#4a2060'],[28,10+flap,12,16,'#6a3080'],
      [8,12,16,14,'#2a1040'],
      [10,10,6,6,'#f0c040'],[18,10,6,6,'#f0c040'], // eyes
      [12,22,4,4,'#ff4040'], // mouth
    ]
  }
  if(kind==='snake'){
    const s=frame===0?0:3
    return[
      [0,20,36,10,'#2a8020'],[-4,22,44,6,'#40a030'],
      [s,14,14,12,'#2a8020'],[s+2,12,10,6,'#40a030'], // head
      [s+3,13,3,3,'#ffff40'],[s+8,13,3,3,'#ffff40'], // eyes
      [s+2,18,10,3,'#ff4040'], // tongue hint
      [32,20,10,8,'#2a8020'], // tail tip
    ]
  }
  // dragon
  const wf=frame===0?0:6
  return[
    [-20,2-wf,22,24+wf,'#cc2222'],[38,2-wf,22,24+wf,'#cc2222'],
    [-18,6-wf,14,18,'#dd3333'],[40,6-wf,14,18,'#dd3333'],
    [4,6,32,28,'#dd3333'],[8,0,24,14,'#cc2222'],
    [10,6,10,10,'#ee4444'],[28,2,6,6,'#f0f020'],[29,3,3,3,'#111'],
    [24,-6,4,8,'#8a4a10'], // horn
    [28,30,28,6,'#cc2222'],[44,32,14,5,'#aa1a1a'],
    [6,32,10,12,'#aa1a1a'],[20,32,10,12,'#aa1a1a'],
    [4,42+wf,14,6,'#aa1a1a'],[18,42+wf,14,6,'#aa1a1a'],
    ...(frame===1?[[-4,6,8,5,'#ff8800']as R,[-3,7,5,3,'#ffcc00']as R]:[]),
  ]
}

function npcSprite(col:string,frame:number):R[]{
  const bob=frame===0?0:1
  return[
    [8,1,16,4,'#4a3020'],[6,4,20,10,col.replace('#','rgba(').replace(')','').concat(',1)').replace('rgba(','#')],// robe as body color
    [8,4,16,10,'#f5c580'],[9,7,4,3,'#444'],[19,7,4,3,'#444'],
    [4,13,24,14,col],[10,14,12,10,col],
    [5,26,8,8+bob,'#3a2010'],[17,26,8,8-bob,'#3a2010'],
  ]
}

// ── HUD drawing ────────────────────────────────────────────────────────────────
function drawHUD(ctx:CanvasRenderingContext2D,gs:GS,ts:number){
  const {p}=gs
  // ── Left panel (portrait + stats) ──────────────────────────────────────────
  const panW=220,panH=130
  ctx.fillStyle='rgba(20,12,8,0.88)';ctx.fillRect(8,8,panW,panH)
  ctx.strokeStyle='#8B6020';ctx.lineWidth=2;ctx.strokeRect(8,8,panW,panH)
  ctx.strokeStyle='#C89030';ctx.lineWidth=1;ctx.strokeRect(10,10,panW-4,panH-4)

  // Portrait box
  ctx.fillStyle='rgba(40,24,12,0.9)';ctx.fillRect(14,14,52,60)
  ctx.strokeStyle='#C89030';ctx.lineWidth=1;ctx.strokeRect(14,14,52,60)
  // Mini portrait (draw class icon)
  ctx.save();ctx.translate(14,14);ctx.scale(52/36,60/44)
  dr(ctx,playerSprite(p.cls,'down',Math.floor(ts/300)%2,ts),2,2)
  ctx.restore()

  // Name + class
  ctx.fillStyle='#FFD700';ctx.font='8px "Press Start 2P",monospace'
  ctx.fillText(p.name.slice(0,10),72,26)
  ctx.fillStyle='#C0A060';ctx.font='7px monospace'
  ctx.fillText(p.cls.toUpperCase(),72,38)
  ctx.fillStyle='#FFD700';ctx.font='7px monospace'
  ctx.fillText(`Lv.${p.level}`,72,50)
  ctx.fillStyle='#AAA070';ctx.fillText(`⚡ PWR: ${10+p.level*3}`,72,62)

  // HP bar
  const bx=14,by=82,bw=200
  ctx.fillStyle='#220000';ctx.fillRect(bx,by,bw,11)
  ctx.fillStyle=p.hp/p.maxHp>0.5?'#dd2222':p.hp/p.maxHp>0.25?'#dd8800':'#ff4444'
  ctx.fillRect(bx,by,Math.round(bw*p.hp/p.maxHp),11)
  ctx.strokeStyle='#440000';ctx.lineWidth=1;ctx.strokeRect(bx,by,bw,11)
  ctx.fillStyle='#fff';ctx.font='7px monospace';ctx.fillText(`HP  ${p.hp}/${p.maxHp}`,bx+3,by+9)

  // MP bar
  ctx.fillStyle='#000022';ctx.fillRect(bx,by+14,bw,11)
  ctx.fillStyle='#2255cc';ctx.fillRect(bx,by+14,Math.round(bw*p.mp/p.maxMp),11)
  ctx.strokeStyle='#001144';ctx.lineWidth=1;ctx.strokeRect(bx,by+14,bw,11)
  ctx.fillStyle='#aaccff';ctx.fillText(`MP  ${Math.floor(p.mp)}/${p.maxMp}`,bx+3,by+23)

  // XP bar
  ctx.fillStyle='#221100';ctx.fillRect(bx,by+28,bw,11)
  ctx.fillStyle='#cc8800';ctx.fillRect(bx,by+28,Math.round(bw*p.xp/p.xpNext),11)
  ctx.strokeStyle='#442200';ctx.lineWidth=1;ctx.strokeRect(bx,by+28,bw,11)
  ctx.fillStyle='#ffcc44';ctx.fillText(`XP  ${p.xp}/${p.xpNext}`,bx+3,by+37)

  // ── Top-right resource bar ──────────────────────────────────────────────────
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
  // Settings icon
  ctx.fillStyle='#888';ctx.font='14px monospace';ctx.fillText('⚙',CW-26,28)

  // ── Chat box ────────────────────────────────────────────────────────────────
  const chatX=8,chatY=CH-130
  ctx.fillStyle='rgba(20,12,8,0.78)';ctx.fillRect(chatX,chatY,300,118)
  ctx.strokeStyle='#8B6020';ctx.lineWidth=1;ctx.strokeRect(chatX,chatY,300,118)
  ctx.font='7px monospace'
  gs.chat.slice(-7).forEach((m,i)=>{
    const alpha=Math.min(1,(8-m.age)/3)
    ctx.globalAlpha=alpha
    ctx.fillStyle=m.c;ctx.fillText(`[${m.name}]`,chatX+6,chatY+14+i*15)
    ctx.fillStyle='#ddddcc';ctx.fillText(m.text.slice(0,32),chatX+6+(m.name.length+2)*5,chatY+14+i*15)
  })
  ctx.globalAlpha=1

  // ── Bottom skill bar ────────────────────────────────────────────────────────
  const skills=[
    {key:'SPACE',icon:'⚔️',label:'Attack',cd:p.atkTimer},
    {key:'Q',icon:'💥',label:'Skill 1',cd:0},
    {key:'E',icon:'🔮',label:'Skill 2',cd:0},
    {key:'R',icon:'🛡',label:'Guard',cd:0},
    {key:'F',icon:'💊',label:'Potion',cd:0},
  ]
  const sbW=skills.length*58+16,sbX=CW/2-sbW/2,sbY=CH-54
  ctx.fillStyle='rgba(20,12,8,0.88)';ctx.fillRect(sbX-4,sbY-4,sbW+8,52)
  ctx.strokeStyle='#8B6020';ctx.lineWidth=1;ctx.strokeRect(sbX-4,sbY-4,sbW+8,52)
  skills.forEach((s,i)=>{
    const sx2=sbX+i*58,sy2=sbY
    const onCd=s.cd>0
    ctx.fillStyle=onCd?'rgba(0,0,0,0.7)':'rgba(40,28,12,0.8)';ctx.fillRect(sx2,sy2,52,44)
    ctx.strokeStyle=onCd?'#555':'#C89030';ctx.lineWidth=1;ctx.strokeRect(sx2,sy2,52,44)
    ctx.font='20px monospace';ctx.textAlign='center';ctx.fillStyle=onCd?'#555':'#fff'
    ctx.fillText(s.icon,sx2+26,sy2+26)
    ctx.font='6px monospace';ctx.fillStyle='#C89030';ctx.fillText(s.key,sx2+26,sy2+38)
    if(onCd){
      ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillRect(sx2,sy2,52,Math.round(44*s.cd))
      ctx.fillStyle='#fff';ctx.fillText(s.cd.toFixed(1),sx2+26,sy2+22)
    }
  })
  ctx.textAlign='left'
}

// ── Minimap ────────────────────────────────────────────────────────────────────
function drawMinimap(ctx:CanvasRenderingContext2D,gs:GS){
  const MW=120,MH=80,mx=CW-MW-8,my=CH-MH-8
  const scX=MW/(WW*TILE),scY=MH/(WH*TILE)
  ctx.fillStyle='rgba(20,12,8,0.88)';ctx.fillRect(mx,my,MW,MH)
  for(let ty=0;ty<WH;ty++)for(let tx=0;tx<WW;tx++){
    const t=MAP[ty][tx]
    ctx.fillStyle=t===2?'#4a90d9':t===3||t===5?'#2a6a14':t===4||t===8?'#2a2040':t===1||t===9?'#c8944a':t===7?'#a09060':'#5a9e3a'
    ctx.fillRect(mx+tx*scX*TILE,my+ty*scY*TILE,Math.max(1,scX*TILE),Math.max(1,scY*TILE))
  }
  gs.enemies.forEach(en=>{
    if(en.state==='dead')return
    ctx.fillStyle=en.kind==='dragon'?'#ff2222':en.kind==='skeleton'?'#ddddaa':en.kind==='bat'?'#8844aa':en.kind==='snake'?'#22aa22':'#22cc44'
    ctx.fillRect(mx+en.x*scX-1,my+en.y*scY-1,3,3)
  })
  if(!gs.p.dead){
    ctx.fillStyle='#FFD700'
    ctx.fillRect(mx+gs.p.x*scX-2,my+gs.p.y*scY-2,5,5)
  }
  ctx.strokeStyle='rgba(255,255,255,0.3)';ctx.lineWidth=1
  ctx.strokeRect(mx+gs.camX*scX,my+gs.camY*scY,CW*scX,CH*scY)
  ctx.strokeStyle='#C89030';ctx.lineWidth=1;ctx.strokeRect(mx,my,MW,MH)
  ctx.fillStyle='#C89030';ctx.font='6px monospace';ctx.fillText('MAP',mx+3,my+9)
}

// ── Component ──────────────────────────────────────────────────────────────────
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
      {name:'SYSTEM',text:'Dungeon Portal is in the north!',c:'#cc88ff',age:0.5},
    ],
    keys:new Set(),camX:16*TILE-CW/2,camY:15*TILE-CH/2,
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
      for(let i=0;i<n;i++) gs.parts.push({x,y,vx:(Math.random()-.5)*5,vy:-Math.random()*5-1,c,t:1,s:Math.random()*5+2})
    }

    function doAttack(){
      if(gs.p.atkTimer>0||gs.p.dead)return
      const{p}=gs
      const atk=p.cls==='warrior'?28:p.cls==='mage'?38:p.cls==='rogue'?22:20
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
            p.xp+=en.xp;p.gold+=en.gold
            p.tokens+=en.tok;p.usdt+=en.tok*0.001
            gs.dmg.push({x:en.x,y:en.y-28,v:en.xp,c:'#FFD700',t:1.5})
            while(p.xp>=p.xpNext){
              p.xp-=p.xpNext;p.level++;p.xpNext=Math.floor(p.xpNext*1.65)
              p.maxHp+=25;p.hp=p.maxHp;p.maxMp+=12;p.mp=p.maxMp
              gs.dmg.push({x:p.x+4,y:p.y-24,v:0,c:'#ffffff',t:2.5})
              gs.chat.push({name:'SYSTEM',text:`${p.name} reached Level ${p.level}! 🎉`,c:'#FFD700',age:0})
            }
          }
        }
      }
      p.atkTimer=p.cls==='warrior'?.5:p.cls==='mage'?1.0:p.cls==='rogue'?.3:.65
    }

    function update(dt:number){
      const{p,enemies}=gs;dt=Math.min(dt,.05)
      gs.portalAngle+=dt*2
      if(p.dead){p.respTimer-=dt;if(p.respTimer<=0){p.dead=false;p.hp=p.maxHp;p.mp=Math.floor(p.maxMp*.5);p.x=16*TILE+8;p.y=15*TILE};return}
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
      const nx=p.x+dx,ny=p.y+dy
      if(canMove(nx,p.y,PW,PH))p.x=clamp(nx,TILE*2,(WW-2)*TILE-PW)
      if(canMove(p.x,ny,PW,PH))p.y=clamp(ny,0,(WH-1)*TILE-PH)
      if(p.moving){p.fTimer+=dt;if(p.fTimer>.18){p.fTimer=0;p.frame=(p.frame+1)%2}}else{p.frame=0;p.fTimer=0}

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
          const chaseSpd=en.kind==='dragon'?2.2:en.kind==='bat'?2.8:en.kind==='snake'?1.8:2.0
          const angle=Math.atan2(p.y-en.y,p.x-en.x)
          const edx=Math.cos(angle)*chaseSpd,edy=Math.sin(angle)*chaseSpd
          if(canMove(en.x+edx,en.y,PW,PH))en.x+=edx
          if(canMove(en.x,en.y+edy,PW,PH))en.y+=edy
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
      const{p,enemies,dmg,parts,chat,camX,camY,npcBubble}=gs
      ctx.fillStyle='#0a1008';ctx.fillRect(0,0,CW,CH)

      // Tiles
      const stx=Math.max(0,Math.floor(camX/TILE)),etx=Math.min(WW,Math.ceil((camX+CW)/TILE)+1)
      const sty=Math.max(0,Math.floor(camY/TILE)),ety=Math.min(WH,Math.ceil((camY+CH)/TILE)+1)
      for(let ty=sty;ty<ety;ty++) for(let tx=stx;tx<etx;tx++) drawTile(ctx,MAP[ty][tx],tx*TILE-camX,ty*TILE-camY,ts)

      // Buildings
      for(const b of BUILDINGS) drawBuilding(ctx,b.type,b.tx*TILE-camX,b.ty*TILE-camY,b.tw,b.th,ts)

      // Dungeon portal (at tile 16,2)
      drawPortal(ctx,16*TILE-camX,2*TILE-camY,gs.portalAngle)

      // NPCs
      for(const n of NPCS){
        const sx=n.tx*TILE-camX,sy=n.ty*TILE-camY
        dr(ctx,npcSprite(n.col,Math.floor(ts/400)%2),sx,sy)
        ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(sx-6,sy-18,n.name.length*6+12,14)
        ctx.fillStyle=n.col;ctx.font='8px "Press Start 2P",monospace';ctx.fillText(n.name,sx,sy-7)
      }

      // Enemies
      for(const en of enemies){
        if(en.state==='dead')continue
        const sx=en.x-camX,sy=en.y-camY
        if(sx<-80||sx>CW+80||sy<-80||sy>CH+80)continue
        const sp=en.kind==='slime'?enemySprite('slime',en.frame,ts):en.kind==='skeleton'?enemySprite('skeleton',en.frame,ts):en.kind==='bat'?enemySprite('bat',en.frame,ts):en.kind==='snake'?enemySprite('snake',en.frame,ts):enemySprite('dragon',en.frame,ts)
        dr(ctx,sp,sx,sy)
        // HP bar
        const bw=en.kind==='dragon'?52:en.kind==='bat'?28:36
        const bx=sx+(en.kind==='dragon'?-4:en.kind==='bat'?2:0),by=sy-12
        ctx.fillStyle='#220000';ctx.fillRect(bx,by,bw,6)
        const r=en.hp/en.maxHp
        ctx.fillStyle=r>.5?'#dd2222':r>.25?'#dd8800':'#ff4444'
        ctx.fillRect(bx,by,Math.round(bw*r),6)
        ctx.strokeStyle='#440000';ctx.lineWidth=1;ctx.strokeRect(bx,by,bw,6)
        // Name tag
        ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillRect(bx-2,by-13,bw+4,11)
        ctx.fillStyle=en.kind==='dragon'?'#ff6666':en.kind==='skeleton'?'#e0e0b0':en.kind==='bat'?'#cc88ff':'#88dd88'
        ctx.font='7px monospace';ctx.fillText(`Lv.${en.kind==='dragon'?8:en.kind==='skeleton'?4:en.kind==='bat'?2:3} ${en.kind}`,bx,by-4)
      }

      // Player
      if(!p.dead){
        const sx=p.x-camX,sy=p.y-camY
        if(p.invTimer>0&&Math.floor(p.invTimer*10)%2===0)ctx.globalAlpha=.4
        dr(ctx,playerSprite(p.cls,p.dir,p.frame,ts),sx,sy)
        ctx.globalAlpha=1
        // Name tag
        const nw=p.name.length*6+14
        ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(sx+PW/2-nw/2,sy-20,nw,14)
        ctx.fillStyle='#FFD700';ctx.font='8px "Press Start 2P",monospace';ctx.textAlign='center'
        ctx.fillText(p.name,sx+PW/2,sy-9);ctx.textAlign='left'
        // Lv tag
        ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillRect(sx+PW/2-14,sy-34,28,12)
        ctx.fillStyle='#ff9900';ctx.font='7px monospace';ctx.textAlign='center'
        ctx.fillText(`Lv.${p.level}`,sx+PW/2,sy-24);ctx.textAlign='left'
      }

      // NPC bubble
      if(npcBubble){
        const n=NPCS[npcBubble.idx]
        const bx=n.tx*TILE-camX-50,by=n.ty*TILE-camY-50
        const msg=npcBubble.msg,bw=Math.min(msg.length*6+16,220)
        ctx.fillStyle='rgba(20,12,8,0.92)';ctx.fillRect(bx,by,bw,32)
        ctx.strokeStyle=n.col;ctx.lineWidth=1;ctx.strokeRect(bx,by,bw,32)
        ctx.fillStyle=n.col;ctx.font='7px monospace'
        const words=msg.split(' ');let line='',ly=by+13
        for(const w of words){
          if((line+w).length*6>bw-12){ctx.fillText(line,bx+6,ly);line='';ly+=11}
          line+=(line?' ':'')+w
        }
        ctx.fillText(line,bx+6,ly)
      }

      // Damage numbers
      for(const d of dmg){
        ctx.globalAlpha=Math.min(1,d.t*1.5)
        ctx.fillStyle=d.c
        const text=d.v===0?'LEVEL UP!':d.v<0?`${d.v}`:`-${d.v}`
        const fs=d.v===0?11:d.v>50?14:10
        ctx.font=`bold ${fs}px "Press Start 2P",monospace`
        ctx.fillText(text,d.x-camX,d.y-camY-(1-d.t)*35)
      }
      ctx.globalAlpha=1

      // Particles
      for(const pt of parts){
        ctx.globalAlpha=pt.t;ctx.fillStyle=pt.c
        ctx.fillRect(pt.x-camX,pt.y-camY,pt.s,pt.s)
      }
      ctx.globalAlpha=1

      // HUD
      drawHUD(ctx,gs,ts)
      drawMinimap(ctx,gs)

      // Death overlay
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
    return()=>{
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('keydown',onKey);window.removeEventListener('keyup',onKey)
    }
  },[initGS])

  return(
    <canvas ref={canvasRef} width={CW} height={CH}
      className="block w-full" tabIndex={0}
      style={{imageRendering:'pixelated',cursor:'crosshair',maxWidth:CW}}/>
  )
}
