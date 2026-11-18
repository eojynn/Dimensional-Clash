import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {handler,makeCards,zone} from './server.mjs';
import {playWidth,playHeight,zones} from './public/table-layout.js';
async function request(path,token,data){const req=Readable.from(data===undefined?[]:[JSON.stringify(data)]);req.url='/api/'+path;req.method=data===undefined?'GET':'POST';req.headers={authorization:'Bearer '+token};let output='',status=200;const res={writeHead(s){status=s},write(s){output+=s},end(s=''){output+=s}};await handler(req,res);return{status,body:output.startsWith('data: ')?JSON.parse(output.slice(6)):JSON.parse(output)}}
test('120 cards start aligned and face down with a shuffled order',()=>{const cards=makeCards();assert.equal(cards.length,120);assert.equal(new Set(cards.map(c=>c.id)).size,120);assert(cards.every(c=>c.x===playWidth/2&&c.y===playHeight/2&&c.a===0&&!c.face));assert(cards.some((c,i)=>c.id!==i))});
test('server enforces capacity, privacy, locks, rotation and leave',async()=>{const tokens=[];for(let i=0;i<7;i++)tokens.push((await request('login',null,{name:'플레이어'+i})).body.token);const room=(await request('create',tokens[0],{name:'검증 테이블'})).body.id;for(let i=1;i<6;i++)assert.equal((await request('join',tokens[i],{id:room})).status,200);assert.equal((await request('join',tokens[6],{id:room})).status,400);let s=(await request('events',tokens[0])).body;assert.equal(s.players.length,6);assert.equal(new Set(s.players.map(p=>p.color)).size,6);assert.equal(new Set(s.players.map(p=>p.seat)).size,6);assert(s.cards.every(c=>!c.front));const id=s.cards.at(-1).id;await request('grab',tokens[0],{id});assert.equal((await request('grab',tokens[1],{id})).status,409);await request('move',tokens[0],{id,x:350,y:100,a:45,release:true});assert.equal(zone(350,100),0);s=(await request('events',tokens[0])).body;assert.equal(s.cards.find(c=>c.id===id).front,true);assert.equal(s.cards.find(c=>c.id===id).a,0);assert.equal((await request('events',tokens[1])).body.cards.find(c=>c.id===id).front,false);assert.equal((await request('image?id='+id,tokens[1])).status,403);await request('grab',tokens[0],{id});await request('move',tokens[0],{id,x:playWidth/2,y:playHeight/2,a:90,release:true});assert.equal((await request('events',tokens[0])).body.cards.find(c=>c.id===id).front,false);await request('flip',tokens[0],{id});assert.equal((await request('events',tokens[1])).body.cards.find(c=>c.id===id).front,true);assert.equal((await request('admin',tokens[0],{code:'wrong'})).status,403);assert.equal((await request('admin',tokens[0],{code:'user257'})).status,200);assert.equal((await request('upload',tokens[1],{image:'bad'})).status,403);await request('leave',tokens[0],{});assert.equal((await request('join',tokens[6],{id:room})).status,200);for(const t of tokens)await request('leave',t,{})});

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

test('private zones fit inside the board without overlapping', () => {
  assert.equal(zones.length, 6);
  assert.equal(zone(playWidth / 2, playHeight / 2), -1);
  for (const [seat, area] of zones.entries()) {
    assert(area.x >= 0 && area.x + area.w <= playWidth);
    assert(area.y >= 0 && area.y + area.h <= playHeight);
    assert.equal(zone(area.x + area.w / 2, area.y + area.h / 2), seat);
    for (const other of zones.slice(seat + 1)) {
      assert(
        area.x + area.w < other.x || other.x + other.w < area.x ||
        area.y + area.h < other.y || other.y + other.h < area.y
      );
    }
  }
});

test('players share a folded rulebook, its movement, and its open state', async () => {
  const first = (await request('login', null, {name: '룰북 1'})).body.token;
  const second = (await request('login', null, {name: '룰북 2'})).body.token;
  const { id } = (await request('create', first, {name: '룰북 테스트'})).body;
  await request('join', second, {id});
  const read = async token => (await request('events', token)).body.rulebook;
  const action = (token, command, position) => request('rulebook', token, {action: command, ...position});
  assert.equal((await read(first)).open, false);
  assert.deepEqual(await read(first), await read(second));
  assert.equal((await action(first, 'open')).status, 409);
  assert.equal((await action(first, 'grab')).status, 200);
  assert.equal((await action(second, 'grab')).status, 409);
  assert.equal((await action(first, 'move', {x: 430, y: 330})).status, 200);
  assert.equal((await read(second)).x, 430);
  assert.equal((await action(first, 'open')).status, 200);
  assert.equal((await read(second)).open, true);
  assert.equal((await action(first, 'release')).status, 200);
  assert.deepEqual(await read(second), {x: 430, y: 330, open: false, holder: null});
  await action(second, 'grab');
  await action(second, 'open');
  await request('leave', second, {});
  assert.deepEqual(await read(first), {x: 430, y: 330, open: false, holder: null});
  await request('leave', first, {});
});

test('turn dial starts at ten, moves and rotates for everyone, and stays set after release', async () => {
  const first = (await request('login', null, {name: '돌림판 1'})).body.token;
  const second = (await request('login', null, {name: '돌림판 2'})).body.token;
  const { id } = (await request('create', first, {name: '돌림판 테스트'})).body;
  await request('join', second, {id});
  const read = async token => (await request('events', token)).body.turnDial;
  const action = (token, command, data) => request('turn-dial', token, {action: command, ...data});
  assert.deepEqual(await read(first), await read(second));
  assert.equal((await read(first)).turn, 10);
  assert.equal((await action(first, 'grab')).status, 200);
  assert.equal((await action(first, 'rotate', {turn: 9})).status, 409);
  assert.equal((await action(first, 'move', {x: 700, y: 340})).status, 200);
  assert.equal((await read(second)).x, 700);
  assert.equal((await action(first, 'open')).status, 200);
  assert.equal((await action(second, 'rotate', {turn: 8})).status, 409);
  assert.equal((await action(first, 'rotate', {turn: -1})).status, 400);
  assert.equal((await action(first, 'rotate', {turn: 9})).status, 200);
  assert.equal((await read(second)).turn, 9);
  assert.equal((await action(first, 'release', {turn: 8})).status, 200);
  assert.deepEqual(await read(second), {x: 700, y: 340, open: false, holder: null, turn: 8});
  await request('leave', second, {});
  await request('leave', first, {});
});

test('reset shuffles the shared table and rejects actions from the previous round', async () => {
  const first = (await request('login', null, {name: '초기화 1'})).body.token;
  const second = (await request('login', null, {name: '초기화 2'})).body.token;
  const {id} = (await request('create', first, {name: '초기화 테스트'})).body;
  await request('join', second, {id});
  const read = async token => (await request('events', token)).body;
  const initial = await read(first);
  const {round, cards} = initial;
  const card = {id: cards[0].id, round};
  await request('grab', first, card);
  await request('move', first, {...card, x: 540, y: 250, a: 90, release: true});
  await request('flip', first, card);
  await request('rulebook', first, {action: 'grab', round});
  await request('rulebook', first, {action: 'move', round, x: 430, y: 330});
  await request('rulebook', first, {action: 'open', round});
  await request('turn-dial', second, {action: 'grab', round});
  await request('turn-dial', second, {action: 'open', round});
  await request('turn-dial', second, {action: 'rotate', round, turn: 7});
  assert.equal((await request('reset', second, {})).status, 200);
  const reset = await read(first);
  assert.equal(reset.round, round + 1);
  assert.equal(reset.players.length, 2);
  assert.equal(reset.cards.length, 120);
  assert.notDeepEqual(reset.cards.map(c => c.id), cards.map(c => c.id));
  assert(reset.cards.every(c => c.x === playWidth / 2 && c.y === playHeight / 2 && c.a === 0 && !c.front && !c.lock));
  assert.deepEqual(reset.rulebook, initial.rulebook);
  assert.deepEqual(reset.turnDial, initial.turnDial);
  assert.deepEqual((await read(second)).cards, reset.cards);
  assert.equal((await request('grab', first, card)).status, 409);
  assert.equal((await request('rulebook', first, {action: 'grab', round})).status, 409);
  await request('leave', second, {});
  await request('leave', first, {});
});

test('private hands overlap in two rows and close gaps when a card is removed', async () => {
  const first = (await request('login', null, {name: '정렬 1'})).body.token;
  const second = (await request('login', null, {name: '정렬 2'})).body.token;
  const {id} = (await request('create', first, {name: '정렬 테스트'})).body;
  await request('join', second, {id});
  const getHand = async token => (await request('events', token)).body.cards.filter(card => zone(card.x, card.y) === 0);
  for (let id = 0; id < 11; id++) {
    await request('grab', first, {id});
    await request('move', first, {id, x: 350, y: 100, a: 45, release: true});
  }
  const hand = await getHand(first);
  assert.equal(hand.length, 11);
  assert(hand.every(card => card.front && card.a === 0));
  assert((await getHand(second)).every(card => !card.front));
  const rowHeights = new Set(hand.map(card => card.y));
  assert.equal(rowHeights.size, 2);
  for (const height of rowHeights) {
    const row = hand.filter(card => card.y === height).sort((a, b) => a.x - b.x);
    assert(row[1].x > row[0].x && row[1].x - row[0].x < 108);
  }
  await request('grab', first, {id: 5});
  await request('move', first, {id: 5, x: playWidth / 2, y: playHeight / 2, release: true});
  const remaining = await getHand(first);
  assert.equal(remaining.length, 10);
  assert(remaining.some(card => card.x !== hand.find(old => old.id === card.id).x));
  await request('leave', second, {});
  await request('leave', first, {});
});

test('cards and cursors can reach the expanded table bounds', async () => {
  const token = (await request('login', null, {name: '넓은 테이블'})).body.token;
  await request('create', token, {name: '범위 테스트'});
  const id = 0;
  await request('grab', token, {id});
  await request('move', token, {id, x: 2000, y: 630, release: true});
  await request('cursor', token, {x: 2000, y: 2000});
  const state = (await request('events', token)).body;
  assert.equal(state.cards.find(card => card.id === id).x, playWidth - 54);
  assert.deepEqual(state.players[0].cursor, {x: playWidth, y: playHeight});
  assert(playWidth > 1080 && playHeight > 730);
  await request('leave', token, {});
});

test('valid reactions are shared with the table and limited per sender', async () => {
  const first = (await request('login', null, {name: '이모지 1'})).body.token;
  const second = (await request('login', null, {name: '이모지 2'})).body.token;
  const {id} = (await request('create', first, {name: '이모지 테스트'})).body;
  await request('join', second, {id});
  assert.equal((await request('reaction', first, {kind: 'constructor'})).status, 400);
  assert.equal((await request('reaction', first, {kind: 'tomato'})).status, 200);
  assert.equal((await request('reaction', first, {kind: 'thumbsDown'})).status, 429);
  assert.equal((await request('reaction', second, {kind: 'fireworks'})).status, 200);
  const state = async token => (await request('events', token)).body.reactions;
  const shared = await state(second);
  assert.deepEqual(shared, await state(first));
  assert.deepEqual(shared.map(({id, kind, name}) => [id, kind, name]),
    [[1, 'tomato', '이모지 1'], [2, 'fireworks', '이모지 2']]);
  await request('leave', second, {});
  await request('leave', first, {});
});
