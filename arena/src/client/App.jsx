import {useEffect,useRef,useState} from 'react';
import {useArena} from './hooks/useArena.js';
import {AGES,ageOf,MAPS,RESOURCES} from '../rules.mjs';
import {capacity,count} from '../engine.mjs';
import {clock,number} from './lib/format.js';
import GameCanvas from './components/GameCanvas.jsx';
import {SetupDialog,ConnectionDialog} from './components/Dialogs.jsx';
import {Kingdoms,Council,MatchJournal,Inspector} from './components/MatchPanels.jsx';
import {Analysis,History,League,Codex} from './components/ArchiveViews.jsx';

export default function App(){
  const arena=useArena(),match=arena.match,renderer=useRef(null);
  const [view,setView]=useState('map'),[dialog,setDialog]=useState(null),[selected,setSelected]=useState('p1'),[pov,setPov]=useState('all'),[zoom,setZoom]=useState(1.6);
  const [clean,setClean]=useState(false),[navigator,setNavigator]=useState(false),[kingdomsCollapsed,setKingdomsCollapsed]=useState(false),[councilCollapsed,setCouncilCollapsed]=useState(false),[journalOpen,setJournalOpen]=useState(false),[journalTab,setJournalTab]=useState('journal'),[inspected,setInspected]=useState(null),[reportId,setReportId]=useState(null);
  const previousMatch=useRef(null);
  useEffect(()=>{if(match&&previousMatch.current!==match.id){previousMatch.current=match.id;setSelected(match.players[0].id);setPov('all');setInspected(null);}},[match]);
  useEffect(()=>{
    const onKey=e=>{if(view!=='map'||dialog||['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName))return;const key=e.key.toLowerCase();if(key==='h'){e.preventDefault();renderer.current?.focusPlayer(selected);}if(key==='home'){e.preventDefault();renderer.current?.reset();}if(key==='f')setClean(c=>!c);if(key==='m')setNavigator(n=>!n);if(key==='escape')setInspected(null);};
    document.addEventListener('keydown',onKey);return()=>document.removeEventListener('keydown',onKey);
  },[dialog,selected,view]);
  const focus=id=>renderer.current?.focusPlayer(id);
  const openTab=tab=>{setJournalTab(tab);setJournalOpen(true);setClean(false);};
  async function watch(id){try{await arena.watch(id);setView('map');}catch(e){arena.notify(e.message);}}
  async function launch(config){await arena.launch(config);setView('map');setReportId(null);}
  if(!match)return <div className="loading-screen"><span>♜</span><h1>Age of AI</h1><p>Preparing the world…</p></div>;
  const player=match.players.find(p=>p.id===selected)||match.players[0],map=MAPS[match.mapId];
  return <div className="app-shell">
    <header className="topbar"><button className="brand" onClick={()=>setView('map')}>Age of <b>AI</b><small>BATTLE ARENA</small></button>
      <div className="match-clock"><strong>{clock(match.elapsed)}</strong><small>{match.duration?'/ '+clock(match.duration):'UNTIL CONQUEST'} <span className={match.status==='running'?'live-status':''}>{match.kind==='demo'?'EXHIBITION':match.status.toUpperCase()}</span></small></div>
      <label className="empire-select"><i style={{background:player.color}}/><select aria-label="Selected empire" value={selected} onChange={e=>setSelected(e.target.value)}>{match.players.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <div className="resource-hud">{RESOURCES.map(k=><div className={`resource ${k}`} key={k}><small>{k}</small><strong>{number(player.resources[k])}</strong><i><b style={{width:Math.min(100,player.resources[k]/(k==='coins'?6000:1200+count(player,'granary')*1600)*100)+'%'}}/></i></div>)}<div className="resource population"><small>People</small><strong>{player.units.length}<span> / {capacity(player)}</span></strong><i><b style={{width:player.units.length/capacity(player)*100+'%'}}/></i></div></div>
      <div className="age-hud"><small>Age</small><strong>{AGES[ageOf(player.level)]}</strong></div>
      <nav className="main-nav" aria-label="Main navigation">{[['map','Map'],['analysis','Stats'],['league','League'],['matches','Matches'],['codex','Codex']].map(([id,name])=><button key={id} className={view===id?'active':''} onClick={()=>{setView(id);if(id==='analysis')setReportId(match.id);}}>{name}</button>)}</nav>
      <button className="icon-button" aria-label="Connection settings" onClick={()=>setDialog('connection')}>⚙</button><button className="primary-button new-match" onClick={()=>setDialog('setup')}>＋ New match</button>
    </header>
    <div className="ticker"><span className="ticker-badge">{match.kind==='demo'?'DEMO · NO API':match.status==='running'?'API LIVE':match.status.toUpperCase()}</span><strong>{match.name}</strong><span className="world-info">{match.players.length} empires · {map.name} · {match.size}×{match.size}</span><span className="ticker-event">{match.events.at(-1)?.text}</span><button onClick={arena.exportReport}>↓ Report</button></div>
    <main className="main-stage">
      {view==='map'?<div className={`battlefield ${clean?'clean-hud':''} ${journalOpen?'journal-open':''}`}>
        <GameCanvas match={match} pov={pov} selectedPlayer={selected} onInspect={setInspected} onCamera={setZoom} rendererRef={renderer} showNavigator={navigator}/>
        <div className="world-toolbar hud-panel"><button onClick={()=>focus(selected)} title="Center town (H)">♜ <span>Town</span></button><span className="toolbar-divider"/><button aria-label="Zoom out" onClick={()=>renderer.current?.setZoom(zoom/1.15)}>−</button><span className="zoom-readout">{Math.round(zoom*100)}%</span><button aria-label="Zoom in" onClick={()=>renderer.current?.setZoom(zoom*1.15)}>+</button><span className="toolbar-divider"/><button onClick={()=>renderer.current?.reset()} title="Whole world overview (Home)">⌖ <span>World</span></button><button aria-label="Toggle world navigator" onClick={()=>setNavigator(n=>!n)} title="World navigator (M)" className={navigator?'is-active':''}>◈</button><button aria-label="Toggle full map" onClick={()=>setClean(c=>!c)} title="Hide panels (F)" className={clean?'is-active':''}>⛶</button></div>
        <div className="terrain-key"><span><i className="forest-key"/>Timber · blocks routes</span><span>▱ Hills · slow</span><span>◇ Desert</span><span><i className="stone-key"/>Stone</span><span><i className="ore-key"/>Ore</span><span><i className="gold-key"/>Gold</span><span><i className="road-key"/>Road</span><span className="frontier-key">⚑ Frontier resources</span></div>
        <Kingdoms match={match} selected={selected} onSelect={setSelected} onFocus={focus} collapsed={kingdomsCollapsed} onCollapse={()=>setKingdomsCollapsed(c=>!c)}/>
        <Council match={match} player={player} pov={pov} collapsed={councilCollapsed} onCollapse={()=>setCouncilCollapsed(c=>!c)} onDecisions={()=>openTab('decisions')}/>
        <div className="camera-hint">DRAG TO EXPLORE <span>·</span> WHEEL TO ZOOM <span>·</span> WASD TO PAN <span>·</span> F FOR FULL MAP</div>
        <div className="battle-bottom-bar"><div className="viewer-controls hud-panel"><label><span>◉</span><select aria-label="Map perspective" value={pov} onChange={e=>setPov(e.target.value)}><option value="all">All-seeing observer</option>{match.players.map(p=><option key={p.id} value={p.id}>{p.name}'s vision</option>)}</select></label>{match.kind==='demo'&&<><button aria-label={arena.paused?'Resume demo':'Pause demo'} onClick={()=>arena.setPaused(v=>!v)}>{arena.paused?'▶':'Ⅱ'}</button><select aria-label="Demo speed" value={arena.speed} onChange={e=>arena.setSpeed(Number(e.target.value))}>{[1,5,15,40].map(n=><option key={n} value={n}>{n}×</option>)}</select></>}<span className="runner-indicator"><i className={arena.health.runner==='autonomous'?'connected':''}/>{arena.health.runner==='autonomous'?'Runner connected':'Exhibition preview'}</span></div><span className="coordinates">{map.name.toUpperCase()} · {match.size} × {match.size} · SEED {match.seed}</span></div>
        <MatchJournal match={match} tab={journalTab} onTab={openTab} expanded={journalOpen} onToggle={()=>setJournalOpen(o=>!o)} pov={pov}/>
        <Inspector entity={inspected} onClose={()=>setInspected(null)}/>
        {match.status==='finished'&&<div className="outcome-toast hud-panel"><span>♛</span><div><strong>{match.winner.length?match.players.filter(p=>match.winner.includes(p.id)).map(p=>p.name).join(' & ')+' won':'Match drawn'}</strong><p>{match.result}</p></div><button onClick={()=>{setReportId(match.id);setView('analysis');}}>View report →</button></div>}
      </div>:<section className="secondary-view">{view==='analysis'&&<Analysis arena={arena} matchId={reportId||match.id}/>} {view==='matches'&&<History arena={arena} onWatch={watch} onReport={id=>{setReportId(id);setView('analysis');}} onNew={()=>setDialog('setup')}/>} {view==='league'&&<League arena={arena}/>} {view==='codex'&&<Codex/>}</section>}
    </main>
    {dialog==='setup'&&<SetupDialog health={arena.health} onClose={()=>setDialog(null)} onLaunch={launch}/>}
    {dialog==='connection'&&<ConnectionDialog arena={arena} onClose={()=>setDialog(null)}/>}
    {arena.message&&<div className="toast" role="status">{arena.message}</div>}
  </div>;
}
