import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {handler,makeCards,zone} from './server.mjs';
import {cardWidth,cardHeight,playWidth,playHeight,zones} from './public/table-layout.js';
async function request(path,token,data){const req=Readable.from(data===undefined?[]:[JSON.stringify(data)]);req.url='/api/'+path;req.method=data===undefined?'GET':'POST';req.headers={authorization:'Bearer '+token};let output='',status=200;const res={writeHead(s){status=s},write(s){output+=s},end(s=''){output+=s}};await handler(req,res);return{status,body:output.startsWith('data: ')?JSON.parse(output.slice(6)):JSON.parse(output)}}
test('120 cards start aligned and face down with a shuffled order',()=>{const cards=makeCards();assert.equal(cards.length,120);assert.equal(new Set(cards.map(c=>c.id)).size,120);assert(cards.every(c=>c.x===playWidth/2&&c.y===playHeight/2&&c.a===0&&!c.face));assert(cards.some((c,i)=>c.id!==i))});
test('server enforces capacity, privacy, locks, rotation and leave',async()=>{const tokens=[];for(let i=0;i<7;i++)tokens.push((await request('login',null,{name:'플레이어'+i})).body.token);const room=(await request('create',tokens[0],{name:'검증 테이블'})).body.id;for(let i=1;i<6;i++)assert.equal((await request('join',tokens[i],{id:room})).status,200);assert.equal((await request('join',tokens[6],{id:room})).status,400);let s=(await request('events',tokens[0])).body;assert.equal(s.players.length,6);assert.equal(new Set(s.players.map(p=>p.color)).size,6);assert.equal(new Set(s.players.map(p=>p.seat)).size,6);assert(s.cards.every(c=>!c.front));const id=s.cards.at(-1).id;await request('grab',tokens[0],{id});assert.equal((await request('grab',tokens[1],{id})).status,409);await request('move',tokens[0],{id,x:350,y:100,a:45,release:true});assert.equal(zone(350,100),0);s=(await request('events',tokens[0])).body;assert.equal(s.cards.find(c=>c.id===id).front,true);assert.equal(s.cards.find(c=>c.id===id).a,45);assert.equal((await request('events',tokens[1])).body.cards.find(c=>c.id===id).front,false);assert.equal((await request('image?id='+id,tokens[1])).status,403);await request('grab',tokens[0],{id});await request('move',tokens[0],{id,x:playWidth/2,y:playHeight/2,a:90,release:true});assert.equal((await request('events',tokens[0])).body.cards.find(c=>c.id===id).front,false);await request('flip',tokens[0],{id});assert.equal((await request('events',tokens[1])).body.cards.find(c=>c.id===id).front,true);assert.equal((await request('admin',tokens[0],{code:'wrong'})).status,403);assert.equal((await request('admin',tokens[0],{code:'user257'})).status,200);assert.equal((await request('upload',tokens[1],{image:'bad'})).status,403);await request('leave',tokens[0],{});assert.equal((await request('join',tokens[6],{id:room})).status,200);for(const t of tokens)await request('leave',t,{})});

test('bundled cards load through privacy-checked image endpoint',async()=>{
 const fs=await import('node:fs/promises');
 const resources=JSON.parse(await fs.readFile(new URL('./cards/resources.json',import.meta.url),'utf8'));
 assert.equal(resources.faces.length,120);
 assert(resources.faces.every((v,i)=>v===`cards/${String(i+1).padStart(3,'0')}.jpg`));
 const token=(await request('login',null,{name:'리소스 검증'})).body.token;
 await request('create',token,{name:'이미지 테스트'});
 const state=(await request('events',token)).body;
 assert.equal(state.resourceCount,120);
 const id=0;
 assert.equal((await request('image?id='+id,token)).status,403);
 await request('grab',token,{id});
 await request('move',token,{id,x:350,y:100,release:true});
 const req=Readable.from([]);req.url='/api/image?id=0';req.method='GET';req.headers={authorization:'Bearer '+token};
 let status,bytes,headers;
 await handler(req,{writeHead(s,h){status=s;headers=h},end(b){bytes=b}});
 assert.equal(status,200);assert.equal(headers['Content-Type'],'image/jpeg');
 assert(Buffer.isBuffer(bytes));assert.equal(bytes.subarray(0,3).toString('hex'),'ffd8ff');
 await request('leave',token,{});
});

test('each private zone fits six cards across with room for the label', () => {
  assert.equal(zones.length, 6);
  assert.equal(zone(playWidth / 2, playHeight / 2), -1);
  for (const [seat, area] of zones.entries()) {
    const gap = 6;
    const rowWidth = 6 * cardWidth + 5 * gap;
    const inset = (area.w - rowWidth) / 2;
    assert(inset > 0);
    assert(area.h >= cardHeight + 30);
    const y = area.y + area.h - cardHeight / 2 - 5;
    for (let column = 0; column < 6; column++) {
      const left = area.x + inset + column * (cardWidth + gap);
      assert.equal(zone(left, y - cardHeight / 2), seat);
      assert.equal(zone(left + cardWidth, y + cardHeight / 2), seat);
    }
  }
});
