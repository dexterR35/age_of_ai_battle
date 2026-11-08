import {useEffect,useRef} from 'react';
import {BattleMap} from '../game/WorldRenderer.js';

export default function GameCanvas({match,pov,selectedPlayer,onInspect,onCamera,rendererRef,showNavigator}){
  const canvas=useRef(null),mini=useRef(null),handlers=useRef({onInspect,onCamera});
  handlers.current={onInspect,onCamera};
  useEffect(()=>{
    const renderer=new BattleMap(canvas.current,mini.current,entity=>handlers.current.onInspect(entity),zoom=>handlers.current.onCamera(zoom));
    rendererRef.current=renderer;
    return()=>{renderer.destroy();rendererRef.current=null;};
  },[rendererRef]);
  useEffect(()=>{const r=rendererRef.current;if(!r)return;const changed=r.state?.id!==match.id;r.setState(match,pov);if(changed)r.focusPlayer(selectedPlayer);},[match,pov,rendererRef,selectedPlayer]);
  useEffect(()=>{if(rendererRef.current){rendererRef.current.navigatorVisible=showNavigator;if(showNavigator)rendererRef.current.drawMini();}},[rendererRef,showNavigator]);
  return <>
    <canvas ref={canvas} className="world-canvas" aria-label="Main battlefield. Drag to explore, scroll to zoom, WASD to pan. Home shows the whole world." tabIndex={0}/>
    <div className={`world-navigator ${showNavigator?'':'is-hidden'}`}><div>WORLD NAVIGATOR <span>{match.size} × {match.size}</span></div><canvas ref={mini} width="240" height="140" aria-label="Optional world navigator. Click to move the main camera."/></div>
  </>;
}
