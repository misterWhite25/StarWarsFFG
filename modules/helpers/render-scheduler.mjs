/** Coalesce bursts, serializing renders and retaining changes that arrive during a render. */
export function renderScheduler({render,isOpen,onError,requestFrame=callback=>requestAnimationFrame(callback),cancelFrame=id=>cancelAnimationFrame(id)}) {
  let frame=null,running=false,pending=false;
  const schedule=()=>{
    if(frame===null&&!running&&pending)frame=requestFrame(flush);
  };
  function flush() {
    frame=null;
    if(!pending||!isOpen()){pending=false;return;}
    pending=false;running=true;
    Promise.resolve().then(render).catch(onError).finally(()=>{running=false;schedule();});
  }
  function request() {
    if(!isOpen())return;
    pending=true;schedule();
  }
  request.cancel=()=>{
    pending=false;
    if(frame!==null){cancelFrame(frame);frame=null;}
  };
  return request;
}
