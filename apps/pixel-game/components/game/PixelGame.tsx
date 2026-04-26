'use client'
// Bright 2D pixel MMORPG — Vox Arena visual style v2 (round trees, cute sprites)

import { useEffect, useRef, useCallback } from 'react'

const TILE = 48
const CW = 960, CH = 580
const WW = 42, WH = 28
const PSPEED = 3.2
const PW = 28, PH = 40

type Tile = 0|1|2|3|4|5|6|7|8
// 0=grass 1=sand 2=water 3=tree(solid) 4=wall(solid) 5=deepgrass 6=flower 7=stone 8=dungeon_floor
const SOLID: Set<Tile> = new Set([2,3,4])

function buildMap(): Tile[][] {
  const m: Tile[][] = Array.from({length:WH}, ()=>Array(WW).fill(0) as Tile[])
  // Water west edge
  for(let y=0;y<WH;y++){m[y][0]=2;m[y][1]=2}
  // Sandy village center
  for(let y=7;y<17;y++) for(let x=7;x<30;x++) m[y][x]=1
  // Crossroads paths
  for(let y=2;y<26;y++){m[y][16]=7;m[y][17]=7}
  for(let x=3;x<39;x++){m[11][x]=7;m[12][x]=7}
  for(let y=7;y<17;y++){m[y][10]=7;m[y][11]=7;m[y][23]=7;m[y][24]=7}
  // Dungeon area NW
  for(let y=0;y<7;y++) for(let x=4;x<14;x++) m[y][x]=8
  for(let y=0;y<7;y++){m[y][3]=4;m[y][14]=4}
  for(let x=3;x<15;x++) m[7][x]=4
  for(let x=7;x<11;x++) m[7][x]=8
  // North forest
  for(let y=0;y<8;y++) for(let x=15;x<WW-4;x++)
    if(m[y][x]===0&&(x*7+y*11)%3<2) m[y][x]=3
  // South forest
  for(let y=18;y<WH;y++) for(let x=2;x<WW-2;x++)
    if(m[y][x]===0&&(x*5+y*7)%4<3) m[y][x]=3
  // East strip
  for(let y=0;y<18;y++) for(let x=WW-5;x<WW-1;x++)
    if((x*3+y*9)%3<2) m[y][x]=3
  // Clear main paths through forest
  for(let y=0;y<WH;y++){if(m[y][16]===3)m[y][16]=0;if(m[y][17]===3)m[y][17]=0}
  // Flowers
  for(let y=3;y<7;y++) for(let x=14;x<26;x++)
    if(m[y][x]===0&&(x*13+y*7)%8===0) m[y][x]=6
  for(let y=14;y<19;y++) for(let x=28;x<WW-5;x++)
    if(m[y][x]===0&&(x*9+y*11)%7===0) m[y][x]=6
  // Lush grass east
  for(let y=14;y<20;y++) for(let x=28;x<WW-5;x++)
    if(m[y][x]===0) m[y][x]=5
  return m
}
const MAP = buildMap()

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
  {tx:8.5,ty:9.5,name:'INNKEEPER',col:'#f0c060',msgs:['Rest here, weary traveler!','Dungeon portal is to the west!','Room costs 5 gold per night.','Heard dragons are restless down south.']},
  {tx:20,ty:8.5,name:'MERCHANT',col:'#60f0c0',msgs:['Best wares in the realm!','$VOX tokens for rare gear!','Dragon scales fetch 500g here.','New stock: +15 STR sword, 300g.']},
  {tx:13.5,ty:8.5,name:'SKILL MASTER',col:'#f08060',msgs:['Learn skills here!','Level 5 unlocks combo attacks.','Press Q,E,R,F for skills!','My training will make you stronger.']},
]
const FAKE_PLAYERS=[
  {name:'Eeyo',c:'#ff9060'},{name:'MageKing',c:'#cc66ff'},{name:'ShadowBlade',c:'#60ff80'},{name:'IronShield',c:'#60d0ff'},{name:'ArrowStorm',c:'#ffcc44'},
]
const FAKE_MSGS=[
  'Anyone want to raid the dungeon? ⚔️','LFG dragon fight!','Just earned 150 $VOX! 💰','WTS rare skeleton sword NFT','Dragon drops 200g — worth it!','Guild recruiting, DM me','Press E near portal to enter dungeon','Lv10 reached, going to boss zone','WASD to move, SPACE to attack!','That bunny nearly one-shot me lol',
]
const BUILDINGS=[
  {tx:7,ty:8,tw:4,th:4,type:'tavern'},
  {tx:20,ty:8,tw:4,th:3,type:'shop'},
  {tx:12,ty:8,tw:4,th:3,type:'blacksmith'},
  {tx:25,ty:9,tw:3,th:3,type:'guild'},
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

// Circle fill helper
function fc(ctx:CanvasRenderingContext2D,x:number,y:number,r:number,color:string){
  ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill()
}

function drawTile(ctx:CanvasRenderingContext2D,t:Tile,sx:number,sy:number,ts:number){
  const T=TILE
  switch(t){
    case 0:{
      ctx.fillStyle='#5aaa38';ctx.fillRect(sx,sy,T,T)
      ctx.fillStyle='#6abb48';ctx.fillRect(sx+4,sy+4,6,4);ctx.fillRect(sx+28,sy+22,5,4)
      ctx.fillStyle='#4a9a28';ctx.fillRect(sx+14,sy+34,4,3);ctx.fillRect(sx+38,sy+12,4,3)
      break}
    case 1:{
      ctx.fillStyle='#d4a255';ctx.fillRect(sx,sy,T,T)
      ctx.fillStyle='#c8943e';ctx.fillRect(sx+8,sy+8,10,5);ctx.fillRect(sx+28,sy+28,8,4)
      ctx.fillStyle='#e0b86a';ctx.fillRect(sx+4,sy+36,6,4);ctx.fillRect(sx+38,sy+14,6,4)
      break}
    case 2:{
      const wave=Math.sin(ts*0.003+(sx+sy)*0.05)*2
      ctx.fillStyle='#4494dd';ctx.fillRect(sx,sy,T,T)
      ctx.fillStyle='#5aa8ee';ctx.fillRect(sx+2,sy+8+wave,T-4,5);ctx.fillRect(sx+2,sy+28+wave,T-4,5)
      ctx.fillStyle='#7ac0ff';ctx.fillRect(sx+8,sy+11+wave,12,3);ctx.fillRect(sx+24,sy+31+wave,12,3)
      break}
    case 3:{
      // Fully round canopy tree
      ctx.fillStyle='rgba(0,0,0,0.18)';ctx.beginPath();ctx.ellipse(sx+T/2,sy+T-2,18,6,0,0,Math.PI*2);ctx.fill()
      ctx.fillStyle='#7a4a1a';ctx.fillRect(sx+20,sy+30,8,18)
      ctx.fillStyle='#5a3410';ctx.fillRect(sx+22,sy+32,3,16)
      fc(ctx,sx+24,sy+22,21,'#1e6810')
      fc(ctx,sx+22,sy+19,18,'#2a8a1a')
      fc(ctx,sx+26,sy+21,16,'#2a8a1a')
      fc(ctx,sx+20,sy+16,13,'#3aaa28')
      fc(ctx,sx+27,sy+18,11,'#3aaa28')
      fc(ctx,sx+18,sy+13,8,'#4abb38')
      fc(ctx,sx+25,sy+12,6,'#5acc44')
      break}
    case 4:{
      ctx.fillStyle='#30284a';ctx.fillRect(sx,sy,T,T)
      ctx.fillStyle='#3c3258';ctx.fillRect(sx+2,sy+2,16,16);ctx.fillRect(sx+20,sy+20,16,16)
      ctx.fillStyle='#241c3a';ctx.fillRect(sx+18,sy,2,T);ctx.fillRect(sx,sy+18,T,2)
      ctx.fillStyle='#4a3e68';ctx.fillRect(sx+4,sy+4,8,8);ctx.fillRect(sx+22,sy+22,8,8)
      break}
    case 5:{
      ctx.fillStyle='#4a8e28';ctx.fillRect(sx,sy,T,T)
      ctx.fillStyle='#5aae38';ctx.fillRect(sx+4,sy+6,5,9);ctx.fillRect(sx+18,sy+24,4,8);ctx.fillRect(sx+34,sy+14,4,8)
      ctx.fillStyle='#3a7e18';ctx.fillRect(sx+10,sy+34,4,4)
      break}
    case 6:{
      ctx.fillStyle='#5aaa38';ctx.fillRect(sx,sy,T,T)
      ctx.fillStyle='#6abb48';ctx.fillRect(sx+4,sy+4,6,4)
      const flowerCols=['#ff6090','#ffdd40','#ff8030','#cc44ff','#ff4444','#40ddff']
      const drawF=(fx:number,fy:number,fc2:string)=>{
        ctx.fillStyle='#5a3a20';ctx.fillRect(sx+fx,sy+fy,2,6)
        ctx.fillStyle=fc2
        ctx.fillRect(sx+fx-2,sy+fy-2,3,3);ctx.fillRect(sx+fx+2,sy+fy-2,3,3)
        ctx.fillRect(sx+fx-2,sy+fy+2,3,3);ctx.fillRect(sx+fx+2,sy+fy+2,3,3)
        ctx.fillStyle='#ffff80';ctx.fillRect(sx+fx,sy+fy,2,2)
      }
      drawF(10,12,flowerCols[(sx*3+sy)%6])
      drawF(28,30,flowerCols[(sx+sy*2)%6])
      drawF(38,8,flowerCols[(sx*2+sy*3)%6])
      break}
    case 7:{
      ctx.fillStyle='#a89860';ctx.fillRect(sx,sy,T,T)
      ctx.fillStyle='#988848';ctx.fillRect(sx,sy,2,T);ctx.fillRect(sx,sy,T,2)
      ctx.fillStyle='#bcac78';ctx.fillRect(sx+4,sy+4,18,18);ctx.fillRect(sx+26,sy+26,16,16)
      ctx.fillStyle='#ccc090';ctx.fillRect(sx+6,sy+6,8,8);ctx.fillRect(sx+28,sy+28,7,7)
      break}
    case 8:{
      ctx.fillStyle='#1a1228';ctx.fillRect(sx,sy,T,T)
      ctx.fillStyle='#22183c';ctx.fillRect(sx+2,sy+2,22,22);ctx.fillRect(sx+26,sy+26,18,18)
      ctx.fillStyle='#120c20';ctx.fillRect(sx+24,sy,2,T);ctx.fillRect(sx,sy+24,T,2)
      break}
  }
}

function drawBuilding(ctx:CanvasRenderingContext2D,type:string,sx:number,sy:number,tw:number,th:number,ts:number){
  const w=tw*TILE,h=th*TILE
  ctx.save()
  if(type==='tavern'){
    // Wood plank walls
    ctx.fillStyle='#9b6535';ctx.fillRect(sx,sy,w,h)
    ctx.fillStyle='#7a4a1e';for(let i=0;i<h;i+=10){ctx.fillRect(sx,sy+i,w,2)}
    ctx.fillStyle='#5a3010';for(let i=0;i<w;i+=20){ctx.fillRect(sx+i,sy,2,h)}
    // Sloped roof
    ctx.fillStyle='#8a1a1a';ctx.fillRect(sx-8,sy-20,w+16,22)
    ctx.fillStyle='#aa2828';ctx.fillRect(sx-4,sy-16,w+8,16)
    ctx.fillStyle='#cc3333';for(let i=0;i<w+8;i+=8){ctx.fillRect(sx-4+i,sy-18,6,20)}
    // Windows with glow
    const wg=0.75+Math.sin(ts*0.002)*0.2
    ctx.fillStyle=`rgba(255,200,80,${wg})`;ctx.fillRect(sx+10,sy+14,22,16);ctx.fillRect(sx+w-32,sy+14,22,16)
    ctx.strokeStyle='#5a3010';ctx.lineWidth=2
    ctx.strokeRect(sx+10,sy+14,22,16);ctx.strokeRect(sx+w-32,sy+14,22,16)
    // Window cross
    ctx.fillStyle='#5a3010';ctx.fillRect(sx+21,sy+14,2,16);ctx.fillRect(sx+10,sy+22,22,2)
    ctx.fillStyle='#5a3010';ctx.fillRect(sx+w-21,sy+14,2,16);ctx.fillRect(sx+w-32,sy+22,22,2)
    // Door
    ctx.fillStyle='#4a2808';ctx.fillRect(sx+w/2-14,sy+h-38,28,38)
    ctx.fillStyle='#7a4a18';ctx.fillRect(sx+w/2-12,sy+h-36,24,34)
    ctx.fillStyle='#c8a060';ctx.fillRect(sx+w/2+6,sy+h-20,4,4)
    // Sign
    ctx.fillStyle='#c8a060';ctx.fillRect(sx+w/2-22,sy+8,44,16)
    ctx.fillStyle='#6a3010';ctx.font='bold 7px monospace';ctx.textAlign='center'
    ctx.fillText('TAVERN',sx+w/2,sy+20)
  } else if(type==='blacksmith'){
    ctx.fillStyle='#4a3c38';ctx.fillRect(sx,sy,w,h)
    ctx.fillStyle='#382c28';for(let i=0;i<w;i+=14){ctx.fillRect(sx+i,sy,2,h)}
    // Stone texture
    ctx.fillStyle='#5a4a44';ctx.fillRect(sx+4,sy+4,12,10);ctx.fillRect(sx+22,sy+4,12,10)
    // Roof
    ctx.fillStyle='#4a3a34';ctx.fillRect(sx-4,sy-16,w+8,20)
    ctx.fillStyle='#382828';for(let i=0;i<w+8;i+=10){ctx.fillRect(sx-4+i,sy-16,8,20)}
    // Chimney
    ctx.fillStyle='#5a4a44';ctx.fillRect(sx+w-22,sy-30,18,32)
    const fireCol=['#ff6010','#ff4000','#ff9020'][Math.floor(ts/100)%3]
    ctx.fillStyle=fireCol;ctx.fillRect(sx+w-20,sy-36,14,12)
    ctx.fillStyle='rgba(255,80,0,0.35)';ctx.fillRect(sx+6,sy+h-44,w-12,32)
    // Anvil
    ctx.fillStyle='#606060';ctx.fillRect(sx+16,sy+h-34,w/2-8,26)
    ctx.fillStyle='#484848';ctx.fillRect(sx+20,sy+h-26,w/2-16,18)
    ctx.fillStyle='#5a4a44';ctx.font='bold 7px monospace';ctx.textAlign='center'
    ctx.fillText('FORGE',sx+w/2,sy+18)
  } else if(type==='shop'){
    ctx.fillStyle='#221438';ctx.fillRect(sx,sy,w,h)
    ctx.fillStyle='#2e1a48';for(let i=0;i<w;i+=12){ctx.fillRect(sx+i,sy,2,h)}
    // Roof
    ctx.fillStyle='#3e1a60';ctx.fillRect(sx-4,sy-16,w+8,20)
    // Animated stars
    for(let i=0;i<8;i++){
      const sa=Math.sin(ts*0.004+i)*4,sx2=sx+6+i*11,sy2=sy+6+Math.abs(sa)
      ctx.fillStyle='#ffdd88';ctx.fillRect(sx2,sy2,3,3)
    }
    // Magic window glow
    ctx.fillStyle=`rgba(130,40,255,${0.55+Math.sin(ts*0.003)*0.3})`;ctx.fillRect(sx+8,sy+10,w-16,26)
    ctx.strokeStyle='#aa66ff';ctx.lineWidth=2;ctx.strokeRect(sx+6,sy+8,w-12,30)
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

function drawPortal(ctx:CanvasRenderingContext2D,sx:number,sy:number,angle:number){
  const cx=sx+TILE,cy=sy+TILE*1.5
  // Outer glow
  const grad=ctx.createRadialGradient(cx,cy,10,cx,cy,52)
  grad.addColorStop(0,'rgba(200,80,255,0.95)')
  grad.addColorStop(0.4,'rgba(120,30,220,0.6)')
  grad.addColorStop(1,'rgba(60,0,140,0)')
  ctx.fillStyle=grad;ctx.beginPath();ctx.arc(cx,cy,52,0,Math.PI*2);ctx.fill()
  // Swirling ring particles
  ctx.save();ctx.translate(cx,cy)
  for(let i=0;i<16;i++){
    ctx.rotate(angle+(i*Math.PI/8))
    ctx.fillStyle=`rgba(${160+i*6},${50},255,${0.85-i*0.05})`
    ctx.fillRect(18,-3,16,5)
  }
  ctx.restore()
  // Center orb
  fc(ctx,cx,cy,18,`rgba(210,130,255,${0.7+Math.sin(angle*3)*0.25})`)
  fc(ctx,cx,cy,10,'rgba(240,200,255,0.9)')
  fc(ctx,cx,cy,5,'rgba(255,255,255,0.95)')
  // Label
  ctx.fillStyle='rgba(0,0,0,0.75)';ctx.fillRect(cx-44,cy-64,88,18)
  ctx.fillStyle='#dd99ff';ctx.font='8px "Press Start 2P",monospace';ctx.textAlign='center'
  ctx.fillText('Dungeon Portal',cx,cy-50);ctx.textAlign='left'
}

type R=[number,number,number,number,string]
function dr(ctx:CanvasRenderingContext2D,rs:R[],ox:number,oy:number){
  for(const[x,y,w,h,c]of rs){if(!c||c==='x')continue;ctx.fillStyle=c;ctx.fillRect(ox+x,oy+y,w,h)}
}

function playerSprite(cls:string,dir:Dir,frame:number,_ts:number):R[]{
  const bob=frame===0?0:2
  const sk='#f5c580'
  if(cls==='warrior'){
    const hA='#c89a3a',hB='#8a6020',hC='#e0b455'
    return[
      // Conical hat - signature look
      [12,-14,4,3,hA],[10,-11,8,3,hB],[7,-8,14,3,hA],[4,-5,20,4,hB],[2,-1,24,4,hC],
      [2,3,24,2,'#6a4010'],
      // Face
      [7,5,14,12,sk],
      [9,9,4,4,'#333333'],[17,9,4,4,'#333333'],
      [10,10,2,2,'#ffffff'],[18,10,2,2,'#ffffff'],
      [7,14,4,3,'#ffaaaa'],[19,14,4,3,'#ffaaaa'],
      // Chain mail body
      [4,17,20,14,'#9090a8'],[4,17,20,2,'#7878a0'],
      [0,17,6,12,'#8888a0'],[22,17,6,12,'#8888a0'],
      // Belt
      [4,30,20,3,'#6a4010'],[11,29,6,4,'#c8a030'],
      // Sword
      ...(dir==='right'?[[-3,14,4,20,'#d0d8e0']as R,[-5,14,8,3,'#8a6030']as R]:[[28,14,4,20,'#d0d8e0']as R,[26,14,8,3,'#8a6030']as R]),
      // Legs
      [6,33,8,7+bob,'#3a4a90'],[16,33,8,7-bob,'#3a4a90'],
      [4,38+bob,12,4,'#2a3470'],[14,38-bob,12,4,'#2a3470'],
    ]
  }
  if(cls==='mage'){
    const hC='#5a1a9a'
    return[
      [12,-18,4,4,hC],[10,-14,8,3,'#4a0a8a'],[7,-11,14,3,hC],[4,-8,20,4,'#4a0a8a'],[2,-4,24,5,hC],
      [13,-10,2,2,'#ffdd40'],[17,-10,2,2,'#ffdd40'],
      [0,-1,28,3,'#3a0878'],
      [7,3,14,12,sk],
      [9,7,4,4,'#cc44ff'],[17,7,4,4,'#cc44ff'],[10,8,2,2,'#ffffff'],
      [2,15,24,16,'#7a22dd'],[11,16,6,12,'#9a44ff'],
      [-6,-4,4,36,'#8a5820'],[-9,-12,8,8,'rgba(30,180,255,0.9)'],[-8,-11,6,6,'rgba(120,220,255,0.6)'],
      [7,31,7,7+bob,'#5a16aa'],[16,31,7,7-bob,'#5a16aa'],
      [5,36+bob,10,4,'#3a0880'],[14,36-bob,10,4,'#3a0880'],
    ]
  }
  if(cls==='rogue'){
    return[
      [4,0,20,5,'#1a1a30'],[6,3,16,9,sk],[4,0,20,3,'#2a2a4a'],
      [6,3,6,5,'rgba(0,0,0,0.3)'],
      [9,7,4,4,'#22ee60'],[17,7,4,4,'#22ee60'],[10,8,2,2,'#ffffff'],
      [4,12,20,16,'#1a1a30'],
      [4,27,20,3,'#5a3010'],[10,26,6,4,'#c8a030'],
      [-4,10,4,18,'#c0c8d0'],[-6,10,6,3,'#6a3a10'],
      [28,10,4,18,'#c0c8d0'],[26,10,6,3,'#6a3a10'],
      [6,30,8,8+bob,'#111122'],[16,30,8,8-bob,'#111122'],
      [4,36+bob,12,4,'#080810'],[14,36-bob,12,4,'#080810'],
    ]
  }
  if(cls==='archer'){
    return[
      [4,-2,20,7,'#1a5a20'],[6,4,16,10,sk],[6,-1,16,5,'#226a28'],
      [22,0,3,8,'#f0d030'],
      [9,7,4,4,'#334433'],[17,7,4,4,'#334433'],[10,8,2,2,'#ffffff'],
      [4,14,20,15,'#1a6a24'],
      [4,28,20,3,'#5a3a10'],[10,27,6,4,'#8a5a20'],
      [-8,2,4,34,'#8a5820'],[-7,4,2,28,'#e8e0c0'],
      [26,6,4,18,'#8a5820'],[27,4,2,4,'#c0c0c0'],[29,4,2,4,'#c0c0c0'],
      [6,31,8,7+bob,'#1a4a18'],[16,31,8,7-bob,'#1a4a18'],
      [4,36+bob,12,4,'#5a3010'],[14,36-bob,12,4,'#5a3010'],
    ]
  }
  // knight
  return[
    [4,0,20,5,'#888890'],[3,4,22,10,'#a0a0aa'],[5,6,18,7,'#888890'],
    [7,8,14,5,'rgba(0,0,0,0.7)'],
    [8,10,4,2,'#ff8800'],[16,10,4,2,'#ff8800'],
    [5,15,18,4,'#808088'],
    [2,19,24,14,'#c0c0cc'],[4,19,20,2,'#a0a0aa'],[10,21,8,8,'#888890'],
    [0,16,5,10,'#a0a0b0'],[23,16,5,10,'#a0a0b0'],
    [0,24,6,8,'#888890'],[22,24,6,8,'#888890'],
    ...(dir==='right'?[[-4,15,4,22,'#e0e8f0']as R,[-6,15,8,4,'#6a3010']as R]:[[28,15,4,22,'#e0e8f0']as R,[26,15,8,4,'#6a3010']as R]),
    [5,33,9,8+bob,'#a0a0aa'],[16,33,9,8-bob,'#a0a0aa'],
    [3,39+bob,13,4,'#888890'],[14,39-bob,13,4,'#888890'],
  ]
}

function enemySprite(kind:EnemyKind,frame:number,ts:number):R[]{
  if(kind==='slime'){
    // Cute bunny
    const b=frame===0?0:3
    return[
      [7,0-b,6,14,'#e83838'],[19,0-b,6,14,'#e83838'],
      [9,2-b,3,9,'#ff8888'],[21,2-b,3,9,'#ff8888'],
      [4,10,24,20,'#e83838'],[2,14,28,14,'#e83838'],[6,8,20,4,'#e83838'],
      [4,20,10,8,'#f05050'],[18,20,10,8,'#f05050'],
      [8,14,8,8,'#ffffff'],[16,14,8,8,'#ffffff'],
      [10,15,5,6,'#222222'],[18,15,5,6,'#222222'],
      [11,16,2,2,'#ffffff'],[19,16,2,2,'#ffffff'],
      [6,21,5,3,'#ff9999'],[21,21,5,3,'#ff9999'],
      [12,23,4,3,'#ff6060'],
      [10,26,2,2,'#cc2020'],[14,26,4,2,'#cc2020'],[18,26,2,2,'#cc2020'],
      [3,28+b,10,5,'#e83838'],[19,28+b,10,5,'#e83838'],
      [2,30+b,12,3,'#d02020'],[18,30+b,12,3,'#d02020'],
    ]
  }
  if(kind==='skeleton'){
    const lf=frame===0?2:-2
    return[
      [8,0,16,14,'#ece8d0'],[7,2,18,12,'#e0dcba'],
      [9,4,6,6,'#1a1a1a'],[17,4,6,6,'#1a1a1a'],
      [10,5,4,4,'#dd1111'],[18,5,4,4,'#dd1111'],
      [11,6,2,2,'#ff4444'],[19,6,2,2,'#ff4444'],
      [13,11,3,3,'#1a1a1a'],
      [9,13,4,3,'#ece8d0'],[14,13,4,3,'#ece8d0'],[19,13,4,3,'#ece8d0'],
      [6,15,20,12,'#d8d4bc'],
      [7,16,3,8,'#bbb8a0'],[10,15,3,10,'#bbb8a0'],[14,15,3,10,'#bbb8a0'],[18,15,3,10,'#bbb8a0'],[21,16,3,8,'#bbb8a0'],
      [13,16,6,14,'#d8d4bc'],
      [0,15,7,5,'#d8d4bc'],[25,15,7,5,'#d8d4bc'],
      [-2,19,7,8,'#d8d4bc'],[27,19,7,8,'#d8d4bc'],
      [-3,26,6,7,'#d8d4bc'],[27,26,6,7,'#d8d4bc'],
      [30,10,3,22,'#b0b8c0'],[28,8,6,5,'#888888'],
      [9,27,5,10+lf,'#d8d4bc'],[18,27,5,10-lf,'#d8d4bc'],
      [8,35+lf,7,5,'#d8d4bc'],[17,35-lf,7,5,'#d8d4bc'],
    ]
  }
  if(kind==='bat'){
    // Colorful butterfly
    const flap=frame===0?0:-6
    const cols=['#ff8800','#ffcc00','#ff4488','#cc44ff','#44ccff']
    const ci=Math.floor(ts/600)%cols.length
    const w1=cols[ci],w2=cols[(ci+1)%cols.length]
    return[
      [-16,2+flap,20,18,w1],[-14,4+flap,16,14,w2],
      [-16,18+flap,18,14,w1],[-14,20+flap,14,10,w2],
      [28,2+flap,20,18,w1],[28,4+flap,16,14,w2],
      [30,18+flap,18,14,w1],[30,20+flap,14,10,w2],
      [12,4,8,24,'#3a2050'],[13,2,6,4,'#5a3070'],
      [11,0,10,6,'#5a3070'],
      [12,1,3,3,'#ffff40'],[17,1,3,3,'#ffff40'],
      [12,-5,2,6,'#5a3070'],[13,-7,2,3,'#ff88aa'],
      [18,-5,2,6,'#5a3070'],[19,-7,2,3,'#ff88aa'],
    ]
  }
  if(kind==='snake'){
    // Cute pink snake
    const s=frame===0?0:3
    return[
      [0,18,36,10,'#d04848'],[2,16,32,14,'#e05555'],[4,14,28,16,'#d04848'],
      [8,20,5,6,'#c03030'],[18,20,5,6,'#c03030'],[28,20,5,6,'#c03030'],
      [6,22,24,6,'#f08080'],
      [s,8,16,14,'#d04848'],[s-2,10,20,10,'#e05555'],
      [s+2,10,6,6,'#ffffff'],[s+9,10,6,6,'#ffffff'],
      [s+3,11,4,4,'#222222'],[s+10,11,4,4,'#222222'],
      [s+4,12,2,2,'#ffffff'],[s+11,12,2,2,'#ffffff'],
      [s+5,20,6,3,'#ff3030'],
      [s+3,22,4,2,'#ff3030'],[s+8,22,4,2,'#ff3030'],
      [32,20,10,8,'#c03030'],[38,22,6,5,'#b02020'],
    ]
  }
  // Green dragon (matching reference)
  const wf=frame===0?0:8
  return[
    [-22,0-wf,26,22+wf,'#228844'],[-20,4-wf,20,16+wf,'#33aa55'],
    [38,0-wf,26,22+wf,'#228844'],[40,4-wf,20,16+wf,'#33aa55'],
    [-18,6-wf,3,14,'#1a6630'],[-14,4-wf,3,16,'#1a6630'],[-10,6-wf,3,12,'#1a6630'],
    [41,6-wf,3,14,'#1a6630'],[45,4-wf,3,16,'#1a6630'],[49,6-wf,3,12,'#1a6630'],
    [4,8,32,26,'#33aa44'],[6,4,28,12,'#228838'],
    [10,18,20,14,'#66cc77'],[12,20,16,10,'#88dd99'],
    [8,0,20,12,'#228838'],[7,3,22,10,'#33aa44'],
    [9,3,8,6,'#ffff20'],[21,3,8,6,'#ffff20'],
    [11,4,5,4,'#222222'],[23,4,5,4,'#222222'],
    [12,5,2,2,'#ffffff'],[24,5,2,2,'#ffffff'],
    [10,10,3,2,'#1a6630'],[21,10,3,2,'#1a6630'],
    [14,-8,4,10,'#228838'],[22,-8,4,10,'#228838'],
    [28,26,20,8,'#33aa44'],[42,28,16,6,'#228838'],[54,30,10,4,'#1a6630'],
    [6,30,10,10,'#33aa44'],[20,30,10,10,'#33aa44'],
    [4,38+wf,14,5,'#228838'],[18,38+wf,14,5,'#228838'],
    ...(frame===1?[[-6,8,8,4,'#ff8800']as R,[-10,9,6,3,'#ffcc00']as R,[-4,10,4,3,'#ff4400']as R]:[]),
  ]
}

function npcSprite(col:string,frame:number):R[]{
  const bob=frame===0?0:1,sk='#f5c580'
  return[
    [6,0,16,3,'#4a3020'],[5,3,18,5,'#5a3a28'],
    [7,6,14,12,sk],
    [9,9,4,4,'#333333'],[17,9,4,4,'#333333'],[10,10,2,2,'#ffffff'],
    [4,18,20,14,col],[9,18,10,4,'rgba(255,255,255,0.5)'],
    [0,18,6,12,col],[22,18,6,12,col],
    [0,28,5,4,sk],[23,28,5,4,sk],
    [7,32,6,6+bob,'#3a3a5a'],[15,32,6,6-bob,'#3a3a5a'],
    [5,36+bob,10,4,'#2a2a3a'],[14,36-bob,10,4,'#2a2a3a'],
  ]
}

function drawHUD(ctx:CanvasRenderingContext2D,gs:GS,ts:number){
  const{p}=gs
  const panW=220,panH=130
  ctx.fillStyle='rgba(20,12,8,0.88)';ctx.fillRect(8,8,panW,panH)
  ctx.strokeStyle='#8B6020';ctx.lineWidth=2;ctx.strokeRect(8,8,panW,panH)
  ctx.strokeStyle='#C89030';ctx.lineWidth=1;ctx.strokeRect(10,10,panW-4,panH-4)
  // Portrait box
  ctx.fillStyle='rgba(40,24,12,0.9)';ctx.fillRect(14,14,52,60)
  ctx.strokeStyle='#C89030';ctx.lineWidth=1;ctx.strokeRect(14,14,52,60)
  ctx.save();ctx.translate(14,14);ctx.scale(52/36,60/44)
  dr(ctx,playerSprite(p.cls,'down',Math.floor(ts/300)%2,ts),2,2)
  ctx.restore()
  // Name + class + level
  ctx.fillStyle='#FFD700';ctx.font='8px "Press Start 2P",monospace';ctx.fillText(p.name.slice(0,10),72,26)
  ctx.fillStyle='#C0A060';ctx.font='7px monospace';ctx.fillText(p.cls.toUpperCase(),72,38)
  ctx.fillStyle='#FFD700';ctx.font='7px monospace';ctx.fillText(`Lv.${p.level}`,72,50)
  ctx.fillStyle='#AAA070';ctx.fillText(`⚡ PWR: ${10+p.level*3}`,72,62)
  // HP/MP/XP bars
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
  // Resource bar top-right
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
  // Chat box
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
  const skills=[
    {key:'SPACE',icon:'⚔️',cd:p.atkTimer},{key:'Q',icon:'💥',cd:0},
    {key:'E',icon:'🔮',cd:0},{key:'R',icon:'🛡',cd:0},{key:'F',icon:'💊',cd:0},
  ]
  const sbW=skills.length*58+16,sbX=CW/2-sbW/2,sbY=CH-54
  ctx.fillStyle='rgba(20,12,8,0.88)';ctx.fillRect(sbX-4,sbY-4,sbW+8,52)
  ctx.strokeStyle='#8B6020';ctx.lineWidth=1;ctx.strokeRect(sbX-4,sbY-4,sbW+8,52)
  skills.forEach((s,i)=>{
    const sx2=sbX+i*58,sy2=sbY,onCd=s.cd>0
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

function drawMinimap(ctx:CanvasRenderingContext2D,gs:GS){
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
    ctx.fillStyle=en.kind==='dragon'?'#44ff44':en.kind==='skeleton'?'#ddddaa':en.kind==='bat'?'#ffcc00':en.kind==='snake'?'#ff8888':'#ff4444'
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
      for(let i=0;i<n;i++) gs.parts.push({x,y,vx:(Math.random()-.5)*5,vy:-Math.random()*5-1,c,t:1,s:Math.random()*5+2})
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
            while(p.xp>=p.xpNext){
              p.xp-=p.xpNext;p.level++;p.xpNext=Math.floor(p.xpNext*1.65)
              p.maxHp+=25;p.hp=p.maxHp;p.maxMp+=12;p.mp=p.maxMp
              gs.dmg.push({x:p.x+4,y:p.y-24,v:0,c:'#ffffff',t:2.5})
              gs.chat.push({name:'SYSTEM',text:`${p.name} reached Level ${p.level}! 🎉`,c:'#FFD700',age:0})
            }
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
          const cs=en.kind==='dragon'?2.2:en.kind==='bat'?2.8:en.kind==='snake'?1.8:2.0
          const angle=Math.atan2(p.y-en.y,p.x-en.x)
          const edx=Math.cos(angle)*cs,edy=Math.sin(angle)*cs
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
      const{p,enemies,dmg,parts,camX,camY,npcBubble}=gs
      ctx.fillStyle='#0a1008';ctx.fillRect(0,0,CW,CH)
      // Tiles
      const stx=Math.max(0,Math.floor(camX/TILE)),etx=Math.min(WW,Math.ceil((camX+CW)/TILE)+1)
      const sty=Math.max(0,Math.floor(camY/TILE)),ety=Math.min(WH,Math.ceil((camY+CH)/TILE)+1)
      for(let ty=sty;ty<ety;ty++) for(let tx=stx;tx<etx;tx++) drawTile(ctx,MAP[ty][tx],tx*TILE-camX,ty*TILE-camY,ts)
      // Buildings
      for(const b of BUILDINGS) drawBuilding(ctx,b.type,b.tx*TILE-camX,b.ty*TILE-camY,b.tw,b.th,ts)
      // Portal at tile (9,9)
      drawPortal(ctx,8*TILE-camX,8*TILE-camY,gs.portalAngle)
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
        dr(ctx,enemySprite(en.kind,en.frame,ts),sx,sy)
        const bw=en.kind==='dragon'?52:en.kind==='bat'?36:36
        const bx=sx+(en.kind==='dragon'?-4:0),by=sy-12
        ctx.fillStyle='#220000';ctx.fillRect(bx,by,bw,6)
        const r=en.hp/en.maxHp
        ctx.fillStyle=r>.5?'#dd2222':r>.25?'#dd8800':'#ff4444'
        ctx.fillRect(bx,by,Math.round(bw*r),6)
        ctx.strokeStyle='#440000';ctx.lineWidth=1;ctx.strokeRect(bx,by,bw,6)
        ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillRect(bx-2,by-13,bw+4,11)
        const lvl=en.kind==='dragon'?8:en.kind==='skeleton'?4:en.kind==='bat'?2:3
        ctx.fillStyle=en.kind==='dragon'?'#88ff88':en.kind==='skeleton'?'#e0e0b0':en.kind==='bat'?'#ffcc00':en.kind==='slime'?'#ff8888':'#ff8888'
        ctx.font='7px monospace';ctx.fillText(`Lv.${lvl} ${KIND_NAMES[en.kind]}`,bx,by-4)
      }
      // Player
      if(!p.dead){
        const sx=p.x-camX,sy=p.y-camY
        if(p.invTimer>0&&Math.floor(p.invTimer*10)%2===0)ctx.globalAlpha=.4
        dr(ctx,playerSprite(p.cls,p.dir,p.frame,ts),sx,sy)
        ctx.globalAlpha=1
        const nw=p.name.length*6+14
        ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(sx+PW/2-nw/2,sy-20,nw,14)
        ctx.fillStyle='#FFD700';ctx.font='8px "Press Start 2P",monospace';ctx.textAlign='center'
        ctx.fillText(p.name,sx+PW/2,sy-9);ctx.textAlign='left'
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
