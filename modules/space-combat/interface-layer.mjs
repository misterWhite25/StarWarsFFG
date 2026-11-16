// Keep the tactical view below Foundry UI and clear of its expandable sidebar.
export function fitBehindInterface(element) {
  const host=document.getElementById("interface");
  if(!host)return ()=>{};
  let frame=null,disposed=false;
  const bounds=node=>{
    if(!node)return null;
    const style=getComputedStyle(node),rect=node.getBoundingClientRect();
    return style.display!=="none"&&style.visibility!=="hidden"&&rect.width>0&&rect.height>0?rect:null;
  };
  function update() {
    frame=null;if(disposed||!element.isConnected)return;
    const view=host.getBoundingClientRect();
    const controls=bounds(document.getElementById("scene-controls"));
    const navigation=document.getElementById("scene-navigation");
    const navigationRects=[...navigation?.querySelectorAll("[data-action]")??[]].map(bounds).filter(Boolean);
    const sidebar=bounds(document.getElementById("sidebar"));
    const hotbar=bounds(document.getElementById("hotbar"));
    const chat=bounds(document.getElementById("chat-message"));
    const panel=bounds(element.querySelector(".sc-side"));
    const field=bounds(element.querySelector(".sc-field"));
    const players=document.getElementById("players");
    const playerRects=[players,...players?.querySelectorAll("*")??[]].map(bounds).filter(Boolean);
    const controlRight=controls?controls.right-view.left:0;
    const playerRight=Math.max(0,...playerRects.map(rect=>rect.right-view.left));
    const navigationRight=Math.max(controlRight,...navigationRects.map(rect=>rect.right-view.left));
    const besideNavigation=field&&field.right-view.left-navigationRight>=180;
    const panelBottom=Math.max(0,...[chat,hotbar].filter(rect=>rect&&panel&&rect.left<panel.right&&rect.right>panel.left).map(rect=>view.bottom-rect.top+10));
    const values={
      "--sc-ui-right":sidebar?Math.max(0,view.right-sidebar.left):0,
      "--sc-ui-left":Math.max(16,besideNavigation?navigationRight:controlRight),
      "--sc-ui-tools-left":Math.max(16,controlRight,playerRight),
      "--sc-ui-top":besideNavigation?0:Math.min(view.height-60,Math.max(0,...navigationRects.map(rect=>rect.bottom-view.top))),
      "--sc-ui-bottom":hotbar?Math.max(0,view.bottom-hotbar.top):0,
      "--sc-ui-card-bottom":panelBottom
    };
    for(const [name,value] of Object.entries(values)) {
      const css=Math.ceil(value)+"px";
      if(element.style.getPropertyValue(name)!==css)element.style.setProperty(name,css);
    }
  }
  function schedule() {if(!disposed&&frame===null)frame=requestAnimationFrame(update);}
  const resize=new ResizeObserver(schedule);
  for(const id of ["interface","sidebar","scene-controls","scene-navigation","hotbar","players","chat-message"]) {
    const node=document.getElementById(id);if(node)resize.observe(node);
  }
  const mutations=new MutationObserver(schedule);
  for(const id of ["ui-left","ui-middle","ui-right"]) {
    const node=document.getElementById(id);
    if(node)mutations.observe(node,{subtree:true,childList:true,attributes:true,attributeFilter:["class","style","hidden"]});
  }
  window.addEventListener("resize",schedule);
  update();
  return ()=>{
    disposed=true;resize.disconnect();mutations.disconnect();window.removeEventListener("resize",schedule);
    if(frame!==null)cancelAnimationFrame(frame);
  };
}
