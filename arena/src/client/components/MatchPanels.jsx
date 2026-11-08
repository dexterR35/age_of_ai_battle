import {army,capacity,count,home,departmentStatus} from '../../engine.mjs';
import {AGES,ageOf,RESOURCES,UNITS,BUILDINGS} from '../../rules.mjs';
import {clock,number,compact} from '../lib/format.js';

export function Kingdoms({match,selected,onSelect,onFocus,collapsed,onCollapse}){
  return <aside className={`hud-panel kingdoms-panel ${collapsed?'collapsed':''}`}><header className="panel-heading"><h2>Kingdoms <small>{match.players.length}</small></h2><button onClick={onCollapse} aria-label="Toggle kingdoms">{collapsed?'+':'−'}</button></header>
    {!collapsed&&<div className="kingdom-list">{match.players.map(p=><button key={p.id} onClick={()=>onSelect(p.id)} onDoubleClick={()=>onFocus(p.id)} className={`kingdom-card ${selected===p.id?'selected':''} ${!p.alive?'defeated':''}`} style={{'--player':p.color}}>
      <div className="kingdom-title"><span className="color-dot"/><strong>{p.name}</strong><small>{AGES[ageOf(p.level)]}</small></div><div className="kingdom-model">{match.kind==='demo'?'Scripted strategist':p.model}</div>
      {selected===p.id?<dl><dt>Town center</dt><dd>Level {p.level}</dd><dt>Population</dt><dd>{p.units.length} / {capacity(p)}</dd><dt>Villagers / army</dt><dd>{p.units.filter(u=>u.type==='worker').length} / {army(p).length}</dd><dt>Outposts</dt><dd>{count(p,'outpost')}</dd><dt>Explored</dt><dd>{Math.round(p.seen.length/match.size**2*100)}%</dd></dl>:<div className="kingdom-brief"><span>♙ {p.units.length}</span><span>⚔ {army(p).length}</span><span>♜ Lv.{p.level}</span></div>}
      <div className="health-track"><i style={{width:Math.max(0,home(p).hp/home(p).maxHp*100)+'%'}}/></div><div className="health-caption"><span>{p.alive?'TOWN CENTER':'DEFEATED'}</span><span>{number(Math.max(0,home(p).hp))} HP</span></div>
    </button>)}</div>}
  </aside>;
}

export function Council({match,player,pov,collapsed,onCollapse,onDecisions}){
  const recent=match.decisions.filter(d=>pov==='all'||d.player===pov).slice(-5).reverse();
  return <aside className={`hud-panel council-panel ${collapsed?'collapsed':''}`}><header className="panel-heading"><h2>The AI's thoughts</h2><button onClick={onCollapse} aria-label="Toggle AI thoughts">{collapsed?'+':'−'}</button></header>{!collapsed&&<div className="council-scroll">
    <div className="king-heading"><span>♛</span><div><strong>{player.name}</strong><small>THE KING'S COUNCIL</small></div><i className="live-dot"/></div>
    <p className="king-directive">{pov==='all'||pov===player.id?player.reason:'Hidden by fog of war.'}</p>
    {['economist','general','diplomat'].map((role,i)=><div className="adviser" key={role}><span>{['◇','⚔','⚑'][i]}</span><div><strong>{role}</strong><p>{pov==='all'||pov===player.id?player.council?.[role]:'Unknown'}</p></div></div>)}
    <div className="council-usage"><div><strong>{compact(player.stats.inputTokens+player.stats.outputTokens)} tokens</strong><small>{match.kind==='demo'?'Exhibition · zero API calls':`${player.stats.calls} calls · ${player.stats.calls?(player.stats.latency/player.stats.calls/1000).toFixed(1):0}s avg`}</small></div><button onClick={onDecisions} aria-label="Inspect decision log">↗</button></div>
    {(pov==='all'||pov===player.id)&&<><h3 className="micro-heading">Civil departments</h3><p className="fine-print">{player.government} · Town level {player.level} · staff are villagers</p>{departmentStatus(player).map(d=><div className="department-row" key={d.id}><strong>{d.name}</strong><span>{d.available?`${d.active} / ${d.requested} on site`:`Requires ${BUILDINGS[d.building].name}`}</span><small>{d.effect}</small></div>)}{player.research&&<p className="fine-print">Research: {player.research.tech} · {clock(player.research.remaining)} work left{!departmentStatus(player).find(d=>d.id==='research')?.active?' · waiting for scholars':''}</p>}</>}
    <h3 className="micro-heading">Recent directives</h3>{recent.map(d=>{const p=match.players.find(p=>p.id===d.player);return <p className="thought-entry" key={d.id}><time>{clock(d.t)}</time><strong style={{color:p.color}}>● {p.name}</strong> {d.reason}</p>;})}
  </div>}</aside>;
}

export function MatchJournal({match,tab,onTab,expanded,onToggle,pov}){
  const players=match.players,own=players.find(p=>p.id===pov),visibleEvents=own?match.events.filter(e=>e.player===own.id||e.kind==='victory'):match.events;
  const visibleDecisions=match.decisions.filter(d=>!own||d.player===own.id);
  return <section className={`hud-panel journal-panel ${expanded?'expanded':''}`}><header className="journal-heading"><nav aria-label="Match details">{['journal','economy','army','decisions','diplomacy'].map(name=><button key={name} className={tab===name?'active':''} onClick={()=>onTab(name)}>{name}{name==='decisions'&&<small>{visibleDecisions.length}</small>}</button>)}</nav><span className="journal-latest">{visibleEvents.at(-1)?.text}</span><button onClick={onToggle} aria-label={expanded?'Collapse journal':'Expand journal'}>{expanded?'−':'+'}</button></header>
    {expanded&&<div className="journal-content">
      {tab==='journal'&&<ul className="event-list">{visibleEvents.slice(-50).reverse().map(e=>{const p=players.find(p=>p.id===e.player);return <li key={e.id}><time>{clock(e.t)}</time><span className="event-kind">{e.kind}</span><span>{p&&<b style={{color:p.color}}>● </b>}{e.text}</span></li>;})}</ul>}
      {tab==='economy'&&<DataTable headers={['Empire',...RESOURCES,'Outposts']} rows={players.map(p=>[p.name,...RESOURCES.map(k=>own&&own.id!==p.id?'?':number(p.resources[k])),count(p,'outpost')])}/>}
      {tab==='army'&&<DataTable headers={['Empire',...Object.entries(UNITS).filter(([k])=>k!=='worker').map(([,u])=>u.name),'K / L','Order']} rows={players.map(p=>[p.name,...Object.keys(UNITS).filter(k=>k!=='worker').map(k=>own&&own.id!==p.id?'?':p.units.filter(u=>u.type===k).length),`${p.stats.kills} / ${p.stats.lost}`,own&&own.id!==p.id?'?':p.stance])}/>}
      {tab==='decisions'&&<div className="decision-list">{visibleDecisions.slice(-60).reverse().map(d=><article key={d.id}><time>{clock(d.t)}</time><div><strong style={{color:players.find(p=>p.id===d.player)?.color}}>{players.find(p=>p.id===d.player)?.name}</strong><p>{d.reason}</p><details><summary>{d.actions.length} orders · {d.results.filter(r=>r.ok).length} accepted · {d.usage?compact(d.usage.inputTokens+d.usage.outputTokens)+' tokens':'scripted, 0 tokens'}</summary><pre>{JSON.stringify({actions:d.actions,results:d.results,usage:d.usage},null,2)}</pre></details></div><span className="tag">{d.source}</span></article>)}</div>}
      {tab==='diplomacy'&&<div className="diplomacy-list">{players.flatMap(p=>(p.inbox||[]).filter(()=>!own||p.id===own.id).map((m,i)=><article key={`${p.id}:${m.t}:${i}`}><time>{clock(m.t)}</time><strong>{players.find(q=>q.id===m.from)?.name} → {p.name}</strong><p>{m.text}</p><span className="tag">{m.kind}</span></article>))}{!players.some(p=>p.inbox.length)&&<p className="empty-message">Diplomatic channels are quiet. Models can offer trades and temporary truces.</p>}</div>}
    </div>}
  </section>;
}

export function DataTable({headers,rows}){return <div className="table-scroll"><table><thead><tr>{headers.map((h,i)=><th key={i}>{h}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>;}

export function Inspector({entity,onClose}){
  if(!entity)return null;const e=entity.entity;if(entity.kind==='ruin')return <section className="hud-panel inspector"><button onClick={onClose} className="close-button" aria-label="Close inspection">×</button><small>ANCIENT RUINS</small><h3>{e.kind==='watchtower'?'Fallen watchtower':'Lost sanctuary'}</h3><p>{e.claimedBy?'Already recovered':`${e.stone} stone · ${e.gold} gold`}</p><p>A villager needs 30 seconds on site to salvage.</p></section>;
  return <section className="hud-panel inspector"><button onClick={onClose} className="close-button" aria-label="Close inspection">×</button><small>{entity.kind==='resource'?'RESOURCE DEPOSIT':entity.p.name}</small><h3>{entity.kind==='resource'?({wood:'Harvestable tree',food:'Wild food',stone:'Stone quarry',ore:'Iron ore',gold:'Gold vein'})[e.type]:BUILDINGS[e.type]?.name||UNITS[e.type]?.name}</h3><p>{entity.kind==='resource'?`${number(e.amount)} resources remaining${e.type==='wood'?(e.amount>0?' · blocks this tile':' · felled, path open'):''}`:`${number(e.hp)} / ${number(e.maxHp)} HP`}</p><p>Tile {Math.round(e.x)}, {Math.round(e.y)}{e.zone==='frontier'?' · Frontier resource hub':''}</p>{entity.kind==='building'&&<><p>Level {e.level} · {e.remaining>0?'Construction · '+clock(e.remaining)+' work remaining':e.upgrade?'Upgrading · '+clock(e.upgrade.remaining)+' work remaining':'Completed'}</p>{e.remaining>0&&<p>Progress: {Math.floor((1-e.remaining/e.total)*100)}% · nearby villagers required</p>}</>}</section>;
}
