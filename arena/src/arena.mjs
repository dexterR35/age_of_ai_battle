import {createMatch,applyDecision,step,demoPlan,observation,snapshot,home,army,event,forfeit} from './engine.mjs';
import {decide,PROVIDERS,reservationFor} from './providers.mjs';
import {RESOURCES} from './rules.mjs';
export function emptyStore(){return {version:1,matches:{},profiles:{},vault:{}};}
const encoder=new TextEncoder();
function bytes64(bytes){return btoa(String.fromCharCode(...bytes));}
function from64(str){return Uint8Array.from(atob(str),c=>c.charCodeAt(0));}
export async function encryptKey(value,secret){
  const digest=await crypto.subtle.digest('SHA-256',encoder.encode(secret));const k=await crypto.subtle.importKey('raw',digest,'AES-GCM',false,['encrypt']);const iv=crypto.getRandomValues(new Uint8Array(12));const data=await crypto.subtle.encrypt({name:'AES-GCM',iv},k,encoder.encode(value));return {iv:bytes64(iv),data:bytes64(new Uint8Array(data))};
}
export async function decryptKey(obj,secret){const digest=await crypto.subtle.digest('SHA-256',encoder.encode(secret));const k=await crypto.subtle.importKey('raw',digest,'AES-GCM',false,['decrypt']);return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:from64(obj.iv)},k,from64(obj.data)));}
export function safeEqual(a,b){if(typeof a!=='string'||typeof b!=='string')return false;let diff=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0;}
export class Arena {
  constructor(data=emptyStore(),secret='',fetcher=fetch){
    this.data=data;this.secret=secret;this.fetcher=fetcher;this.checkpoint=async()=>{};
    for(const s of Object.values(data.matches)){if(s.status==='running'){s.duration=null;s.roads=s.roads.filter(r=>r.owner!=null);s.terrainRoads=s.roads.map(r=>({x:r.x,y:r.y}));}for(const p of s.players)for(const r of RESOURCES){p.resources[r]??=0;p.gathered[r]??=0;}}
    for(const s of Object.values(data.matches))for(const p of s.players)if(p.pendingTurn){
      const reserve=p.pendingTurn.reserve;p.stats.inputTokens+=Math.max(0,reserve-p.maxOutput);p.stats.outputTokens+=p.maxOutput;p.stats.calls++;p.stats.usageEstimated=true;p.stats.errors++;p.failures++;
      p.stats.cost+=Math.max(0,reserve-p.maxOutput)/1e6*p.inputPrice+p.maxOutput/1e6*p.outputPrice;
      event(s,p,'error',`${p.name}: provider request interrupted by runner restart. Budget reserved; request will not be replayed.`);
      s.decisions.push({id:p.pendingTurn.id,player:p.id,t:Math.round(s.elapsed),source:'api',reason:'Interrupted turn; reserved usage is an estimate.',council:null,actions:[],results:[],usage:{inputTokens:Math.max(0,reserve-p.maxOutput),outputTokens:p.maxOutput,usageEstimated:true},error:'Runner restarted during provider request'});
      delete p.pendingTurn;if(p.failures>=3)forfeit(s,p,'Three consecutive interrupted model turns');
    }
  }
  async create(config){
    if(Object.values(this.data.matches).filter(s=>s.status==='running').length>=4)throw Error('Four matches are already running. Finish or stop one first.');
    if(config.kind==='api'){
      if(this.secret.length<32)throw Error('Configure KEY_ENCRYPTION_SECRET with at least 32 characters on the server');
      if(!Array.isArray(config.players)||config.players.some(p=>!Object.hasOwn(PROVIDERS,p.provider)||!p.model?.trim()||!p.apiKey?.trim()))throw Error('Every API player needs a supported provider, model ID and API key.');
    }
    const s=createMatch(config);
    for(let i=0;i<s.players.length;i++){
      const p=s.players[i];const profile=this.data.profiles[p.profile];p.memory=s.learning?(profile?.lessons||[]).slice(-3):[];
      if(s.kind==='api')this.data.vault[`${s.id}:${p.id}`]=await encryptKey(config.players[i].apiKey,this.secret);
    }
    this.data.matches[s.id]=s;await this.turn(s);return s.id;
  }
  async turn(s){
    if(s.status!=='running')return;
    const due=s.players.filter(p=>p.alive&&p.nextDecision<=s.elapsed);
    if(!due.length)return;
    // Capture everyone's private observation before applying any order in this simultaneous turn.
    const observations=due.map(p=>observation(s,p));
    if(s.kind==='api'){
      for(let i=0;i<due.length;i++){
        const p=due[i],reserve=reservationFor(p,observations[i]);p.nextDecision=s.elapsed+s.decisionEvery;
        if(p.stats.inputTokens+p.stats.outputTokens+reserve<=p.tokenBudget)p.pendingTurn={id:crypto.randomUUID(),reserve,startedAt:Date.now()};
      }
      await this.checkpoint();
    }
    const results=await Promise.all(due.map(async(p,i)=>{
      if(s.kind==='demo')return {plan:demoPlan(s,p),stats:null};
      try{const key=await decryptKey(this.data.vault[`${s.id}:${p.id}`],this.secret);return await decide(p,observations[i],key,this.fetcher);}
      catch(e){return {error:e.name==='TimeoutError'?'Provider timed out after 25 seconds':String(e.message).slice(0,160)};}
    }));
    for(let i=0;i<due.length;i++){
      const p=due[i],r=results[i];p.nextDecision=s.elapsed+s.decisionEvery;
      delete p.pendingTurn;
      if(r.stats){for(const k of ['inputTokens','outputTokens','reasoningTokens','cachedTokens','cost','calls','latency'])p.stats[k]+=r.stats[k]||0;if(r.stats.usageEstimated)p.stats.usageEstimated=true;}
      if(r.budget){p.budgetExhausted=true;p.nextDecision=Number.MAX_SAFE_INTEGER;event(s,p,'budget',`${p.name} reached its token reservation limit. Existing orders continue.`);continue;}
      if(r.error){p.stats.errors++;p.failures++;event(s,p,'error',`${p.name}: ${r.error}`);if(p.failures>=3)forfeit(s,p,'Three consecutive failed model turns');}
      else p.failures=0;
      const result=r.plan?applyDecision(s,p,r.plan):[];
      s.decisions.push({id:`turn-${s.decisions.length+1}`,player:p.id,t:Math.round(s.elapsed),source:s.kind==='demo'?'scripted':'api',reason:r.plan?.reason||r.error||'',council:r.plan?.council||null,actions:r.plan?.actions||[],results:result,usage:r.stats||null,error:r.error||null});
    }
    if(s.kind==='api')await this.checkpoint();
  }
  async tick(dt=2){
    for(const s of Object.values(this.data.matches).filter(s=>s.status==='running')){
      step(s,dt);if(s.status==='running')await this.turn(s);
      if(s.status==='finished')this.finalize(s);
    }
  }
  finalize(s){
    if(s.recorded)return;s.recorded=true;s.lessons=[];
    const isDraw=!s.winner.length;
    // Same model in multiple slots gains at most one progression level per match.
    const grouped=new Map();for(const p of s.players){if(!grouped.has(p.profile))grouped.set(p.profile,[]);grouped.get(p.profile).push(p);}
    const ratings=Object.fromEntries(Object.entries(this.data.profiles).map(([k,v])=>[k,v.elo]));
    for(const [id,slots]of grouped){
      const winner=slots.some(p=>s.winner.includes(p.id)),p=slots[0];
      const pr=this.data.profiles[id]??={id,provider:p.provider,model:p.model,level:1,wins:0,losses:0,draws:0,matches:0,elo:1000,lessons:[],tokens:0,cost:0};
      pr.matches++;pr[winner?'wins':isDraw?'draws':'losses']++;if(winner)pr.level++;
      pr.tokens+=slots.reduce((n,p)=>n+p.stats.inputTokens+p.stats.outputTokens,0);pr.cost+=slots.reduce((n,p)=>n+p.stats.cost,0);
      const foes=s.players.filter(q=>q.profile!==id&&q.team!==p.team);
      if(foes.length){let change=0;for(const q of foes){const expected=1/(1+10**(((ratings[q.profile]||1000)-(ratings[id]||1000))/400));const score=isDraw?.5:winner?1:s.winner.includes(q.id)?0:.5;change+=32*(score-expected)/foes.length;}pr.elo=Math.round(pr.elo+change);}
      const losses=slots.reduce((a,p)=>a+p.stats.lost,0),kills=slots.reduce((a,p)=>a+p.stats.kills,0);
      const lesson={match:s.id,result:winner?'win':isDraw?'draw':'loss',text:`${winner?'Conquest win':isDraw?'Mutual elimination draw':'Defeat'} at ${Math.round(s.elapsed/60)}m. Town L${p.level}; army ${army(p).length}; kills/losses ${kills}/${losses}. ${p.resources.food<50?'Food reserve was depleted. ':''}${p.stats.rejected>p.stats.accepted?'Many orders failed prerequisites; check costs before issuing. ':''}${!Object.values(p.intel).some(x=>x.type==='town')?'No enemy town was discovered; scouting was insufficient. ':''}Last plan: ${p.reason}`.slice(0,550),at:new Date().toISOString()};
      pr.lessons.push(lesson);s.lessons.push(lesson);pr.lessons=pr.lessons.slice(-12);
    }
    for(const p of s.players)delete this.data.vault[`${s.id}:${p.id}`];
  }
  list(){return Object.values(this.data.matches).map(s=>({id:s.id,name:s.name,kind:s.kind,mode:s.mode,status:s.status,elapsed:s.elapsed,duration:s.duration,createdAt:s.createdAt,winner:s.winner,players:s.players.map(p=>({id:p.id,name:p.name,color:p.color,model:p.model}))})).reverse();}
  report(id){const s=this.data.matches[id];if(!s)throw Error('Match not found');return {version:1,match:{id:s.id,name:s.name,kind:s.kind,status:s.status,outcome:s.outcome,result:s.result,winner:s.winner,elapsed:s.elapsed,duration:s.duration,seed:s.seed,mapId:s.mapId,size:s.size},players:s.players.map(p=>({id:p.id,name:p.name,provider:p.provider,model:p.model,level:p.level,stats:p.stats,gathered:p.gathered,spent:p.spent||{},stock:p.resources,tech:p.tech,government:p.government,defeatReason:p.defeatReason||null})),timeline:s.history,events:s.events,decisions:s.decisions,lessons:s.lessons||[]};}
  async api(request){
    const url=new URL(request.url),path=url.pathname,method=request.method;
    const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
    if(path==='/api/health')return json({ok:true,runner:'autonomous',providers:Object.entries(PROVIDERS).map(([id,p])=>({id,name:p.name})),encryptionReady:this.secret.length>=32});
    if(path==='/api/matches'&&method==='GET')return json(this.list());
    if(path==='/api/profiles'&&method==='GET')return json(Object.values(this.data.profiles));
    if(path==='/api/matches'&&method==='POST')return json({id:await this.create(await request.json())},201);
    const m=path.match(/^\/api\/matches\/([^/]+)(?:\/(report|control))?$/);
    if(m){const s=this.data.matches[m[1]];if(!s)return json({error:'Match not found'},404);
      if(m[2]==='report'&&method==='GET')return json(this.report(s.id));
      if(m[2]==='control'&&method==='POST'){
        const {action}=await request.json();if(action==='stop'&&s.status==='running'){s.status='stopped';s.result='Stopped by operator';for(const p of s.players)delete this.data.vault[`${s.id}:${p.id}`];event(s,null,'stop','Match stopped by operator. No progression awarded.');}
        else throw Error('Only an active match can be stopped.');return json({ok:true});
      }
      if(method==='GET')return json(snapshot(s,url.searchParams.get('pov')||'all'));
    }
    return json({error:'Endpoint not found'},404);
  }
}
