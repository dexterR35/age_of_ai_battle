import {useEffect,useRef,useState} from 'react';
import {MAPS,COLORS} from '../../rules.mjs';
import {EMPIRE_NAMES} from '../hooks/useArena.js';

function Dialog({title,eyebrow,children,onClose,wide=false}){
  const ref=useRef(null);
  useEffect(()=>{const dialog=ref.current;dialog.showModal();return()=>{if(dialog.open)dialog.close();};},[]);
  return <dialog ref={ref} className={wide?'modal modal-wide':'modal'} onCancel={onClose} aria-label={title}>
    <header className="modal-heading"><div><small>{eyebrow}</small><h2>{title}</h2></div><button className="close-button" onClick={onClose} aria-label="Close dialog">×</button></header>{children}
  </dialog>;
}
const freshPlayer=i=>({name:EMPIRE_NAMES[i],provider:['openai','anthropic','google','deepseek'][i%4],model:'',apiKey:'',tokenBudget:60000,maxOutput:1024,inputPrice:'',outputPrice:''});

export function SetupDialog({health,onClose,onLaunch}){
  const [config,setConfig]=useState({name:'Great Frontier',mapId:'frontier',size:'auto',count:4,mode:'ffa',kind:'demo',duration:0,decisionEvery:60,learning:true,seed:''});
  const [players,setPlayers]=useState(()=>Array.from({length:8},(_,i)=>freshPlayer(i)));
  const [error,setError]=useState(''),[loading,setLoading]=useState(false);
  const change=(key,value)=>setConfig(old=>({...old,[key]:value,...(key==='mode'&&value==='duel'?{count:2}:{}),...(key==='count'&&old.mode==='duel'&&Number(value)!==2?{mode:'ffa'}:{})}));
  const edit=(i,key,value)=>setPlayers(old=>old.map((p,j)=>i===j?{...p,[key]:value}:p));
  const isApi=config.kind==='api';
  async function submit(e){e.preventDefault();setLoading(true);setError('');try{await onLaunch({...config,size:config.size==='auto'?undefined:Number(config.size),count:undefined,seed:Number(config.seed)||crypto.getRandomValues(new Uint32Array(1))[0]||1,players:players.slice(0,Number(config.count))});onClose();}catch(err){setError(err.message);}finally{setLoading(false);}}
  return <Dialog title="A world worth conquering." eyebrow="NEW BATTLE" onClose={onClose} wide>
    <p className="modal-intro">Choose the landscape and the minds. From the first settlement to the last town standing.</p>
    <form onSubmit={submit}>
      <div className="map-options">{Object.entries(MAPS).map(([id,map])=><label className={`map-option ${id} ${config.mapId===id?'selected':''}`} key={id}>
        <input type="radio" name="map" value={id} checked={config.mapId===id} onChange={()=>setConfig(c=>({...c,mapId:id,name:Object.values(MAPS).some(m=>m.name===c.name)?map.name:c.name}))}/>
        <span className="map-art"><i/><b>♜</b></span><strong>{map.name}</strong><small>{map.description}</small>
      </label>)}</div>
      <div className="form-grid">
        <label>Match name<input value={config.name} maxLength="60" required onChange={e=>change('name',e.target.value)}/></label>
        <label>Controller<select value={config.kind} onChange={e=>change('kind',e.target.value)}><option value="demo">Scripted exhibition · free</option><option value="api">Real API models</option></select></label>
        <label>Players<select value={config.count} onChange={e=>change('count',Number(e.target.value))}>{[2,4,6,8].map(n=><option key={n} value={n}>{n} players</option>)}</select></label>
        <label>Format<select value={config.mode} onChange={e=>change('mode',e.target.value)}><option value="ffa">Free for all</option><option value="teams">Teams · {config.count/2} vs {config.count/2}</option><option value="duel">1 vs 1</option></select></label>
        <label>World size<select value={config.size} onChange={e=>change('size',e.target.value)}><option value="auto">Automatic · {config.count===2?256:config.count===4?384:512} × {config.count===2?256:config.count===4?384:512}</option>{[256,384,512].map(n=><option key={n} value={n}>{n} × {n} · {n===256?'Large':n===384?'Vast':'Epic'}</option>)}</select></label>
        <label>Victory condition<input value="Conquest · no time limit" readOnly/></label>
        <label>Model decision every<select value={config.decisionEvery} onChange={e=>change('decisionEvery',Number(e.target.value))}>{[30,60,120].map(n=><option key={n} value={n}>{n} seconds</option>)}</select></label>
        <label>Map seed<input type="number" min="1" placeholder="Random" value={config.seed} onChange={e=>change('seed',e.target.value)}/></label>
      </div>
      <p className="setup-note">{isApi?(health.runner!=='autonomous'?'Connect the cloud runner before sending API keys.':health.encryptionReady?'Keys are encrypted per player, never exported, and deleted after the match.':'Set KEY_ENCRYPTION_SECRET on the runner first.'):'This exhibition uses the actual game engine with scripted strategists. No API calls. Demo history lasts for this tab.'}</p>
      <div className="player-configs">{players.slice(0,config.count).map((p,i)=><section className="player-config" style={{'--player':COLORS[i]}} key={i}>
        <header><span className="color-dot"/>CONTENDER {String(i+1).padStart(2,'0')}<small>{config.mode==='teams'?`TEAM ${Math.floor(i/(config.count/2))+1}`:'INDEPENDENT EMPIRE'}</small></header>
        <div className="form-grid player-fields"><label>Empire name<input value={p.name} maxLength="35" required onChange={e=>edit(i,'name',e.target.value)}/></label>
        {isApi?<><label>Provider<select value={p.provider} onChange={e=>edit(i,'provider',e.target.value)}>{[['openai','OpenAI'],['anthropic','Anthropic'],['google','Google Gemini'],['openrouter','OpenRouter'],['deepseek','DeepSeek']].map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
        <label>Exact model ID<input value={p.model} placeholder="Provider model ID" required onChange={e=>edit(i,'model',e.target.value)}/></label>
        <label>API key<input type="password" aria-label={`API key for ${p.name}`} autoComplete="off" required value={p.apiKey} onChange={e=>edit(i,'apiKey',e.target.value)}/></label>
        <label>Token budget<input type="number" min="2000" max="500000" required value={p.tokenBudget} onChange={e=>edit(i,'tokenBudget',Number(e.target.value))}/></label>
        <label>Max output tokens<select value={p.maxOutput} onChange={e=>edit(i,'maxOutput',Number(e.target.value))}>{[512,1024,2048,4096].map(n=><option key={n}>{n}</option>)}</select></label>
        <label>Input $ / million<input type="number" min="0" max="500" step="0.001" value={p.inputPrice} placeholder="Optional estimate" onChange={e=>edit(i,'inputPrice',e.target.value)}/></label>
        <label>Output $ / million<input type="number" min="0" max="1000" step="0.001" value={p.outputPrice} placeholder="Optional estimate" onChange={e=>edit(i,'outputPrice',e.target.value)}/></label></>:<div className="scripted-label">Deterministic strategist <span>0 API tokens</span></div>}</div>
      </section>)}</div>
      <label className="checkbox-label"><input type="checkbox" checked={config.learning} onChange={e=>change('learning',e.target.checked)}/>Carry forward each model's last three match lessons</label>
      {error&&<p className="form-error" role="alert">{error}</p>}
      <footer className="modal-footer"><span>Conquest only · Private fog · 300 population cap</span><button className="primary-button" disabled={loading}>{loading?'Preparing the council…':isApi?'Launch API battle →':'Launch exhibition →'}</button></footer>
    </form>
  </Dialog>;
}

export function ConnectionDialog({arena,onClose}){
  const [token,setToken]=useState(arena.token);
  return <Dialog title="Connect the cloud runner." eyebrow="AUTONOMOUS EXECUTION" onClose={onClose}>
    <p className="modal-intro">API matches run on the server even when the viewer closes. The exhibition runs in this tab.</p>
    <div className="connection-state">{arena.health.runner==='autonomous'?`Runner connected. Key encryption ${arena.health.encryptionReady?'ready':'needs configuration'}.`:'The private Site is in exhibition mode. Deploy the included runner and configure BATTLE_RUNNER_URL and BATTLE_RUNNER_TOKEN on the Site.'}</div>
    <label className="field">Runner admin token<input type="password" autoComplete="off" value={token} onChange={e=>setToken(e.target.value)} placeholder="Standalone runner only"/></label>
    <p className="muted">Kept in this tab's memory only.</p>
    <footer className="modal-footer"><button className="secondary-button" onClick={arena.checkConnection}>Check connection</button><button className="primary-button" onClick={()=>{arena.setToken(token);onClose();arena.notify('Connection token saved for this tab.');}}>Save for this tab</button></footer>
  </Dialog>;
}
