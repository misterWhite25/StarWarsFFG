import {setupNpcCommandPanel} from './npc-command.mjs';
import {setupPilotageMovement} from './ground-movement-pilotage.mjs';
let activeTab='views';

export function setupPilotageTabs(root,{onSelect}={}){
  if(!root||root.querySelector('.pilotage-tabs'))return;
  const columns=root.querySelector('.pilotage-columns');if(!columns)return;

  const nav=document.createElement('nav');nav.className='pilotage-tabs';nav.setAttribute('role','tablist');nav.setAttribute('aria-label',game.i18n.localize('SWFFG.UI.Pilotage.GMControl'));
  const panels=new Map(),buttons=new Map();
  for(const [id,label,icon] of [['views',game.i18n.localize('SWFFG.UI.Pilotage.ViewManagement'),'fa-window-restore'],['npcs','Combat','fa-users-gear']]){
    const control=document.createElement('button');control.type='button';control.id=root.id+'-tab-'+id;control.setAttribute('role','tab');control.setAttribute('aria-controls',root.id+'-panel-'+id);
    const glyph=document.createElement('i');glyph.className='fa-solid '+icon;glyph.setAttribute('aria-hidden','true');control.append(glyph,document.createTextNode(label));
    const panel=document.createElement('section');panel.id=root.id+'-panel-'+id;panel.dataset.pilotagePanel=id;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',control.id);
    control.addEventListener('click',()=>select(id));panels.set(id,panel);buttons.set(id,control);nav.append(control);
  }
  columns.before(nav,panels.get('views'),panels.get('npcs'));panels.get('views').append(columns);
  const editor=root.querySelector('.pilotage-editor'),views=columns.querySelector('.pilotage-scene-section');
  editor?.remove();views.replaceChildren();views.className='pilotage-views-content';
  const empty=document.createElement('p');empty.className='pilotage-views-empty';empty.textContent=game.i18n.localize('SWFFG.UI.Pilotage.NoSharedView');views.append(empty);
  const group=root.querySelector('.pilotage-shared-windows');if(group)views.prepend(group);
  setupPilotageMovement(root);
  setupNpcCommandPanel(panels.get('npcs'),{modifierEditor:editor,onSelect});
  function select(id){
    activeTab=id;
    for(const [key,button] of buttons){const selected=key===id;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;panels.get(key).hidden=!selected;}
    const app=[...foundry.applications.instances.values()].find(app=>app.element===root);
    app?.setPosition({width:Math.min(860,innerWidth-40),height:Math.min(800,innerHeight-50)});
  }
  nav.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const ids=[...panels.keys()],index=ids.indexOf(activeTab);
    const id=event.key==='Home'?ids[0]:event.key==='End'?ids.at(-1):ids[(index+(event.key==='ArrowRight'?1:-1)+ids.length)%ids.length];select(id);buttons.get(id).focus();
  });
  select(panels.has(activeTab)?activeTab:'views');
}
