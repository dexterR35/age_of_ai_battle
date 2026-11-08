import {generateLandscape,groundAt,groundGrid,passable,moveOnTerrain,river} from './terrain.mjs';
import {RESOURCES,COLORS,BUILDINGS,UNITS,TECH,GOVERNMENTS,FORMATIONS,LIMITS,MAPS,DEPARTMENTS,TOWN_REQUIREMENTS,constructionSeconds,scaled,townCost,damage,ageOf} from './rules.mjs';

export const dist = (a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const army = p=>p.units.filter(u=>u.type!=='worker'&&u.type!=='scout'&&u.hp>0);
export const count = (p,type)=>p.buildings.filter(b=>b.type===type&&b.hp>0&&b.remaining<=0).length;
export const home=p=>p.buildings.find(b=>b.type==='town');
export const capacity=p=>Math.min(300,25+count(p,'house')*15+p.level*5);
export const buildingLevel=(p,type)=>Math.max(0,...p.buildings.filter(b=>b.type===type&&b.hp>0&&b.remaining<=0).map(b=>b.level));
export const requirementsMet=(p,requires={})=>Object.entries(requires).every(([type,level])=>buildingLevel(p,type)>=level);
export function rand(s){s.rng^=s.rng<<13;s.rng^=s.rng>>>17;s.rng^=s.rng<<5;return (s.rng>>>0)/4294967296;}
const uid=s=>`e${++s.nextId}`;
export function event(s,p,kind,text){s.events.push({id:uid(s),t:Math.round(s.elapsed),player:p?.id||null,kind,text});}
export function createMatch(config={}){
  const n=Number(config.players?.length||4);
  if(![2,4,6,8].includes(n))throw Error('Choose 2, 4, 6 or 8 players.');
  if(!['ffa','teams','duel'].includes(config.mode||'ffa'))throw Error('Invalid match mode.');
  if(config.mode==='duel'&&n!==2)throw Error('A duel needs two players.');
  const size=[64,96,128,192,256,384,512].includes(Number(config.size))?Number(config.size):n<=2?256:n<=4?384:512;
  const mapId=Object.hasOwn(MAPS,config.mapId)?config.mapId:'riverlands',center=size/2;
  const s={id:config.id||crypto.randomUUID(),name:String(config.name||MAPS[mapId].name).slice(0,60),seed:Math.trunc(config.seed||42671),rng:Math.trunc(config.seed||42671)||1,nextId:0,size,mapId,roads:[],elapsed:0,duration:null,decisionEvery:clamp(Number(config.decisionEvery)||60,30,120),status:'running',kind:config.kind==='api'?'api':'demo',mode:config.mode||'ffa',createdAt:new Date().toISOString(),players:[],nodes:[],events:[],history:[],decisions:[],trades:[],treaties:[],winner:[],result:null,combatAcc:0,historyAcc:0,learning:config.learning!==false};
  const names=['Atlas','Sable','Verdant','Ember','Orion','Tide','Terra','Nova'];
  for(let i=0;i<n;i++){
    const a=(n===8?-Math.PI*.875:-Math.PI*.75)+i*Math.PI*2/n;
    const spawnRadius=size>=128?size*.36:center-11;
    const x=center+Math.cos(a)*spawnRadius,y=center+Math.sin(a)*spawnRadius;
    const cfg=config.players?.[i]||{};
    const p={id:`p${i+1}`,name:String(cfg.name||names[i]).slice(0,35),color:COLORS[i],provider:cfg.provider||'scripted',model:String(cfg.model||'deterministic-v1').slice(0,120),profile:`${cfg.provider||'scripted'}/${cfg.model||'deterministic-v1'}`,team:s.mode==='teams'?Math.floor(i/(n/2)):`p${i+1}`,alive:true,level:1,resources:{food:450,wood:420,stone:240,ore:100,gold:120,metal:0,coins:180},gathered:Object.fromEntries(RESOURCES.map(k=>[k,0])),units:[],buildings:[],departments:{research:2,agriculture:0,industry:0,treasury:0,engineering:0,health:0,diplomacy:0},research:null,upgrading:null,tech:Object.fromEntries(Object.keys(TECH).map(k=>[k,0])),government:'monarchy',formation:'line',stance:'defend',target:null,rally:null,weights:{food:4,wood:3,stone:2,ore:1,gold:1},seen:[],intel:{},memory:[],inbox:[],lastDecision:-999,nextDecision:0,reason:'Establish a food supply and scout the river crossings.',council:{economist:'Secure food and timber.',general:'Scout before committing.',diplomat:'Keep options open.'},stats:{kills:0,lost:0,built:0,damage:0,apm:0,rejected:0,accepted:0,inputTokens:0,outputTokens:0,reasoningTokens:0,cachedTokens:0,cost:0,calls:0,errors:0,latency:0},tokenBudget:clamp(Number(cfg.tokenBudget)||60000,2000,500000),maxOutput:clamp(Number(cfg.maxOutput)||1024,512,4096),inputPrice:clamp(Number(cfg.inputPrice)||0,0,500),outputPrice:clamp(Number(cfg.outputPrice)||0,0,1000),pricingSet:Number(cfg.inputPrice)>0||Number(cfg.outputPrice)>0,failures:0};
    p.buildings.push({id:uid(s),type:'town',x,y,level:1,hp:1800,maxHp:1800,remaining:0,total:0,queue:[]});
    for(let j=0;j<12;j++)p.units.push(newUnit(s,p,'worker',x+(j%4)-1.5,y+Math.floor(j/4)+3));
    p.units.push(newUnit(s,p,'scout',x+2,y+2));
    s.players.push(p);
    // Every spawn gets identical resource deposits, rotated with the spawn.
    for(const [k,r] of [['wood',5.5],['stone',7],['ore',9],['gold',10],['food',5]])for(let j=0;j<(k==='wood'?10:3);j++){
      const off=a+.55+(j/(k==='wood'?10:3))*2.5;
      const pt={x:clamp(x+Math.cos(off)*r,2,size-3),y:clamp(y+Math.sin(off)*r,2,size-3)};
      if(water(pt.x,pt.y,s))pt.x=pt.x<center?center-3:center+3;
      const amount=k==='wood'?180:mapId==='highlands'&&['ore','gold','stone'].includes(k)?5500:4000;
      s.nodes.push({id:uid(s),type:k,...pt,amount,max:amount});
    }
  }
  // Mirrored, gatherable frontier deposits make expansion worth contesting.
  for(let i=0;i<n;i++)for(const ring of [.12,.23,.30]){
    const angle=(n===8?-Math.PI*.875:-Math.PI*.75)+i*Math.PI*2/n;
    const hub={x:center+Math.cos(angle)*size*ring,y:center+Math.sin(angle)*size*ring};
    for(const [j,type]of ['wood','stone','ore','gold'].entries()){
      const pt={x:clamp(hub.x+Math.cos(j*Math.PI/2)*3,2,size-3),y:clamp(hub.y+Math.sin(j*Math.PI/2)*3,2,size-3)};
      if(water(pt.x,pt.y,s))pt.x=pt.x<center?center-3:center+3;
      const amount=type==='wood'?6000:mapId==='highlands'?8250:6000;
      s.nodes.push({id:uid(s),type,...pt,amount,max:amount,zone:'frontier'});
    }
  }
  for(const p of s.players){
    const h=home(p);
    for(const node of s.nodes.filter(n=>dist(n,h)<7&&n.type!=='wood').slice(0,2))layRoad(s,h,node,p.id);
    reveal(s,p);event(s,p,'start',`${p.name} founded a settlement.`);
  }
  generateLandscape(s);
  return s;
}
function newUnit(s,p,type,x,y){return {id:uid(s),type,x,y,hp:UNITS[type].hp,maxHp:UNITS[type].hp,kills:0,carry:0,resource:null,node:null,returning:false,job:'idle',cooldown:0,goal:null};}
export const enemies=(s,p)=>s.players.filter(q=>q.alive&&q.team!==p.team);
function visible(s,p,obj){return p.buildings.some(b=>b.hp>0&&b.remaining<=0&&dist(b,obj)<(b.type==='tower'?12:9))||p.units.some(u=>u.hp>0&&dist(u,obj)<UNITS[u.type].sight);}
function reveal(s,p){
  const known=new Set(p.seen);
  for(const entity of [...p.buildings.filter(b=>b.hp>0),...p.units]){
    const r=entity.type==='tower'?12:(UNITS[entity.type]?.sight||9);
    for(let y=Math.max(0,Math.floor(entity.y-r));y<=Math.min(s.size-1,Math.ceil(entity.y+r));y++)for(let x=Math.max(0,Math.floor(entity.x-r));x<=Math.min(s.size-1,Math.ceil(entity.x+r));x++)if((x-entity.x)**2+(y-entity.y)**2<=r*r)known.add(y*s.size+x);
  }
  p.seen=[...known];
  for(const q of enemies(s,p)){
    const bs=q.buildings.filter(b=>b.hp>0&&visible(s,p,b));
    const us=q.units.filter(u=>u.hp>0&&visible(s,p,u));
    for(const b of bs)p.intel[b.id]={id:b.id,owner:q.id,type:b.type,x:b.x,y:b.y,hp:Math.round(b.hp),level:b.level,lastSeen:Math.round(s.elapsed)};
    // Live unit counts never persist as current intel once vision is lost.
    p.intel[`army:${q.id}`]={owner:q.id,visible:us.reduce((a,u)=>(a[u.type]=(a[u.type]||0)+1,a),{}),lastSeen:Math.round(s.elapsed)};
    for(const b of Object.values(p.intel).filter(b=>b.owner===q.id&&b.type))if(visible(s,p,b)&&!q.buildings.some(x=>x.id===b.id&&x.hp>0))delete p.intel[b.id];
  }
}
function sampleTerrain(s,p,known){const h=home(p),tiles=[];for(let y=Math.max(1,Math.floor(h.y)-24);y<Math.min(s.size-1,h.y+24);y+=4)for(let x=Math.max(1,Math.floor(h.x)-24);x<Math.min(s.size-1,h.x+24);x+=4)if(known.has(y*s.size+x)&&groundAt(s,x,y)>0)tiles.push([x,y,groundAt(s,x,y)]);return tiles.slice(0,32);}
export function observation(s,p){
  const known=new Set(p.seen);
  return {you:p.id,match:{elapsed:Math.round(s.elapsed),limit:s.duration,peaceUntil:180,mode:s.mode,size:s.size,map:s.mapId},roster:s.players.map(q=>({id:q.id,name:q.name,team:q.team,alive:q.alive})),self:{level:p.level,stock:Object.fromEntries(RESOURCES.map(k=>[k,Math.floor(p.resources[k])])),population:p.units.length,capacity:capacity(p),army:army(p).reduce((o,u)=>(o[u.type]=(o[u.type]||0)+1,o),{}),workers:p.units.filter(u=>u.type==='worker').length,buildings:p.buildings.filter(b=>b.hp>0).map(b=>({id:b.id,type:b.type,level:b.level,hp:Math.round(b.hp),remaining:Math.ceil(b.remaining),queue:b.queue.map(x=>x.type)})),tech:p.tech,research:p.research,upgrading:p.upgrading,government:p.government,departments:departmentStatus(p),stance:p.stance,formation:p.formation,squadOrders:p.squadOrders||{},armyCenter:army(p).length?{x:Math.round(army(p).reduce((v,u)=>v+u.x,0)/army(p).length),y:Math.round(army(p).reduce((v,u)=>v+u.y,0)/army(p).length)}:null},intel:Object.values(p.intel),ruins:(s.ruins||[]).filter(r=>known.has(Math.floor(r.y)*s.size+Math.floor(r.x))).map(r=>({id:r.id,x:r.x,y:r.y,claimed:!!r.claimedBy})),terrain:{rules:'Water and live trees block movement; hills slow movement and give 10% high-ground attack. Cut trees to open routes.',nearby:sampleTerrain(s,p,known)},nodes:s.nodes.filter(n=>n.amount>0&&known.has(Math.floor(n.y)*s.size+Math.floor(n.x))).sort((a,b)=>dist(home(p),a)-dist(home(p),b)).slice(0,48).map(n=>({id:n.id,type:n.type,x:Math.round(n.x),y:Math.round(n.y),amount:Math.floor(n.amount)})),inbox:p.inbox.slice(-5),trades:s.trades.filter(t=>t.status==='pending'&&(t.to===p.id||t.from===p.id)),treaties:s.treaties.filter(t=>t.until>s.elapsed&&(t.a===p.id||t.b===p.id)),lessons:p.memory.slice(-3),recent:s.events.filter(e=>e.player===p.id).slice(-6).map(({t,kind,text})=>({t,kind,text})),lastPlan:p.reason};
}
function pay(p,cost){if(Object.entries(cost).some(([k,v])=>!RESOURCES.includes(k)||!Number.isFinite(v)||v<0||p.resources[k]<v))return false;p.spent??={};for(const [k,v] of Object.entries(cost)){p.resources[k]-=v;p.spent[k]=(p.spent[k]||0)+v;}return true;}
const roadCaches=new WeakMap();
function roadSet(s){let c=roadCaches.get(s);if(!c||c.length!==s.roads.length){c={length:s.roads.length,set:new Set(s.roads.map(r=>r.y*s.size+r.x))};roadCaches.set(s,c);}return c.set;}
function layRoad(s,from,to,owner){
  const length=Math.ceil(dist(from,to));const known=roadSet(s);let added=0;
  for(let i=0;i<=length;i++){const t=length?i/length:0,x=Math.round(from.x+(to.x-from.x)*t),y=Math.round(from.y+(to.y-from.y)*t),id=y*s.size+x;
    if(x<1||y<1||x>=s.size-1||y>=s.size-1||water(x,y,s)||known.has(id)||(s.landforms&&!passable(s,x+.5,y+.5)))continue;
    s.roads.push({x,y,owner});known.add(id);added++;
  }
  return added;
}
function anchors(p){return p.buildings.filter(b=>b.hp>0&&b.remaining<=0&&['town','outpost','depot'].includes(b.type));}
function validSite(s,p,pt,type){return groundAt(s,pt.x,pt.y)<2&&Array.from({length:9},(_,i)=>({x:pt.x+((i%3)-1)*footprint(type),y:pt.y+(Math.floor(i/3)-1)*footprint(type)})).every(v=>groundAt(s,v.x,v.y)<2)&&pt.x>=2&&pt.y>=2&&pt.x<s.size-2&&pt.y<s.size-2&&anchors(p).some(b=>dist(b,pt)<=(type==='outpost'?54:b.type==='depot'?28:38))&&!water(pt.x,pt.y,s)&&p.seen.includes(Math.floor(pt.y)*s.size+Math.floor(pt.x))&&!s.players.some(q=>q.buildings.some(b=>b.hp>0&&dist(b,pt)<(footprint(b.type)+footprint(type)+1.2)))&&!s.nodes.some(n=>n.amount>0&&dist(n,pt)<footprint(type)+.5);}
export const footprint=type=>({town:3.8,farm:2.8,house:1.5,barracks:2.8,stable:3,workshop:3.2,range:3,market:2.8,government:2.6,academy:2.6,temple:2.6,keep:3,wonder:4}[type]||2);
function placement(s,p,type){
  // Local forward points toward the battlefield; housing and farms stay behind it.
  const resource={lumbercamp:'wood',quarry:'stone',ironmine:'ore',goldmine:'gold'}[type];
  const military=['barracks','range','stable','workshop','keep','tower','wall','outpost'].includes(type);
  const industry=['forge','refinery','mint','depot'].includes(type);
  const target=type==='house'?{x:-9,y:-8}:type==='farm'||type==='granary'?{x:8,y:-14}:military?{x:0,y:15}:industry?{x:13,y:1}:{x:-11,y:4};
  for(const h of anchors(p)){
    const angle=Math.atan2(s.size/2-h.y,s.size/2-h.x),f={x:Math.cos(angle),y:Math.sin(angle)},r={x:-f.y,y:f.x};
    const candidates=[];
    for(let y=-30;y<=30;y+=6)for(let x=-30;x<=30;x+=6){
      if(Math.abs(x)<3||Math.abs(y)<3)continue; // Reserve two avenues through the settlement.
      const pt={x:h.x+r.x*x+f.x*y,y:h.y+r.y*x+f.y*y};
      if(!validSite(s,p,pt,type))continue;
      const deposits=resource?s.nodes.filter(n=>n.type===resource&&n.amount>0&&p.seen.includes(Math.floor(n.y)*s.size+Math.floor(n.x))):[];
      const score=deposits.length?Math.min(...deposits.map(n=>dist(n,pt))):Math.hypot(x-target.x,y-target.y);
      candidates.push({...pt,score});
    }
    candidates.sort((a,b)=>a.score-b.score);
    if(candidates.length){const {x,y}=candidates[0];return {x,y};}
  }
  // Early buildings use the currently revealed inner plots, retaining physical clearance.
  for(const h of anchors(p))for(let r=6;r<=36;r+=3)for(let i=0;i<24;i++){
    const a=i*Math.PI/12,pt={x:h.x+Math.cos(a)*r,y:h.y+Math.sin(a)*r};
    if(validSite(s,p,pt,type))return pt;
  }
  return null;
}
export function applyDecision(s,p,plan){
  if(!p.alive||s.status!=='running')return [];
  const results=[];
  if(!plan||typeof plan!=='object'||Array.isArray(plan))return [{ok:false,reason:'Invalid plan object'}];
  if(typeof plan.reason==='string')p.reason=plan.reason.slice(0,240);
  for(const role of ['economist','general','diplomat'])if(typeof plan.council?.[role]==='string')p.council[role]=plan.council[role].slice(0,100);
  if(plan.weights&&typeof plan.weights==='object')for(const k of ['food','wood','stone','ore','gold'])if(Number.isFinite(plan.weights[k]))p.weights[k]=clamp(plan.weights[k],.1,10);
  if(FORMATIONS.includes(plan.formation))p.formation=plan.formation;
  for(const action of (Array.isArray(plan.actions)?plan.actions:[]).slice(0,8)){
    let ok=false,why='Invalid action or prerequisites not met';
    if(!action||typeof action!=='object'){results.push({ok:false,reason:why});continue;}
    const type=action.type;
    if(type==='road'){
      const pt={x:Math.round(action.x),y:Math.round(action.y)},h=anchors(p).sort((a,b)=>dist(a,pt)-dist(b,pt))[0]||home(p);
      if(Number.isFinite(pt.x)&&Number.isFinite(pt.y)&&pt.x>=1&&pt.y>=1&&pt.x<s.size-1&&pt.y<s.size-1&&dist(h,pt)<=35&&p.seen.includes(pt.y*s.size+pt.x)){
        const length=Math.ceil(dist(h,pt));if(pay(p,{wood:length*3,stone:length})){layRoad(s,h,pt,p.id);ok=true;event(s,p,'road',`${p.name} extended a supply road.`);}
      }
    }else if(type==='build'){
      const spec=BUILDINGS[action.building];
      const manual=Number.isFinite(action.x)&&Number.isFinite(action.y);
      if(spec&&action.building!=='town'&&p.level>=spec.level&&requirementsMet(p,spec.requires)&&p.buildings.filter(b=>b.type===action.building&&b.hp>0).length<spec.max&&p.buildings.filter(b=>b.remaining>0).length<3){
        const pt=manual?{x:action.x,y:action.y}:placement(s,p,action.building);
        if(pt&&validSite(s,p,pt,action.building)&&pay(p,spec.cost)){const time=constructionSeconds(action.building);p.buildings.push({id:uid(s),type:action.building,...pt,level:1,hp:spec.hp*.25,maxHp:spec.hp,remaining:time,total:time,queue:[]});const anchor=anchors(p).sort((a,b)=>dist(a,pt)-dist(b,pt))[0];if(anchor){const bend={x:pt.x,y:anchor.y};layRoad(s,anchor,bend,p.id);layRoad(s,bend,pt,p.id);}ok=true;event(s,p,'build',`${p.name} started ${spec.name.toLowerCase()}.`);}
        else why='No valid explored building site or insufficient resources';
      }
    }else if(type==='train'){
      const spec=UNITS[action.unit];const qty=clamp(Math.floor(action.count)||1,1,5);
      if(spec&&p.level>=spec.level){
        for(let j=0;j<qty;j++){
          const b=p.buildings.filter(b=>b.hp>0&&b.type===spec.building&&b.remaining<=0&&b.queue.length<5).sort((a,b)=>a.queue.length-b.queue.length)[0];
          const queued=p.buildings.flatMap(b=>b.queue);
          const workerCount=p.units.filter(u=>u.type==='worker').length+queued.filter(u=>u.type==='worker').length;
          const armyCount=army(p).length+queued.filter(u=>!['worker','scout'].includes(u.type)).length;
          if(!b||p.units.length+queued.length>=capacity(p)||(action.unit==='worker'&&workerCount>=100)||(!['worker','scout'].includes(action.unit)&&armyCount>=200)||!pay(p,spec.cost))break;
          b.queue.push({type:action.unit,remaining:spec.time});ok=true;
        }
      }
    }else if(type==='upgrade_town'){
      if(p.level<10&&!p.upgrading&&requirementsMet(p,TOWN_REQUIREMENTS[p.level+1])&&pay(p,townCost(p.level))){const time=Math.round(90*1.45**(p.level-1));p.upgrading={remaining:time,total:time};ok=true;}
    }else if(type==='upgrade_building'){
      const b=p.buildings.find(b=>b.id===action.id&&b.type!=='town'&&b.hp>0&&b.remaining<=0&&b.level<5&&b.level<Math.ceil(p.level/2)&&!b.upgrade);
      if(b&&pay(p,scaled(BUILDINGS[b.type].cost,b.level+1))){const time=constructionSeconds(b.type,b.level+1);b.upgrade={remaining:time,total:time};ok=true;}
    }else if(type==='research'){
      const t=TECH[action.tech];
      if(t&&count(p,t.building)&&requirementsMet(p,t.requires)&&p.tech[action.tech]<t.max&&!p.research&&pay(p,scaled(t.cost,p.tech[action.tech]+1))){const time=t.time*1.45**p.tech[action.tech];p.research={tech:action.tech,remaining:time,total:time};ok=true;}
    }else if(type==='salvage'){
      const ruin=(s.ruins||[]).find(r=>r.id===action.id&&!r.claimedBy&&p.seen.includes(Math.floor(r.y)*s.size+Math.floor(r.x)));
      if(ruin&&p.units.some(u=>u.type==='worker')){if(p.salvage?.id!==ruin.id)p.salvage={id:ruin.id,remaining:30};ok=true;}
    }else if(type==='department'){
      const d=DEPARTMENTS[action.department];const staff=Number(action.staff);
      if(d&&Number.isInteger(staff)&&staff>=0&&staff<=3&&count(p,d.building)&&(action.department==='research'||count(p,'government'))){p.departments??={research:2};p.departments[action.department]=staff;ok=true;}
    }else if(type==='government'){
      if(Object.hasOwn(GOVERNMENTS,action.form)&&count(p,'government')&&s.elapsed-(p.govChanged??-1000)>=300&&pay(p,{coins:100})){p.government=action.form;p.govChanged=s.elapsed;ok=true;event(s,p,'government',`${p.name} adopted ${GOVERNMENTS[action.form].name}.`);}
    }else if(['attack','defend','retreat','scout','raid','move'].includes(type)){
      const squad=action.squad||'main';
      if(!['main','infantry','ranged','cavalry','siege'].includes(squad)){results.push({type,ok:false,reason:'Unknown squad'});p.stats.rejected++;continue;}
      if(type==='move'){
        if(Number.isFinite(action.x)&&Number.isFinite(action.y)&&action.x>=1&&action.y>=1&&action.x<s.size-1&&action.y<s.size-1){
          const order={stance:'move',target:null,rally:{x:action.x,y:action.y}};
          if(squad==='main'){p.stance='move';p.target=null;p.rally=order.rally;p.squadOrders={};}else{p.squadOrders??={};p.squadOrders[squad]=order;}ok=true;
        }
      }else if(type==='defend'||type==='retreat'){
        if(squad==='main'){p.stance=type;p.target=null;p.rally=null;p.squadOrders={};}else{p.squadOrders??={};p.squadOrders[squad]={stance:type,target:null,rally:null};}ok=true;
      }
      else if(type==='scout'){
        const scouts=p.units.filter(u=>u.type==='scout');
        if(scouts.length&&Number.isFinite(action.x)&&Number.isFinite(action.y)){for(const u of scouts)u.goal={x:clamp(action.x,1,s.size-2),y:clamp(action.y,1,s.size-2)};ok=true;}
      }else{
        const intel=Object.values(p.intel).find(b=>b.id===action.target&&b.type);
        const target=s.players.find(q=>q.id===intel?.owner&&q.team!==p.team&&q.alive);
        const treaty=s.treaties.find(t=>t.until>s.elapsed&&[t.a,t.b].includes(p.id)&&[t.a,t.b].includes(target?.id));
        if(intel&&target&&s.elapsed>=180&&army(p).length>=5&&!treaty){
          const order={stance:type,target:intel.id,rally:{x:intel.x,y:intel.y}};
          if(squad==='main'){p.stance=type;p.target=intel.id;p.rally=order.rally;p.squadOrders={};}else{p.squadOrders??={};p.squadOrders[squad]=order;}
          ok=true;event(s,p,'attack',`${p.name} ordered ${type==='raid'?'a raid':'an attack'} on ${target.name}.`);
        }
        else why=treaty?'An active truce blocks this attack':'Scout an enemy building first; attacks need 5 soldiers after 03:00';
      }
    }else if(type==='trade'){
      const target=s.players.find(q=>q.id===action.to&&q.id!==p.id&&q.alive);
      const give=action.give,receive=action.receive;
      const valid=o=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length>0&&Object.keys(o).length<=6&&Object.entries(o).every(([k,v])=>RESOURCES.includes(k)&&Number.isInteger(v)&&v>0&&v<=500);
      if(target&&count(p,'market')&&valid(give)&&valid(receive)&&s.trades.filter(t=>t.from===p.id&&t.status==='pending').length<3){s.trades.push({id:uid(s),from:p.id,to:target.id,give,receive,status:'pending',expires:s.elapsed+180});ok=true;}
    }else if(type==='accept_trade'){
      const t=s.trades.find(t=>t.id===action.id&&t.to===p.id&&t.status==='pending'&&t.expires>s.elapsed);const q=s.players.find(q=>q.id===t?.from&&q.alive);
      if(t&&q&&Object.entries(t.give).every(([k,v])=>q.resources[k]>=v)&&Object.entries(t.receive).every(([k,v])=>p.resources[k]>=v)){pay(q,t.give);pay(p,t.receive);for(const [k,v] of Object.entries(t.give))p.resources[k]+=v;for(const [k,v] of Object.entries(t.receive))q.resources[k]+=v;t.status='completed';ok=true;event(s,p,'trade',`${p.name} completed a trade with ${q.name}.`);}
    }else if(type==='message'||type==='truce'||type==='accept_truce'){
      const q=s.players.find(q=>q.id===action.to&&q.id!==p.id&&q.alive);
      const validAccept=type!=='accept_truce'||p.inbox.some(m=>m.from===q?.id&&m.kind==='truce'&&s.elapsed-m.t<180);
      if(q&&validAccept&&typeof action.text==='string'&&p.lastMessage!==s.elapsed){q.inbox.push({from:p.id,text:action.text.slice(0,160),t:Math.round(s.elapsed),kind:type});q.inbox=q.inbox.slice(-10);p.lastMessage=s.elapsed;ok=true;
        if(type==='accept_truce'&&p.inbox.some(m=>m.from===q.id&&m.kind==='truce'&&s.elapsed-m.t<180)){s.treaties.push({a:p.id,b:q.id,until:s.elapsed+180+(p.departmentPower?.diplomacy||0)*30});event(s,p,'diplomacy',`${p.name} and ${q.name} agreed to a temporary truce.`);}
      }
    }
    p.stats[ok?'accepted':'rejected']++;results.push({type,ok,...(!ok?{reason:why}:{})});
  }
  p.lastDecision=s.elapsed;p.stats.apm=p.stats.accepted/Math.max(1,s.elapsed/60);
  return results;
}
export const water=(x,y,s={size:64,mapId:'riverlands'})=>river(x,y,s);
function walk(u,goal,speed,dt,s){const onRoad=roadSet(s).has(Math.floor(u.y)*s.size+Math.floor(u.x));moveOnTerrain(u,goal,speed*(onRoad?1.2:1),dt,s);}
export function departmentStatus(p){return Object.entries(DEPARTMENTS).map(([id,d])=>{
  const building=id==='research'&&p.research?TECH[p.research.tech].building:d.building;
  const site=p.buildings.find(b=>b.type===building&&b.hp>0&&b.remaining<=0);
  return {id,name:d.name,building,requested:p.departments?.[id]??(id==='research'?2:0),active:p.units.filter(u=>u.type==='worker'&&u.job===`department:${id}`&&site&&u.site===site.id&&dist(u,site)<2.5).length,available:!!site,effect:d.effect};
});}
function workerStep(s,p,u,dt,index,workers){
  const h=home(p),sites=p.buildings.filter(b=>b.hp>0&&(b.remaining>0||b.upgrade));if(p.upgrading)sites.push(h);
  const builders=sites.length?Math.min(workers,Math.max(1,Math.floor(workers*.15))):0;
  if(p.threats?.some(t=>dist(u,t)<5)){u.job='flee';walk(u,h,2.3,dt,s);return;}
  if(index<builders){const site=sites[index%sites.length];u.job='builder';u.site=site.id;walk(u,site,2,dt,s);return;}
  const refineries=p.buildings.filter(b=>b.type==='refinery'&&b.hp>0&&b.remaining<=0);
  if(index>=builders&&index<builders+refineries.length&&p.resources.ore>1&&p.resources.wood>.5){const refinery=refineries[index-builders];u.job='refine';u.site=refinery.id;walk(u,refinery,2,dt,s);return;}
  let staffIndex=builders+refineries.length;
  for(const [id,d]of Object.entries(DEPARTMENTS)){
    if(id==='research'&&!p.research)continue;
    const building=id==='research'?TECH[p.research.tech].building:d.building;
    const site=p.buildings.find(b=>b.type===building&&b.hp>0&&b.remaining<=0);
    if(!site)continue;
    const requested=p.departments?.[id]??(id==='research'?2:0),assigned=Math.min(requested,Math.max(0,Math.floor(workers*.4)-staffIndex));
    if(index>=staffIndex&&index<staffIndex+assigned){u.job=`department:${id}`;u.site=site.id;walk(u,site,2,dt,s);return;}
    staffIndex+=assigned;
  }
  if(p.salvage&&index===staffIndex){const ruin=(s.ruins||[]).find(r=>r.id===p.salvage.id&&!r.claimedBy);if(ruin){u.job='salvage';u.site=ruin.id;walk(u,ruin,2,dt,s);return;}p.salvage=null;}
  const total=Object.values(p.weights).reduce((a,b)=>a+b,0);let v=((index+.5)/workers)*total;let job='food';for(const [k,w]of Object.entries(p.weights)){v-=w;if(v<=0){job=k;break;}}
  if(u.carry>0&&(u.returning||u.resource!==job)){
    const station={wood:'lumbercamp',stone:'quarry',ore:'ironmine',gold:'goldmine',food:'granary'}[u.resource];
    const drop=p.buildings.filter(b=>b.hp>0&&b.remaining<=0&&(['town','depot','outpost',station].includes(b.type))).sort((a,b)=>dist(u,a)-dist(u,b))[0]||h;
    u.returning=true;u.job='deliver';walk(u,drop,UNITS.worker.speed*(1+p.tech.logistics*.1),dt,s);
    if(dist(u,drop)<2){const cap=1200+count(p,'granary')*1600;p.resources[u.resource]=Math.min(cap,p.resources[u.resource]+u.carry);p.gathered[u.resource]+=u.carry;u.carry=0;u.returning=false;u.node=null;}return;
  }
  u.resource=job;u.job=job;
  let node=s.nodes.find(n=>n.id===u.node&&n.amount>0);
  const farms=p.buildings.filter(b=>b.type==='farm'&&b.remaining<=0&&b.hp>0);
  if(job==='food'&&farms.length){const b=farms[index%farms.length];node={...b,id:b.id,amount:Infinity,farm:true};}
  if(!node){node=s.nodes.filter(n=>n.type===job&&n.amount>0&&p.knownTiles.has(Math.floor(n.y)*s.size+Math.floor(n.x))&&(job!=='wood'||[[1,0],[-1,0],[0,1],[0,-1]].some(([x,y])=>passable(s,n.x+x,n.y+y)))).sort((a,b)=>dist(u,a)-dist(u,b))[0];u.node=node?.id;}
  if(!node){u.job='idle';return;}
  walk(u,node,UNITS.worker.speed*(1+p.tech.logistics*.1),dt,s);
  if(dist(u,node)<1.4){
    const base={food:1.35,wood:1.05,stone:.75,ore:.65,gold:.5}[job];
    const depotLevels=p.buildings.filter(b=>b.type==='depot'&&b.hp>0&&b.remaining<=0).reduce((n,b)=>n+b.level,0);
    const station={wood:'lumbercamp',stone:'quarry',ore:'ironmine',gold:'goldmine'}[job],stationLevel=station?buildingLevel(p,station):0;
    const industry=stationLevel?1+stationLevel*.15:['ore','gold'].includes(job)?.25:job==='stone'?.45:1;
    let gain=base*industry*(1+p.tech.tools*.12)*GOVERNMENTS[p.government].gather*(1+depotLevels*.07)*(p.wonderBonus?1.1:1)*(job==='food'?1+p.tech.agriculture*.2:1)*dt;
    if(node.farm)gain*=1.25*(1+(node.level-1)*.1);
    gain*=1+(job==='food'?(p.departmentPower?.agriculture||0):['wood','stone','ore','gold'].includes(job)?(p.departmentPower?.industry||0):0)*.08;gain=Math.min(gain,node.amount,10+p.tech.logistics*4-u.carry);u.carry+=gain;if(!node.farm){node.amount-=gain;if(node.amount<=0&&node.type==='wood'){s.navRevision=(s.navRevision||0)+1;node.felledAt=s.elapsed;}}
    if(u.carry>=10+p.tech.logistics*4-.01||node.amount<=0)u.returning=true;
  }
}
function economy(s,p,dt){
  const h=home(p),workers=p.units.filter(u=>u.type==='worker');
  p.threats=enemies(s,p).filter(q=>!truce(s,p,q)).flatMap(q=>q.units.filter(u=>u.type!=='worker'&&dist(u,h)<17));
  p.knownTiles=new Set(p.seen);
  workers.forEach((u,i)=>workerStep(s,p,u,dt,i,workers.length));
  if(p.salvage){const ruin=(s.ruins||[]).find(r=>r.id===p.salvage.id&&!r.claimedBy);if(!ruin)p.salvage=null;else if(workers.some(u=>u.job==='salvage'&&u.site===ruin.id&&dist(u,ruin)<2)){p.salvage.remaining-=dt;if(p.salvage.remaining<=0){ruin.claimedBy=p.id;p.resources.stone+=ruin.stone;p.resources.gold+=ruin.gold;event(s,p,'salvage',`${p.name} recovered ${ruin.stone} stone and ${ruin.gold} gold from ancient ruins.`);p.salvage=null;}}}
  delete p.knownTiles;p.departmentPower=Object.fromEntries(departmentStatus(p).map(d=>[d.id,d.active]));
  const speedAt=site=>{const builders=workers.filter(u=>u.job==='builder'&&u.site===site.id&&dist(u,site)<2.5).length;return builders**.8/2**.8*GOVERNMENTS[p.government].build*(1+p.tech.tools*.08)*(1+(p.departmentPower.engineering||0)*.1);};
  delete p.threats;
  const upkeep=p.units.length*.012*dt;
  p.resources.food=Math.max(0,p.resources.food-upkeep);
  p.resources.coins=Math.min(6000,p.resources.coins+(workers.length*.055*GOVERNMENTS[p.government].tax*(1+(p.departmentPower.treasury||0)*.08)-army(p).length*.004)*dt);
  if(p.resources.food<=0){for(const u of p.units)u.hp-=.06*dt;}
  if(p.resources.coins<0){p.resources.coins=0;for(const u of army(p))u.hp-=.03*dt;}
  if(count(p,'mint')&&p.resources.gold>dt*.1){p.resources.gold-=dt*.1;p.resources.coins+=dt*.25;}
  for(const refinery of p.buildings.filter(b=>b.type==='refinery'&&b.hp>0&&b.remaining<=0)){
    const staff=workers.filter(u=>u.job==='refine'&&u.site===refinery.id&&dist(u,refinery)<2.5).length;
    if(!staff)continue;const amount=Math.min(.2*refinery.level*dt,p.resources.ore/2,p.resources.wood/.75,1200+count(p,'granary')*1600-p.resources.metal);
    if(amount>0){p.resources.ore-=amount*2;p.resources.wood-=amount*.75;p.resources.metal+=amount;p.manufactured??={metal:0};p.manufactured.metal+=amount;}
  }
  for(const b of p.buildings.filter(b=>b.hp>0)){
    const speed=speedAt(b);
    if(b.remaining>0){b.remaining=Math.max(0,b.remaining-dt*speed);b.hp=b.maxHp*(.25+.75*(1-b.remaining/b.total));if(b.remaining===0){p.stats.built++;event(s,p,'complete',`${p.name} completed ${BUILDINGS[b.type].name.toLowerCase()}.`);}}
    else{
      if(b.upgrade){b.upgrade.remaining-=dt*speed;if(b.upgrade.remaining<=0){b.level++;b.maxHp*=1.25;b.hp=b.maxHp;b.upgrade=null;event(s,p,'upgrade',`${p.name} upgraded ${BUILDINGS[b.type].name.toLowerCase()} to level ${b.level}.`);}}
      if(b.queue[0]){b.queue[0].remaining-=dt*(1+.12*(b.level-1))*GOVERNMENTS[p.government].military;if(b.queue[0].remaining<=0){const t=b.queue.shift().type;p.units.push(newUnit(s,p,t,b.x+(rand(s)-.5)*3,b.y+2));}}
    }
  }
  if(p.upgrading){p.upgrading.remaining-=dt*speedAt(h);if(p.upgrading.remaining<=0){p.level++;h.level=p.level;h.maxHp=1800+(p.level-1)*260;h.hp=Math.min(h.maxHp,h.hp+260);p.upgrading=null;event(s,p,'age',`${p.name} reached town level ${p.level}.`);}}
  if(p.research){p.research.remaining-=dt*(p.departmentPower.research||0)/2*(1+count(p,'library')*.15+count(p,'academy')*.2);if(p.research.remaining<=0){const t=p.research.tech;p.tech[t]++;p.research=null;event(s,p,'research',`${p.name} researched ${TECH[t].name} ${p.tech[t]}.`);}}
}
function truce(s,p,q){return s.elapsed<180||s.treaties.some(t=>t.until>s.elapsed&&[t.a,t.b].includes(p.id)&&[t.a,t.b].includes(q.id));}
function moveArmies(s,p,dt){
  const h=home(p),soldiers=army(p);
  const detected=enemies(s,p).flatMap(q=>q.units.map(u=>({...u,owner:q.id}))).filter(u=>u.type!=='worker'&&visible(s,p,u)&&dist(u,h)<14);
  for(const u of p.units.filter(u=>u.type!=='worker')){
    if(u.type==='scout'){if(u.goal)walk(u,u.goal,UNITS.scout.speed,dt,s);continue;}
    const spec=UNITS[u.type];
    const group=u.type==='knight'?'cavalry':u.type==='archer'?'ranged':u.type==='ram'?'siege':'infantry';
    const order=p.squadOrders?.[group]||{stance:p.stance,rally:p.rally,target:p.target};
    const opponent=enemies(s,p).filter(q=>!truce(s,p,q)).flatMap(q=>q.units).filter(t=>t.hp>0&&dist(u,t)<=spec.range+.3);
    if(opponent.length&&!spec.buildingsOnly)continue;
    let goal=h;
    if(u.hp/u.maxHp<.25){u.job='retreat';goal=h;}
    else if(detected.length&&order.stance!=='attack'){goal=detected.sort((a,b)=>dist(u,a)-dist(u,b))[0];u.job='defend';}
    else if(order.rally&&['attack','raid','move'].includes(order.stance)){
      goal={...order.rally};
      const dx=goal.x-h.x,dy=goal.y-h.y,len=Math.hypot(dx,dy)||1;
      const behind=u.type==='archer'?3:u.type==='ram'?1:0;
      const flank=u.type==='knight'?(Number(u.id.slice(1))%2?3:-3):0;
      goal.x-=dx/len*behind+dy/len*flank;goal.y-=dy/len*behind-dx/len*flank;u.job=order.stance;
    }else{goal={x:h.x+Math.sin(Number(u.id.slice(1)))*4,y:h.y+Math.cos(Number(u.id.slice(1)))*4};u.job='garrison';}
    if(dist(u,h)<6&&(!p.rally||u.hp/u.maxHp<.25))u.hp=Math.min(u.maxHp,u.hp+dt*((count(p,'temple')?.5:.12)+(p.departmentPower?.health||0)*.15));
    walk(u,goal,spec.speed*(p.formation==='defensive'?.85:1),dt,s);
  }
  // Destroyed / disproven targets can be replaced only using this player's observed intel.
  if(p.target&&p.rally&&visible(s,p,p.rally)&&!enemies(s,p).some(q=>q.buildings.some(b=>b.id===p.target&&b.hp>0))){p.rally=null;p.target=null;p.stance='defend';}
  for(const [group,order]of Object.entries(p.squadOrders||{}))if(order.target&&order.rally&&visible(s,p,order.rally)&&!enemies(s,p).some(q=>q.buildings.some(b=>b.id===order.target&&b.hp>0)))delete p.squadOrders[group];
}
function combat(s){
  const hits=[];
  for(const p of s.players.filter(p=>p.alive)){
    const foes=enemies(s,p).filter(q=>!truce(s,p,q));
    for(const u of p.units.filter(u=>u.type!=='worker'&&u.hp>0)){
      const spec=UNITS[u.type];
      const targets=foes.flatMap(q=>[
        ...(!spec.buildingsOnly?q.units.filter(t=>dist(u,t)<=spec.range).map(t=>({t,q,building:false})):[]),
        ...q.buildings.filter(b=>b.hp>0&&dist(u,b)<=spec.range+1).map(t=>({t,q,building:true}))
      ]);
      targets.sort((a,b)=>(a.building?10:0)-(b.building?10:0)+(a.t.hp/a.t.maxHp-b.t.hp/b.t.maxHp)-(spec.bonus?.[a.t.type]||1)+(spec.bonus?.[b.t.type]||1));
      const z=targets[0];if(!z)continue;
      const luck=.9+rand(s)*.2;
      let d=damage(spec.attack,spec.bonus?.[z.t.type]||1,p.tech.weapons,UNITS[z.t.type]?.armor||0,z.q.tech.armor,luck)*(1+(u.kills>=15?.2:u.kills>=5?.1:0))*(1+p.tech.tactics*.07);
      if(groundAt(s,u.x,u.y)>groundAt(s,z.t.x,z.t.y))d*=1.1;
      if(z.building)d*=(spec.buildingsOnly?1:.1)*(1-Math.min(.3,count(z.q,'wall')*.06));
      if(z.q.formation==='defensive'&&!z.building)d*=.9;
      if(p.formation==='wedge'&&u.type==='knight')d*=1.1;
      hits.push({p,u,...z,d});
    }
    for(const b of p.buildings.filter(b=>['town','tower','keep'].includes(b.type)&&b.hp>0&&b.remaining<=0)){
      const t=foes.flatMap(q=>q.units.map(t=>({t,q}))).filter(z=>dist(b,z.t)<(b.type==='town'?6:8)).sort((a,z)=>a.t.hp-z.t.hp)[0];
      if(t)hits.push({p,u:b,...t,building:false,d:(b.type==='keep'?12:6)*b.level});
    }
  }
  // Resolve every hit together, so array order gives no first strike advantage.
  const hpBefore=new Map(hits.map(h=>[h.t.id,h.t.hp]));const credited=new Set();
  for(const h of hits){h.t.hp-=h.d;h.p.stats.damage+=h.d;}
  for(const h of hits)if(hpBefore.get(h.t.id)>0&&h.t.hp<=0&&!credited.has(h.t.id)){
    credited.add(h.t.id);h.u.kills=(h.u.kills||0)+1;
    if(h.building){h.p.stats.buildingsDestroyed=(h.p.stats.buildingsDestroyed||0)+1;event(s,h.q,'destroyed',`${h.q.name} lost ${BUILDINGS[h.t.type].name.toLowerCase()}.`);for(const [k,v]of Object.entries(BUILDINGS[h.t.type].cost))h.p.resources[k]+=v*.3;}
    else h.p.stats.kills++;
  }
}
function finish(s,winners,reason){s.status='finished';s.winner=winners;s.outcome=winners.length?(s.players.some(p=>p.defeatReason&&p.defeatReason!=='Town center destroyed')?'forfeit':'conquest'):'draw';s.result=s.outcome==='forfeit'?'Opponents eliminated; includes provider forfeits':reason;s.finishedAt=new Date().toISOString();event(s,null,'victory',winners.length?`${s.players.filter(p=>winners.includes(p.id)).map(p=>p.name).join(' & ')} won by ${s.outcome}.`:`Draw: ${reason}.`);}
export function forfeit(s,p,reason){if(!p.alive)return;p.alive=false;p.defeatReason=reason;home(p).hp=0;event(s,p,'defeat',`${p.name} was defeated: ${reason}.`);}
export function step(s,seconds=1){
  if(s.status!=='running')return s;
  for(let remaining=Math.max(0,seconds);remaining>0&&s.status==='running';){
    const dt=Math.min(1,remaining);remaining-=dt;s.elapsed+=dt;
    for(const p of s.players.filter(p=>p.alive)){economy(s,p,dt);moveArmies(s,p,dt);}
    s.combatAcc+=dt;if(s.combatAcc>=2){combat(s);s.combatAcc-=2;}
    for(const p of s.players){
      const old=p.units.length;p.units=p.units.filter(u=>u.hp>0);p.stats.lost+=old-p.units.length;
      if(p.alive&&home(p).hp<=0)forfeit(s,p,'Town center destroyed');
      if(p.alive){if(Math.floor(s.elapsed)%5===0)reveal(s,p);if(count(p,'wonder')){p.wonderSince??=s.elapsed;if(s.elapsed-p.wonderSince>=300){p.wonderBonus=true;/* Economic objective only; conquest still decides the winner. */}}}
    }
    const alive=s.players.filter(p=>p.alive),teams=new Set(alive.map(p=>p.team));
    if(teams.size<=1)finish(s,teams.size? s.players.filter(p=>p.team===alive[0].team).map(p=>p.id):[],'All opposing town centers destroyed');
    for(const t of s.trades)if(t.status==='pending'&&t.expires<s.elapsed)t.status='expired';
    s.historyAcc+=dt;if(s.historyAcc>=30){s.historyAcc=0;s.history.push({t:Math.round(s.elapsed),players:s.players.map(p=>({id:p.id,pop:p.units.length,army:army(p).length,level:p.level,resources:Math.round(Object.values(p.gathered).reduce((a,b)=>a+b,0)),tokens:p.stats.inputTokens+p.stats.outputTokens,hp:Math.round(home(p).hp)}))});}
  }return s;
}
export function demoPlan(s,p){
  // Demonstration-only deterministic controller. Never substituted for an API model.
  const actions=[],h=home(p),soldiers=army(p).length,w=p.units.filter(u=>u.type==='worker').length;
  const ready=k=>count(p,k)>0;const pending=k=>p.buildings.some(b=>b.type===k&&b.hp>0);
  const planned=new Set();
  function ensure(type,level=1,depth=0){
    if(depth>10||buildingLevel(p,type)>=level)return;
    const spec=BUILDINGS[type];if(!spec||p.level<spec.level||planned.has(type))return;
    for(const [required,n]of Object.entries(spec.requires||{}))if(buildingLevel(p,required)<n){ensure(required,n,depth+1);return;}
    const b=p.buildings.find(b=>b.type===type&&b.hp>0&&b.remaining<=0);
    if(b){if(!b.upgrade&&b.level<Math.ceil(p.level/2)){actions.push({type:'upgrade_building',id:b.id});planned.add(type);}}
    else if(!pending(type)){actions.push({type:'build',building:type});planned.add(type);}
  }
  const target=Object.values(p.intel).filter(b=>b.type==='town'&&enemies(s,p).some(q=>q.id===b.owner)).sort((a,b)=>dist(h,a)-dist(h,b))[0];
  if(w<Math.min(75,16+p.level*7)&&p.resources.food>210)actions.push({type:'train',unit:'worker',count:2});
  ensure('depot');ensure('lumbercamp');
  if(!ready('house'))ensure('house');
  if(p.units.length+p.buildings.reduce((n,b)=>n+b.queue.length,0)>capacity(p)-8&&requirementsMet(p,BUILDINGS.house.requires)&&!p.buildings.some(b=>b.type==='house'&&b.remaining>0))actions.push({type:'build',building:'house'});
  if(!pending('farm'))ensure('farm');else if(count(p,'farm')<Math.floor(w/10)&&!p.buildings.some(b=>b.type==='farm'&&b.remaining>0))actions.push({type:'build',building:'farm'});
  if(p.level<10&&!p.upgrading){const needed=TOWN_REQUIREMENTS[p.level+1];if(requirementsMet(p,needed))actions.push({type:'upgrade_town'});else for(const [type,level]of Object.entries(needed))if(buildingLevel(p,type)<level){ensure(type,level);break;}}
  for(const k of ['quarry','barracks','ironmine','goldmine','forge','range','granary','market','library','refinery','stable','government','treasury','engineering','embassy','hospital','workshop','temple','academy','keep'])if(p.level>=BUILDINGS[k].level&&!pending(k)){ensure(k);break;}
  for(const id of ['agriculture','engineering','treasury','health','industry','diplomacy'])if(ready('government')&&ready(DEPARTMENTS[id].building)&&!p.departments?.[id])actions.push({type:'department',department:id,staff:1});
  if(!p.salvage){const ruin=(s.ruins||[]).find(r=>!r.claimedBy&&p.seen.includes(Math.floor(r.y)*s.size+Math.floor(r.x)));if(ruin)actions.push({type:'salvage',id:ruin.id});}
  const unit=ready('workshop')&&p.level>=6&&p.units.filter(u=>u.type==='ram').length<4?'ram':ready('stable')&&p.level>=5&&Number(p.id[1])%2===0?'knight':ready('range')&&p.level>=3?'archer':'spearman';
  if(soldiers<100&&w>=18&&p.resources.food>420)actions.push({type:'train',unit,count:3});
  if(!p.research&&ready('forge')){const tech=p.tech.tools<2?'tools':p.tech.weapons<=p.tech.armor?'weapons':'armor';if(requirementsMet(p,TECH[tech].requires))actions.push({type:'research',tech});}
  const scout=p.units.find(u=>u.type==='scout');
  if(scout&&p.level>=3&&count(p,'outpost')<3&&p.resources.wood>350&&p.resources.stone>200&&anchors(p).every(a=>dist(a,scout)>23)){
    const pt=[{x:scout.x+3,y:scout.y},{x:scout.x-3,y:scout.y},{x:scout.x,y:scout.y+3}].find(pt=>validSite(s,p,pt,'outpost'));
    if(pt)actions.unshift({type:'build',building:'outpost',...pt});
  }
  if(!scout&&p.resources.food>200)actions.push({type:'train',unit:'scout',count:1});
  if(scout&&(!scout.goal||dist(scout,scout.goal)<3)){
    const angle=(s.elapsed/120+Number(p.id[1])*1.7)%(Math.PI*2);actions.push({type:'scout',x:s.size/2+Math.cos(angle)*(s.size/2-9),y:s.size/2+Math.sin(angle)*(s.size/2-9)});
  }
  if(target&&s.elapsed>600&&soldiers>=24&&p.units.some(u=>u.type==='ram'))actions.unshift({type:'attack',target:target.id});
  return {reason:target&&soldiers>=24?'Commit the main army while siege breaks the town defenses.':'Grow the economy, unlock better troops, and scout the river crossings.',weights:{food:p.resources.food<400?10:6,wood:p.resources.wood<300?7:4,stone:p.level<6?2:3,ore:2,gold:2},formation:Number(p.id[1])%2?'line':'wedge',council:{economist:'Balance food, timber, and upgrade reserves.',general:target?'Enemy town located. Assemble the army.':'Scout across the river before marching.',diplomat:'No active treaty. Conquest remains the objective.'},actions:actions.slice(0,8)};
}
export function snapshot(s,pov='all'){
  const p=s.players.find(p=>p.id===pov);
  const clone=structuredClone(s);
  for(const q of clone.players){
    delete q.memory;
    if(p&&p.id!==q.id){q.units=q.units.filter(u=>visible(s,p,u));q.buildings=q.buildings.filter(b=>visible(s,p,b));q.resources=null;q.gathered={};q.level=null;q.reason='Hidden by fog of war';q.council=null;q.tech=null;q.government=null;q.stats=null;q.intel={};q.seen=[];q.weights=null;q.inbox=[];q.research=null;q.upgrading=null;q.salvage=null;q.departments=null;q.departmentPower=null;q.squadOrders={};q.rally=null;q.target=null;delete q.pendingTurn;}
  }
  if(p){clone.ruins=(clone.ruins||[]).filter(r=>p.seen.includes(Math.floor(r.y)*s.size+Math.floor(r.x)));clone.nodes=clone.nodes.filter(n=>p.seen.includes(Math.floor(n.y)*s.size+Math.floor(n.x)));clone.decisions=clone.decisions.filter(d=>d.player===p.id);clone.events=clone.events.filter(e=>e.player===p.id||e.kind==='victory');clone.trades=clone.trades.filter(t=>t.from===p.id||t.to===p.id);clone.treaties=clone.treaties.filter(t=>t.a===p.id||t.b===p.id);clone.history=[];}
  return clone;
}
