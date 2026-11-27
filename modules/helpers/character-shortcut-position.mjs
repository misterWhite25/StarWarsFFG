/** A position is local to a world, user and browser, like the destiny tracker. */
export function shortcutPositionKey(worldId,userId){
  return `starwarsffg.character-shortcuts-position.${worldId}.${userId}`;
}

export function shortcutPosition(value){
  return Number.isFinite(value?.left)&&Number.isFinite(value?.top)?{left:value.left,top:value.top}:null;
}

export function boundedShortcutPosition(value,bounds,viewport){
  return {
    left:Math.max(0,Math.min(value.left,Math.max(0,viewport.width-bounds.width))),
    top:Math.max(0,Math.min(value.top,Math.max(0,viewport.height-bounds.height)))
  };
}

/** Keep pointer listeners on the handle so opening a sheet never starts a drag. */
export function movableHud(element,handle,{key,anchor}){
  const events=new AbortController(),{signal}=events;
  let floating=false,drag,pending;
  const visible=()=>element.isConnected&&element.getClientRects().length;
  const place=value=>{
    if(!visible())return;
    if(!floating){
      floating=true;
      if(anchor){
        const width=element.getBoundingClientRect().width;
        element.classList.add('is-floating');
        element.style.width=`${width}px`;
        document.body.append(element);
        // Reparenting releases capture; renew it on the moved handle.
        if(drag)handle.setPointerCapture(drag.id);
      }
    }
    const position=boundedShortcutPosition(value,element.getBoundingClientRect(),{width:window.innerWidth,height:window.innerHeight});
    element.style.left=`${position.left}px`;element.style.top=`${position.top}px`;
  };
  const refresh=()=>{
    if(drag||!visible())return;
    if(pending){place(pending);pending=null;}
    else if(floating)place(element.getBoundingClientRect());
  };
  const save=()=>{
    const {left,top}=element.getBoundingClientRect();
    try{window.localStorage.setItem(key,JSON.stringify({left,top}));}catch{ /* The HUD still moves if storage is unavailable. */ }
  };
  const reset=()=>{
    const target=anchor?.();
    if(anchor&&!target?.isConnected)return;
    floating=false;pending=null;
    element.style.removeProperty('left');
    element.style.removeProperty('top');
    if(target){
      element.classList.remove('is-floating');
      element.style.removeProperty('width');
      target.before(element);
    }
    try{window.localStorage.removeItem(key);}catch{ /* Position reset does not require storage. */ }
  };
  handle.addEventListener('pointerdown',event=>{
    if(event.button!==0||drag)return;
    event.preventDefault();event.stopPropagation();
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,bounds:element.getBoundingClientRect(),moved:false};
    handle.setPointerCapture(event.pointerId);
  },{signal});
  handle.addEventListener('pointermove',event=>{
    if(drag?.id!==event.pointerId)return;
    const x=event.clientX-drag.x,y=event.clientY-drag.y;
    if(!drag.moved&&Math.hypot(x,y)<3)return;
    drag.moved=true;handle.classList.add('is-dragging');
    place({left:drag.bounds.left+x,top:drag.bounds.top+y});
  },{signal});
  const finish=event=>{
    if(drag?.id!==event.pointerId)return;
    const moved=drag.moved;drag=null;handle.classList.remove('is-dragging');
    if(handle.hasPointerCapture(event.pointerId))handle.releasePointerCapture(event.pointerId);
    if(moved)save();
  };
  for(const type of ['pointerup','pointercancel','lostpointercapture'])handle.addEventListener(type,finish,{signal});
  handle.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();},{signal});
  handle.addEventListener('dblclick',event=>{event.preventDefault();event.stopPropagation();reset();},{signal});
  handle.addEventListener('keydown',event=>{
    const direction={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
    if(!direction)return;
    event.preventDefault();event.stopPropagation();
    const bounds=element.getBoundingClientRect(),step=event.shiftKey?20:5;
    place({left:bounds.left+direction[0]*step,top:bounds.top+direction[1]*step});save();
  },{signal});
  window.addEventListener('resize',refresh,{signal});
  const observer=new ResizeObserver(refresh);observer.observe(element);
  try{
    pending=shortcutPosition(JSON.parse(window.localStorage.getItem(key)));refresh();
  }catch{ /* Ignore stale or unavailable browser storage. */ }
  return {get floating(){return floating;},refresh,destroy(){events.abort();observer.disconnect();}};
}
