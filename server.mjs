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
export const zones=[{x:260,y:30,w:260,h:150},{x:580,y:30,w:260,h:150},{x:920,y:240,w:150,h:270},{x:580,y:570,w:260,h:150},{x:260,y:570,w:260,h:150},{x:30,y:240,w:150,h:270}];
export function zone(x,y){return zones.findIndex(z=>x>=z.x&&x<=z.x+z.w&&y>=z.y&&y<=z.y+z.h)}
export function makeCards(){return Array.from({length:120},(_,id)=>({id,x:550,y:375,a:0,face:false,z:Math.random(),lock:null,until:0})).sort((a,b)=>a.z-b.z).map((c,z)=>({...c,z}))}
function visible(c,u){const seat=zone(c.x,c.y);return seat>=0?seat===u.seat:c.face}
function view(r,u){return {id:r.id,name:r.name,me:u.id,seat:u.seat,resourceCount:resources.faces.length,players:[...r.players.values()].map(p=>({id:p.id,name:p.name,seat:p.seat,color:p.color,cursor:p.cursor})),cards:r.cards.map(c=>({...c,front:visible(c,u),image:visible(c,u)&&!!resources.faces[c.id],lock:c.until>Date.now()?c.lock:null})),back:!!resources.back,version:resources.version||0}}
function broadcast(r){for(const u of r.players.values())for(const s of u.streams)s.write('data: '+JSON.stringify(view(r,u))+'\n\n')}
function leave(u){if(!u.room)return;const r=rooms.get(u.room);r?.players.delete(u.id);if(r){for(const c of r.cards)if(c.lock===u.id)c.lock=null;broadcast(r)}u.room=null;u.seat=null;u.admin=false}
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
if(path==='/api/create'||path==='/api/join'){let r;if(path==='/api/create'){r={id:randomUUID().slice(0,8),name:String(b.name||'우리들의 테이블').trim().slice(0,30)||'우리들의 테이블',cards:makeCards(),players:new Map(),z:120};rooms.set(r.id,r)}else r=rooms.get(b.id);if(!r)fail('방을 찾을 수 없습니다.');if(r.players.size>=6&&!r.players.has(u.id))fail('방이 가득 찼습니다.');leave(u);const seats=[0,1,2,3,4,5].filter(s=>![...r.players.values()].some(p=>p.seat===s));u.seat=seats[0];u.color=colors.filter(c=>![...r.players.values()].some(p=>p.color===c))[randomInt(seats.length)];u.room=r.id;u.cursor=null;r.players.set(u.id,u);broadcast(r);return json({id:r.id})}
if(path==='/api/leave'){leave(u);return json({ok:true})}const r=rooms.get(u.room);if(!r)fail('방에 참여해주세요.');
if(path==='/api/cursor'){u.cursor={x:Math.max(0,Math.min(1100,Number(b.x)||0)),y:Math.max(0,Math.min(750,Number(b.y)||0))}}
else if(path==='/api/admin'){if(b.code!=='user257')fail('명령을 확인해주세요.',403);u.admin=true;return json({ok:true})}
else if(path==='/api/upload'){if(!u.admin)fail('개발자 인증이 필요합니다.',403);if(!imageOK(b.image))fail('PNG, JPG, WebP 이미지를 선택해주세요.');if(b.back)resources.back=b.image;else{if(resources.faces.length>=120)fail('120장 모두 등록되었습니다.');resources.faces.push(b.image)}resources.version=(resources.version||0)+1;await writeFile(root+'data/resources.json',JSON.stringify(resources));for(const room of rooms.values())broadcast(room);return json({count:resources.faces.length})}
else {const c=r.cards.find(c=>c.id===b.id);if(!c)fail('카드를 찾을 수 없습니다.');if(c.lock&&c.lock!==u.id&&c.until>Date.now())fail('다른 사람이 옮기고 있는 카드입니다.',409);if(path==='/api/grab'){c.lock=u.id;c.until=Date.now()+5000;c.z=++r.z}else if(path==='/api/move'){if(c.lock!==u.id)fail('카드를 먼저 잡아주세요.',409);const prev=zone(c.x,c.y);c.x=Math.max(40,Math.min(1060,Number(b.x)||40));c.y=Math.max(55,Math.min(695,Number(b.y)||55));if(prev!==zone(c.x,c.y))c.face=false;if(Number.isFinite(b.a))c.a=((b.a%360)+360)%360;c.until=Date.now()+5000;if(b.release)c.lock=null}else if(path==='/api/flip'){if(zone(c.x,c.y)<0)c.face=!c.face}else fail('알 수 없는 요청입니다.',404)}broadcast(r);return json({ok:true})}
const file=path==='/'?'index.html':path.slice(1);if(!['index.html','app.js','style.css','cosmos.svg'].includes(file))fail('Not found',404);res.writeHead(200,{'Content-Type':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html; charset=utf-8'});res.end(await readFile(root+'public/'+file));
}catch(e){res.writeHead(e.status||400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}))}};
setInterval(()=>{for(const u of users.values()){for(const s of u.streams)s.write(': ping\n\n');if(Date.now()-u.last>20000)leave(u)}for(const [id,r]of rooms)if(!r.players.size)rooms.delete(id)},5000).unref();
if(process.argv[1]===fileURLToPath(import.meta.url))http.createServer(handler).listen(Number(process.env.PORT)||3000,'0.0.0.0');
