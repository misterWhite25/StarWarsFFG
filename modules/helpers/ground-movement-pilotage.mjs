import {modes,movementMode,enabledMovementModes,setSceneMovementMode} from './ground-movement-state.mjs';

const panels=new Map();
const el=(tag,css,text)=>{const node=document.createElement(tag);if(css)node.className=css;if(text!==undefined)node.textContent=text;return node;};

function buildPanel(panel,state){
 const heading=el('header','pilotage-movement-heading'),title=el('h3','',game.i18n.localize('SWFFG.UI.Ground.MovementAndRanges'));
 const icon=el('i','fa-solid fa-person-walking');icon.setAttribute('aria-hidden','true');title.prepend(icon);heading.append(title);
 const switcher=el('div','pilotage-movement-switch');switcher.setAttribute('role','group');switcher.setAttribute('aria-label',game.i18n.localize('SWFFG.UI.Ground.SceneMovementMode'));
 state.choices=new Map();
 for(const value of ['narrative','battlemap','none']){
  const choice=el('button','',game.i18n.localize(value==='none'?'SWFFG.UI.Ground.Disabled':modes[value]));choice.type='button';choice.dataset.pilotageMovementMode=value;
  choice.addEventListener('click',async event=>{
   event.preventDefault();event.stopPropagation();
   const scene=globalThis.canvas?.scene;
   if(state.busy||!scene||canvas.loading||value===movementMode(scene))return;
   if(value!=='none'&&!enabledMovementModes().includes(value))return;
   state.busy=true;refreshPanel(panel,state);
   try{await setSceneMovementMode(scene,value);}catch(error){ui.notifications.warn(error.message);}
   finally{state.busy=false;if(panel.isConnected)refreshPanel(panel,state);}
  });
  state.choices.set(value,choice);switcher.append(choice);
 }
 state.ranges=el('button','pilotage-movement-ranges',game.i18n.localize('SWFFG.UI.Ground.DistancesAndRanges'));state.ranges.type='button';
 state.ranges.addEventListener('click',async()=>{const {showGroundRangeSettings}=await import('./ground-range-settings.mjs');await showGroundRangeSettings();});
 state.note=el('p','pilotage-note',game.i18n.localize('SWFFG.UI.Ground.OpenSceneToChooseMode'));
 panel.append(heading,switcher,state.ranges,state.note);
}

function refreshPanel(panel,state){
 if(!state.choices)buildPanel(panel,state);
 const scene=globalThis.canvas?.scene,enabled=enabledMovementModes(),mode=movementMode(scene),loading=!!state.loading;
 panel.hidden=enabled.length===0&&mode==='none';panel.setAttribute('aria-busy',String(state.busy));
 for(const [value,choice]of state.choices){
  const unavailable=value!=='none'&&!enabled.includes(value);
  choice.setAttribute('aria-pressed',String(value===mode));
  choice.disabled=!scene||loading||unavailable||value===mode;
  choice.setAttribute('aria-disabled',String(choice.disabled||state.busy));
  if(unavailable)choice.title=game.i18n.localize('SWFFG.UI.Ground.EnableModeInSettings');else choice.removeAttribute('title');
 }
 state.ranges.disabled=loading;state.note.hidden=!!scene;
}

export function setupPilotageMovement(root){
 if(!game.user.isGM||root.querySelector('.pilotage-movement'))return;
 const columns=root.querySelector('.pilotage-columns'),difficulty=columns?.querySelector('.pilotage-difficulty-section'),views=root.querySelector('.pilotage-views-content');if(!difficulty||!views)return;
 const panel=el('section','pilotage-card pilotage-movement'),state={busy:false,loading:!!globalThis.canvas?.loading};panel.setAttribute('aria-label',game.i18n.localize('SWFFG.UI.Ground.MovementAndRanges'));
 const sidebar=el('div','pilotage-left-column');difficulty.before(sidebar);sidebar.append(difficulty);views.append(panel);
 panels.set(panel,state);refreshPanel(panel,state);
}

function refreshPanels(){
 for(const [panel,state]of panels){if(!panel.isConnected){panels.delete(panel);continue;}refreshPanel(panel,state);}
}
Hooks.on('canvasReady',()=>{for(const state of panels.values())state.loading=false;refreshPanels();});
Hooks.on('canvasTearDown',()=>{for(const [panel,state]of panels){state.loading=true;if(panel.isConnected)refreshPanel(panel,state);}});
Hooks.on('updateScene',scene=>{if(scene.id===globalThis.canvas?.scene?.id)refreshPanels();});
for(const hook of ['createSetting','updateSetting'])Hooks.on(hook,setting=>{
 if(['enableNarrativeMovement','enableBattlemapMovement','groundMovementModesMigrated','groundMovementMode'].some(key=>setting.key==='starwarsffg.'+key))refreshPanels();
});
Hooks.on('closeDialogV2',app=>{for(const [panel]of panels)if(app.element?.contains(panel)||!panel.isConnected)panels.delete(panel);});
