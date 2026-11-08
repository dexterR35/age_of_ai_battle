import {useCallback,useEffect,useRef,useState} from 'react';
import {createMatch,step,demoPlan,applyDecision} from '../../engine.mjs';
import {request,downloadJSON} from '../lib/format.js';

export const EMPIRE_NAMES=['Atlas','Sable','Verdant','Ember','Orion','Tide','Terra','Nova'];
function demoTurn(match){
  const due=match.players.filter(p=>p.alive&&p.nextDecision<=match.elapsed);
  const plans=due.map(p=>demoPlan(match,p));
  due.forEach((p,i)=>{const plan=plans[i],results=applyDecision(match,p,plan);p.nextDecision=match.elapsed+match.decisionEvery;match.decisions.push({id:`turn-${match.decisions.length+1}`,player:p.id,t:Math.floor(match.elapsed),source:'scripted',reason:plan.reason,council:plan.council,actions:plan.actions,results,usage:null});});
}
export function reportFor(match){return {version:2,match:{id:match.id,name:match.name,kind:match.kind,status:match.status,result:match.result,outcome:match.outcome,winner:match.winner,elapsed:match.elapsed,duration:match.duration,seed:match.seed,size:match.size,mapId:match.mapId},players:match.players.map(p=>({id:p.id,name:p.name,provider:p.provider,model:p.model,level:p.level,stats:p.stats,gathered:p.gathered,spent:p.spent||{},stock:p.resources,tech:p.tech,government:p.government})),timeline:match.history,events:match.events,decisions:match.decisions,lessons:match.lessons||[]};}

export function useArena(){
  const [match,setMatch]=useState(null),[health,setHealth]=useState({runner:'checking'});
  const [paused,setPaused]=useState(false),[speed,setSpeed]=useState(5),[token,setToken]=useState('');
  const [archive,setArchive]=useState([]),[profiles,setProfiles]=useState([]),[message,setMessage]=useState('');
  const live=useRef(null),activeId=useRef(null),prefs=useRef({paused,speed,token}),busy=useRef(false),demoArchive=useRef([]),demoProfiles=useRef([]),toastTimer=useRef(null);
  prefs.current={paused,speed,token};
  const publish=useCallback(()=>setMatch({...live.current}),[]);
  const notify=useCallback(text=>{setMessage(text);clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setMessage(''),5500);},[]);
  const record=useCallback(state=>{
    if(state.demoRecorded)return;state.demoRecorded=true;state.lessons=[];
    for(const p of state.players){let profile=demoProfiles.current.find(x=>x.id===p.profile);if(!profile){profile={id:p.profile,model:p.name,provider:'scripted',level:1,wins:0,losses:0,draws:0,matches:0,elo:1000,tokens:0,lessons:[]};demoProfiles.current.push(profile);}profile.matches++;if(state.winner.includes(p.id)){profile.wins++;profile.level++;}else if(state.winner.length)profile.losses++;else profile.draws++;
      const lesson={match:state.id,text:`Town L${p.level}; ${p.stats.kills} kills / ${p.stats.lost} losses. ${p.reason}`};profile.lessons.push(lesson);profile.lessons=profile.lessons.slice(-12);state.lessons.push(lesson);}
    demoArchive.current.unshift(structuredClone(state));setArchive([...demoArchive.current]);setProfiles([...demoProfiles.current]);
  },[]);
  const startDemo=useCallback((config={},warmup=0)=>{
    const players=(config.players||EMPIRE_NAMES.slice(0,4).map(name=>({name}))).map(p=>({...p,provider:'scripted',model:`scripted-${p.name}`}));
    const state=createMatch({...config,kind:'demo',players});
    for(const p of state.players)p.memory=config.learning===false?[]:(demoProfiles.current.find(x=>x.id===p.profile)?.lessons||[]).slice(-3);
    demoTurn(state);for(let t=0;t<warmup&&state.status==='running';t+=5){step(state,5);demoTurn(state);}
    live.current=state;activeId.current=null;setPaused(false);publish();
  },[publish]);
  const checkConnection=useCallback(async()=>{
    try{const data=await request('/api/health',prefs.current.token);setHealth(data);return data;}catch{const data={runner:'offline'};setHealth(data);return data;}
  },[]);
  useEffect(()=>{
    if(!live.current)startDemo({size:384,mapId:'frontier',name:'Great Frontier',duration:0},180);
    checkConnection();
    const timer=setInterval(async()=>{
      if(busy.current||!live.current)return;
      if(activeId.current){busy.current=true;try{live.current=await request(`/api/matches/${activeId.current}`,prefs.current.token);publish();}catch(error){notify(error.message);}finally{busy.current=false;}return;}
      const state=live.current;if(state.status!=='running'||prefs.current.paused)return;
      step(state,prefs.current.speed/2);demoTurn(state);if(state.status==='finished'){record(state);notify(state.winner.length?'Conquest complete. The full report is ready.':'All empires were eliminated. The match is a draw.');}publish();
    },500);
    return()=>{clearInterval(timer);clearTimeout(toastTimer.current);};
  },[checkConnection,notify,publish,record,startDemo]);
  const launch=useCallback(async config=>{
    if(config.kind==='api'){
      if(health.runner!=='autonomous')throw Error('Connect the cloud runner first. No provider keys have been sent.');
      if(!health.encryptionReady)throw Error('Configure KEY_ENCRYPTION_SECRET on the runner before starting API battles.');
      const result=await request('/api/matches',prefs.current.token,{method:'POST',body:JSON.stringify(config)});
      const state=await request(`/api/matches/${result.id}`,prefs.current.token);activeId.current=result.id;live.current=state;publish();
    }else startDemo(config);
    notify(config.kind==='api'?'API battle launched. The models are in command.':'Exhibition launched. No API tokens are used.');
  },[health,notify,publish,startDemo]);
  const loadArchive=useCallback(async()=>{
    if(health.runner==='autonomous'){const [matches,ps]=await Promise.all([request('/api/matches',prefs.current.token),request('/api/profiles',prefs.current.token)]);setArchive([...matches,...demoArchive.current]);setProfiles([...ps,...demoProfiles.current]);}
    else{setArchive([...demoArchive.current]);setProfiles([...demoProfiles.current]);}
  },[health]);
  const watch=useCallback(async id=>{
    const local=demoArchive.current.find(s=>s.id===id);live.current=local?structuredClone(local):await request(`/api/matches/${id}`,prefs.current.token);activeId.current=local?null:id;publish();
  },[publish]);
  const getReport=useCallback(async(id=live.current?.id)=>{
    if(id===live.current?.id&&activeId.current)return request(`/api/matches/${id}/report`,prefs.current.token);
    const state=id===live.current?.id?live.current:demoArchive.current.find(s=>s.id===id);return state?reportFor(state):request(`/api/matches/${id}/report`,prefs.current.token);
  },[]);
  const exportReport=useCallback(async()=>{try{const report=await getReport();downloadJSON(report,`ageofai-${report.match.id}.json`);notify('Report exported. Provider keys are excluded.');}catch(error){notify(error.message);}},[getReport,notify]);
  return {match,health,paused,setPaused,speed,setSpeed,token,setToken,message,notify,archive,profiles,launch,loadArchive,watch,getReport,exportReport,checkConnection};
}
