import { playWidth, playHeight, cardWidth, cardHeight, turnDialSize, maxTurns, zones, seatAt } from './public/table-layout.js';
import { reactions } from './public/reactions.js';
import http from 'node:http';
import {randomUUID,randomInt} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
await mkdir(root+'data',{recursive:true});
let resources={faces:[],back:null};
try{resources=JSON.parse(await readFile(root+'cards/resources.json','utf8'))}catch{}
try{resources=JSON.parse(await readFile(root+'data/resources.json','utf8'))}catch{}
const rooms=new Map(),users=new Map();
const colors=['#eea64c','#65b8eb','#ac91f2','#ed829e','#69c8a0','#dfd266'];
export { seatAt as zone };
const zone = seatAt;
export function makeCards(){return Array.from({length:120},(_,id)=>({id,x:playWidth/2,y:playHeight/2,a:0,face:false,z:Math.random(),lock:null,until:0})).sort((a,b)=>a.z-b.z).map((c,z)=>({...c,z}))}
function arrangeHand(room, seat) {
  if (seat < 0) return;
  const area = zones[seat];
  const hand = room.cards.filter(card => !card.lock && zone(card.x, card.y) === seat)
    .sort((first, second) => first.z - second.z);
  if (!hand.length) return;
  const horizontalRoom = area.w - cardWidth - 16;
  const oneRowCapacity = 1 + Math.floor(horizontalRoom / 22);
  const split = hand.length > oneRowCapacity ? Math.ceil(hand.length / 2) : hand.length;
  const rows = [hand.slice(0, split), hand.slice(split)];
  const top = area.y + 21 + cardHeight / 2;
  const bottom = Math.min(playHeight - cardHeight / 2 - 4,
    area.y + Math.max(area.h - cardHeight / 2 - 8, 119));
  for (const [index, row] of rows.entries()) {
    const step = row.length > 1 ? Math.min(36, horizontalRoom / (row.length - 1)) : 0;
    const left = area.x + (area.w - step * (row.length - 1)) / 2;
    row.forEach((card, column) => {
      card.x = left + column * step;
      card.y = index === 0 && rows[1].length === 0 ? (top + bottom) / 2 : index === 0 ? top : bottom;
      card.a = 0;
    });
  }
}

function releaseCard(room, card) {
  const origin = card.grabSeat;
  const destination = zone(card.x, card.y);
  card.lock = null;
  delete card.grabSeat;
  arrangeHand(room, destination);
  if (origin !== undefined && origin !== destination) arrangeHand(room, origin);
}

function visible(c,u){const seat=zone(c.x,c.y);return seat>=0?seat===u.seat:c.face}
const pieceLease = 5000;
const pieceSizes = {rulebook: [96, 64], 'turn-dial': [turnDialSize, turnDialSize]};
function view(r,u){return {id:r.id,name:r.name,me:u.id,seat:u.seat,round:r.round,reactions:r.reactions.filter(event=>event.expires>Date.now()),rulebook:pieceView(r.rulebook),turnDial:pieceView(r.turnDial),resourceCount:resources.faces.length,players:[...r.players.values()].map(p=>({id:p.id,name:p.name,seat:p.seat,color:p.color,cursor:p.cursor})),cards:r.cards.map(c=>({...c,front:visible(c,u),image:visible(c,u)&&!!resources.faces[c.id],lock:c.until>Date.now()?c.lock:null})),back:!!resources.back,version:resources.version||0}}
function broadcast(r){for(const u of r.players.values())for(const s of u.streams)s.write('data: '+JSON.stringify(view(r,u))+'\n\n')}
function leave(u){if(!u.room)return;const r=rooms.get(u.room);r?.players.delete(u.id);if(r){for(const c of r.cards)if(c.lock===u.id)releaseCard(r,c);for(const piece of [r.rulebook,r.turnDial])if(piece.holder===u.id)releasePiece(piece);broadcast(r)}u.room=null;u.seat=null;u.admin=false}
function makePiece(offset, extra = {}) {
  return { x: playWidth / 2 + offset, y: playHeight / 2, open: false, holder: null, expires: 0, ...extra };
}

function resetTable(room) {
  room.round++;
  room.cards = makeCards();
  room.z = room.cards.length;
  room.rulebook = makePiece(-155);
  room.turnDial = makePiece(155, {turn: maxTurns});
}

function pieceView({ expires, ...piece }) {
  return piece;
}

function releasePiece(piece) {
  piece.holder = null;
  piece.open = false;
  piece.expires = 0;
}

function updatePiece(piece, user, request, size) {
  const { action } = request;
  if (piece.expires && piece.expires <= Date.now()) releasePiece(piece);
  if (action === 'grab') {
    if (piece.holder) fail('다른 참가자가 사용 중이에요.', 409);
    piece.holder = user.id;
  } else {
    if (piece.holder !== user.id) fail('먼저 잡아주세요.', 409);
    if (action === 'release') {
      movePiece(piece, request, size);
      if (request.turn !== undefined) setTurn(piece, request.turn);
      releasePiece(piece);
      return;
    }
    if (action === 'move') movePiece(piece, request, size);
    else if (action === 'open') piece.open = true;
    else if (action === 'rotate') setTurn(piece, request.turn);
    else if (action !== 'keep') fail('알 수 없는 테이블 도구 요청입니다.', 400);
  }
  piece.expires = Date.now() + pieceLease;
}

function setTurn(piece, turn) {
  if (!piece.open || piece.turn === undefined) fail('돌림판을 길게 눌러주세요.', 409);
  if (!Number.isInteger(turn) || turn < 0 || turn > maxTurns) fail('남은 턴 수 범위를 확인해주세요.');
  piece.turn = turn;
}

function movePiece(piece, { x, y }, [width, height]) {
  if (piece.open || !Number.isFinite(x) || !Number.isFinite(y)) return;
  piece.x = Math.max(width / 2, Math.min(playWidth - width / 2, x));
  piece.y = Math.max(height / 2, Math.min(playHeight - height / 2, y));
}

function fail(message,status=400){throw Object.assign(new Error(message),{status})}
async function body(req){let b='';for await(const c of req){b+=c;if(b.length>3_000_000)fail('이미지는 2MB 이하로 올려주세요.',413)}return b?JSON.parse(b):{}}
function imageOK(s){return typeof s==='string'&&s.length<2_900_000&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s)}
export const handler=async(req,res)=>{try{const url=new URL(req.url,'http://localhost'),path=url.pathname;const token=req.headers.authorization?.replace('Bearer ','')||url.searchParams.get('token');let u=users.get(token);function json(x,status=200){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(x))}
if(path==='/healthz'&&req.method==='GET')return json({ok:true});
if(path==='/api/login'&&req.method==='POST'){const b=await body(req),name=String(b.name||'').trim().slice(0,16);if(!name)fail('닉네임을 입력해주세요.');const token=randomUUID();u={id:randomUUID(),name,streams:new Set(),last:Date.now()};users.set(token,u);return json({token,name})}
if(path.startsWith('/api/')){if(!u)fail('닉네임을 다시 설정해주세요.',401);u.last=Date.now();if(path==='/api/rooms'&&req.method==='GET')return json([...rooms.values()].map(r=>({id:r.id,name:r.name,count:r.players.size})));
if(path==='/api/events'){if(!u.room)fail('먼저 방에 참여해주세요.');res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});u.streams.add(res);res.write('data: '+JSON.stringify(view(rooms.get(u.room),u))+'\n\n');req.on('close',()=>u.streams.delete(res));return}
if(path==='/api/image'){const r=rooms.get(u.room);if(!r)fail('방에 참여해주세요.',403);let img;if(url.searchParams.get('back'))img=resources.back;else{const c=r.cards.find(c=>c.id===Number(url.searchParams.get('id')));if(!c||!visible(c,u))fail('비공개 카드입니다.',403);img=resources.faces[c.id]}if(!img)fail('이미지가 없습니다.',404);if(img.startsWith('cards/')){if(!/^cards\/[A-Za-z0-9._-]+\.(png|jpe?g|webp)$/.test(img))fail('Invalid asset',400);const ext=img.split('.').pop();res.writeHead(200,{'Content-Type':'image/'+(ext==='jpg'?'jpeg':ext),'Cache-Control':'no-store'});return res.end(await readFile(root+img))}const [head,data]=img.split(',');res.writeHead(200,{'Content-Type':head.slice(5).split(';')[0],'Cache-Control':'no-store'});return res.end(Buffer.from(data,'base64'))}
const b=await body(req);
if(path==='/api/create'||path==='/api/join'){let r;if(path==='/api/create'){r={id:randomUUID().slice(0,8),name:String(b.name||'우리들의 테이블').trim().slice(0,30)||'우리들의 테이블',players:new Map(),round:-1,reactions:[],nextReaction:0};resetTable(r);rooms.set(r.id,r)}else r=rooms.get(b.id);if(!r)fail('방을 찾을 수 없습니다.');if(r.players.size>=6&&!r.players.has(u.id))fail('방이 가득 찼습니다.');leave(u);const seats=[0,1,2,3,4,5].filter(s=>![...r.players.values()].some(p=>p.seat===s));u.seat=seats[0];u.color=colors.filter(c=>![...r.players.values()].some(p=>p.color===c))[randomInt(seats.length)];u.room=r.id;u.cursor=null;r.players.set(u.id,u);broadcast(r);return json({id:r.id})}
if(path==='/api/leave'){leave(u);return json({ok:true})}const r=rooms.get(u.room);if(!r)fail('방에 참여해주세요.');
if(path==='/api/reaction'&&req.method==='POST'){
  if(typeof b.kind!=='string'||!Object.hasOwn(reactions,b.kind))fail('등록된 이모티콘을 선택해주세요.');
  const hasPosition=b.x!==undefined||b.y!==undefined;
  if(hasPosition&&![b.x,b.y].every(value=>Number.isFinite(value)&&value>=0&&value<=1))fail('테이블 안에 놓아주세요.');
  const now=Date.now();
  if(now<(u.nextReactionAt??0))fail('잠시 후 다시 사용해주세요.',429);
  u.nextReactionAt=now+600;
  r.reactions=r.reactions.filter(event=>event.expires>now);
  r.reactions.push({id:++r.nextReaction,kind:b.kind,name:u.name,expires:now+1900,...(hasPosition?{x:b.x,y:b.y}:{})});
  broadcast(r);
  return json({ok:true});
}
if(path==='/api/reset'&&req.method==='POST'){
  resetTable(r);
  broadcast(r);
  return json({ok:true});
}
if(b.round!==undefined&&b.round!==r.round)fail('테이블이 초기화됐어요.',409);
if((path==='/api/rulebook'||path==='/api/turn-dial')&&req.method==='POST'){
  const kind=path.slice(5);
  updatePiece(kind==='rulebook'?r.rulebook:r.turnDial,u,b,pieceSizes[kind]);
  if(b.action!=='keep')broadcast(r);
  return json({ok:true});
}
if(path==='/api/cursor'){u.cursor={x:Math.max(0,Math.min(playWidth,Number(b.x)||0)),y:Math.max(0,Math.min(playHeight,Number(b.y)||0))}}
else if(path==='/api/admin'){if(b.code!=='user257')fail('명령을 확인해주세요.',403);u.admin=true;return json({ok:true})}
else if(path==='/api/upload'){if(!u.admin)fail('개발자 인증이 필요합니다.',403);if(!imageOK(b.image))fail('PNG, JPG, WebP 이미지를 선택해주세요.');if(b.back)resources.back=b.image;else{if(resources.faces.length>=120)fail('120장 모두 등록되었습니다.');resources.faces.push(b.image)}resources.version=(resources.version||0)+1;await writeFile(root+'data/resources.json',JSON.stringify(resources));for(const room of rooms.values())broadcast(room);return json({count:resources.faces.length})}
else {const c=r.cards.find(c=>c.id===b.id);if(!c)fail('카드를 찾을 수 없습니다.');if(c.lock&&c.lock!==u.id&&c.until>Date.now())fail('다른 사람이 옮기고 있는 카드입니다.',409);if(path==='/api/grab'){if(!c.lock||c.until<=Date.now())c.grabSeat=zone(c.x,c.y);c.lock=u.id;c.until=Date.now()+5000;c.z=++r.z}else if(path==='/api/move'){if(c.lock!==u.id)fail('카드를 먼저 잡아주세요.',409);const prev=zone(c.x,c.y);c.x=Math.max(cardWidth/2,Math.min(playWidth-cardWidth/2,Number(b.x)||0));c.y=Math.max(cardHeight/2,Math.min(playHeight-cardHeight/2,Number(b.y)||0));if(prev!==zone(c.x,c.y))c.face=false;if(Number.isFinite(b.a))c.a=((b.a%360)+360)%360;c.until=Date.now()+5000;if(b.release)releaseCard(r,c)}else if(path==='/api/flip'){if(zone(c.x,c.y)<0)c.face=!c.face}else fail('알 수 없는 요청입니다.',404)}broadcast(r);return json({ok:true})}
if((path==='/rulebook.png'||path==='/turn-dial.png')&&req.method==='GET'){
  const image=await readFile(root+'public'+path);
  res.writeHead(200,{'Content-Type':'image/png'});
  return res.end(image);
}
const file=path==='/'?'index.html':path.slice(1);if(!['index.html','app.js','style.css','cosmos.svg','table-layout.js','rulebook.js','reactions.js'].includes(file))fail('Not found',404);res.writeHead(200,{'Content-Type':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html; charset=utf-8'});res.end(await readFile(root+'public/'+file));
}catch(e){res.writeHead(e.status||400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}))}};
setInterval(()=>{for(const u of users.values()){for(const s of u.streams)s.write(': ping\n\n');if(Date.now()-u.last>20000)leave(u)}for(const [id,r]of rooms)if(!r.players.size)rooms.delete(id)},5000).unref();
setInterval(()=>{
  for(const r of rooms.values()) {
    const now = Date.now();
    let changed = false;
    for(const card of r.cards) {
      if(card.lock && card.until <= now) {
        releaseCard(r, card);
        changed = true;
      }
    }
    for(const piece of [r.rulebook,r.turnDial]) {
      if(piece.expires && piece.expires <= now) {
        releasePiece(piece);
        changed = true;
      }
    }
    if(changed)broadcast(r);
  }
},1000).unref();
if(process.argv[1]===fileURLToPath(import.meta.url))http.createServer(handler).listen(Number(process.env.PORT)||3000,'0.0.0.0');
