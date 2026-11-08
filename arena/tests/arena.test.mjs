import test from 'node:test';
import assert from 'node:assert/strict';
import {Arena,emptyStore,encryptKey,decryptKey} from '../src/arena.mjs';
import {createMatch,forfeit,step,observation,home} from '../src/engine.mjs';
import {decide,parsePlan} from '../src/providers.mjs';
test('keys are encrypted and cannot be decrypted with another secret',async()=>{const blob=await encryptKey('test-fixture-only','fixture-secret-000000000000000000000');assert.ok(!JSON.stringify(blob).includes('test-fixture'));assert.equal(await decryptKey(blob,'fixture-secret-000000000000000000000'),'test-fixture-only');await assert.rejects(decryptKey(blob,'another'));});
test('real calls are metered even when JSON is invalid',async()=>{
  const s=createMatch({players:[{provider:'openai',model:'fixture'},{provider:'anthropic',model:'fixture'}],kind:'api'});const p=s.players[0];
  const mock=async()=>Response.json({output:[{type:'message',content:[{type:'output_text',text:'broken json'}]}],usage:{input_tokens:300,output_tokens:90,output_tokens_details:{reasoning_tokens:40}}});
  const r=await decide(p,observation(s,p),'fixture',mock);assert.match(r.error,/JSON/);assert.equal(r.stats.inputTokens,300);assert.equal(r.stats.outputTokens,90);assert.equal(r.stats.reasoningTokens,40);
});
test('token reservation blocks a call before any network request',async()=>{
  const s=createMatch({}),p=s.players[0];p.provider='openai';p.model='fixture';p.tokenBudget=2000;
  const r=await decide(p,observation(s,p),'fixture',async()=>{assert.fail('must not call provider');});assert.equal(r.budget,true);
});
test('parse plan rejects executable text, arrays and excessive actions',()=>{
  assert.throws(()=>parsePlan('process.exit()'));assert.throws(()=>parsePlan('[]'));assert.throws(()=>parsePlan(JSON.stringify({actions:Array(9).fill({})})));
  assert.deepEqual(parsePlan('```json\n{"actions":[]}\n```'),{actions:[]});
});
test('progression and lessons are awarded exactly once',()=>{
  const a=new Arena();const s=createMatch({players:[{provider:'openai',model:'a'},{provider:'anthropic',model:'b'}]});a.data.matches[s.id]=s;forfeit(s,s.players[1],'test');step(s,1);a.finalize(s);a.finalize(s);
  const p=a.data.profiles['openai/a'];assert.equal(p.wins,1);assert.equal(p.level,2);assert.equal(p.matches,1);assert.equal(p.lessons.length,1);assert.equal(a.data.profiles['anthropic/b'].losses,1);
});
test('draws do not award levels',()=>{
  const a=new Arena(),s=createMatch({players:[{model:'a'},{model:'b'}]});for(const p of s.players)home(p).hp=0;step(s,1);assert.equal(s.status,'finished');assert.deepEqual(s.winner,[]);a.finalize(s);assert.equal(a.data.profiles['scripted/a'].level,1);assert.equal(a.data.profiles['scripted/a'].draws,1);
});
test('API request has a private observation and reports contain no API key',async()=>{
  const calls=[];const fake=async(url,init)=>{calls.push({url,body:JSON.parse(init.body)});return Response.json({output:[{type:'message',content:[{type:'output_text',text:'{"reason":"Secure food.","actions":[]}'}]}],usage:{input_tokens:200,output_tokens:30}});};
  const arena=new Arena(emptyStore(),'test-encryption-secret-000000000000000',fake);
  const id=await arena.create({kind:'api',players:[{provider:'openai',model:'a',apiKey:'fixture-a'},{provider:'openai',model:'b',apiKey:'fixture-b'}]});
  assert.equal(calls.length,2);const request=JSON.parse(calls[0].body.input);assert.equal(request.state.you,'p1');assert.equal(request.state.intel.some(i=>i.type==='town'),false);
  const report=JSON.stringify(arena.report(id));assert.ok(!report.includes('fixture-a'));assert.ok(!report.includes('fixture-b'));assert.ok(!report.includes('encryption-secret'));assert.equal(arena.data.matches[id].players[0].stats.outputTokens,30);
});
test('three failed API turns forfeit; scripted controller never replaces a model',async()=>{
  const fake=async()=>Response.json({error:'bad key'},{status:401});const a=new Arena(emptyStore(),'test-secret-0000000000000000000000000',fake);
  const id=await a.create({kind:'api',players:[{provider:'openai',model:'a',apiKey:'fixture'},{provider:'openai',model:'b',apiKey:'fixture'}]});
  const s=a.data.matches[id];for(let i=0;i<2;i++){s.elapsed+=s.decisionEvery;await a.turn(s);}assert.equal(s.players[0].alive,false);assert.equal(s.players[0].failures,3);assert.ok(s.decisions.every(d=>d.source==='api'));assert.ok(s.decisions.every(d=>d.actions.length===0));
});
test('connection loss uses an estimated reservation rather than free unmetered retries',async()=>{
  const s=createMatch({players:[{},{}]}),p=s.players[0];p.provider='openai';p.model='fixture';
  const r=await decide(p,observation(s,p),'fixture',async()=>{throw Error('fixture connection failure');});assert.equal(r.stats.usageEstimated,true);assert.ok(r.stats.inputTokens>1000);assert.equal(r.stats.outputTokens,p.maxOutput);assert.match(r.error,/reserved/);
});
test('recovery accounts a pending request and preserves the next turn without replaying it',()=>{
  const s=createMatch({players:[{provider:'openai',model:'fixture'},{model:'b'}]}),p=s.players[0];p.pendingTurn={id:'pending',reserve:5000};p.nextDecision=60;
  const data=emptyStore();data.matches[s.id]=s;const a=new Arena(data,'fixture');assert.equal(p.pendingTurn,undefined);assert.equal(p.stats.inputTokens+p.stats.outputTokens,5000);assert.equal(p.nextDecision,60);assert.equal(p.stats.usageEstimated,true);assert.equal(s.decisions[0].id,'pending');
});
