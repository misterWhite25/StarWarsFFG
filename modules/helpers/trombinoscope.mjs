import {createSharedWindowSession} from './shared-window-session.mjs';
import {renderSharedWindowControls} from './shared-window-controls.mjs';

const scope = 'starwarsffg';
const enabled = () => game.settings.get(scope, 'enableTrombinoscope');
const entries = () => game.settings.get(scope, 'trombinoscopeEntries');
const boardWidth = 5600, boardHeight = 4900;
const origin = () => ({x:0, y:0, w:boardWidth, h:boardHeight});
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo,n));
const presets = new Map();
let session, app, queue = Promise.resolve();
const warn = error => ui.notifications.warn(error.message);
function save(edit) {
  if (!game.user.isGM || !enabled()) return;
  queue = queue.catch(warn).then(async () => {
    const next = structuredClone(entries());
    await edit(next);
    await game.settings.set(scope, 'trombinoscopeEntries', next);
  });
  return queue.catch(warn);
}
function view(value) {
  if (!value || !['x','y','w','h'].every(k => Number.isFinite(value[k]))) return origin();
  const w = clamp(value.w, 360, boardWidth);
  const h = w * boardHeight / boardWidth;
  return {x:clamp(value.x,0,boardWidth-w),y:clamp(value.y,0,boardHeight-h),w,h};
}
function svg(tag, attrs) {
  const node = document.createElementNS('http://www.w3.org/2000/svg',tag);
  for (const [key,value] of Object.entries(attrs)) node.setAttribute(key,value);
  return node;
}
function html(tag, text) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  return node;
}
function point(canvas,event) {
  const p = new DOMPoint(event.clientX,event.clientY).matrixTransform(canvas.getScreenCTM().inverse());
  return {x:Math.round(p.x),y:Math.round(p.y)};
}
const uuid = () => foundry.utils.randomID();
const canNavigate = () => !session?.state.open || session.canNavigate();
function toggleCross(id) {
  return save(rows => {
    const actor = rows.find(row => row.id === id && row.type === 'actor');
    if (actor) actor.dead = !actor.dead;
  });
}
function draw(entry) {
  const g = svg('g',{'data-key':entry.id, transform:'translate('+entry.x+' '+entry.y+')'});
  const t = svg('text', {fill:entry.color || '#f7f2df','font-size':entry.size || 16});
  t.textContent = entry.name;
  if (entry.type === 'label') {t.setAttribute('font-style','italic');if(entry.textWidth){t.setAttribute('textLength',entry.textWidth);t.setAttribute('lengthAdjust','spacingAndGlyphs');}g.append(t); return g;}
  const r = entry.r || 50;
  const mask = svg('clipPath',{id:'fred-circle-'+entry.id});
  mask.append(svg('circle',{r}));
  g.append(mask, svg('circle',{r:r+2,fill:'#c9ad75'}),svg('image',{href:entry.img,x:-r,y:-r,width:r*2,height:r*2,'clip-path':'url(#fred-circle-'+entry.id+')',preserveAspectRatio:'xMidYMid slice'}));
  if (entry.dead) g.append(svg('path',{d:'M-'+r+' -'+r+' L'+r+' '+r+' M'+r+' -'+r+' L-'+r+' '+r,stroke:'#db4237','stroke-width':7,opacity:.92,'pointer-events':'none'}));
  t.setAttribute('y',r+17); t.setAttribute('text-anchor','middle'); g.append(t);return g;
}
class Trombinoscope extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {id:'ffg-trombinoscope',window:{title:'Trombinoscope',resizable:true,icon:'fa-solid fa-address-book'},position:{width:1080,height:760}};
  camera = origin();
  selected = null;
  editing = false;
  marking = false;
  noteDrafts = new Map();

  renderNote(panel, entry, dismiss) {
    panel.replaceChildren();
    const header = html('header');
    const heading = html('h2', entry?.name ?? 'Notes');
    heading.id = 'ffg-trombi-note-title';
    header.append(heading);
    panel.append(header);
    if (!entry) {
      const hint = html('p', 'Cliquez sur un pion pour afficher sa note.');
      hint.className = 'ffg-trombi-note-text';
      panel.append(hint);
      return;
    }

    const close = html('button');
    close.type = 'button';
    close.className = 'icon fa-solid fa-xmark';
    close.title = 'Fermer la note';
    close.setAttribute('aria-label', close.title);
    close.addEventListener('click', dismiss);
    header.append(close);

    const note = typeof entry.note === 'string' ? entry.note : '';
    if (!game.user.isGM) {
      const text = html('p', note || 'Aucune note pour ce pion.');
      text.className = 'ffg-trombi-note-text';
      panel.append(text);
      return;
    }

    const form = html('form');
    const label = html('label', 'Note');
    const input = html('textarea');
    input.id = 'ffg-trombi-note-input';
    label.htmlFor = input.id;
    input.rows = 8;
    input.placeholder = 'Ajouter une note pour ce pion…';
    input.value = this.noteDrafts.get(entry.id) ?? note;
    const submit = html('button', 'Enregistrer la note');
    submit.type = 'submit';
    let pending = false;
    const updateSubmit = () => { submit.disabled = pending || input.value.trim() === note; };
    updateSubmit();
    input.addEventListener('input', () => {
      if (input.value === note) this.noteDrafts.delete(entry.id);
      else this.noteDrafts.set(entry.id, input.value);
      updateSubmit();
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (submit.disabled) return;
      const value = input.value.trim();
      pending = true;
      updateSubmit();
      try {
        await save(rows => {
          const row = rows.find(item => item.id === entry.id && item.type === 'actor');
          if (!row) return;
          if (value) row.note = value;
          else delete row.note;
        });
        if (this.noteDrafts.get(entry.id)?.trim() === value &&
            (entries().find(row => row.id === entry.id)?.note ?? '') === value) {
          this.noteDrafts.delete(entry.id);
        }
      } finally {
        pending = false;
        updateSubmit();
      }
    });
    form.append(label, input, submit);
    panel.append(form);
  }

  async _renderHTML() {
    const root = html('section');
    root.className='ffg-trombi';
    const nav=html('nav');
    const board=svg('svg',{role:'img','aria-label':'Trombinoscope','class':'ffg-trombi-board',preserveAspectRatio:'xMidYMid meet'});
    const stage = html('div');
    stage.className = 'ffg-trombi-stage';
    const panel = html('aside');
    panel.className = 'ffg-trombi-note';
    panel.setAttribute('aria-labelledby', 'ffg-trombi-note-title');
    const highlight = () => {
      for (const item of board.querySelectorAll('g[data-key]')) {
        item.classList.toggle('selected', !this.marking && item.dataset.key === this.selected);
      }
    };
    const showNote = () => {
      highlight();
      const entry = !this.marking && entries().find(row => row.id === this.selected && row.type === 'actor');
      this.renderNote(panel, entry, () => {
        this.selected = null;
        if (this.editing) return this.render({force:true});
        showNote();
      });
    };
    const action=(text,fn,disabled=false)=>{
      const b=html('button',text);b.type='button';b.disabled=disabled;
      b.addEventListener('click',()=>Promise.resolve(fn()).catch(warn));nav.append(b);
      return b;
    };
    const redraw=()=>{
      board.replaceChildren(...entries().map(draw));
      highlight();
      const c=this.camera;board.setAttribute('viewBox',[c.x,c.y,c.w,c.h].join(' '));
    };
    const updateCamera=(v)=>{this.camera=view(v);board.setAttribute('viewBox',Object.values(this.camera).join(' '));if(session?.canNavigate())session.publishView(this.camera);};
    const zoom=(scale,p)=>{if(!canNavigate())return;const c=this.camera,w=clamp(c.w*scale,360,boardWidth),ratio=w/c.w;
      p??={x:c.x+c.w/2,y:c.y+c.h/2};updateCamera({x:p.x-(p.x-c.x)*ratio,y:p.y-(p.y-c.y)*ratio,w,h:c.h*ratio});};
    const refresh=()=>this.render({force:true});
    action('−',()=>zoom(1.35),!canNavigate());action('+',()=>zoom(1/1.35),!canNavigate());
    action('Vue d’ensemble',()=>updateCamera(origin()),!canNavigate());
    if(game.user.isGM) {
      action(this.editing?'Terminer':'Modifier',()=>{this.editing=!this.editing;this.marking=false;return refresh();});
      const marker=action('Croix rouge',()=>{this.marking=!this.marking;this.editing=false;return refresh();});
      marker.setAttribute('aria-pressed',String(this.marking));
      marker.title='Ajouter ou retirer la croix de décès sur un portrait';
      action(session?.state.open?'Arrêter le partage':'Vue partagée',()=>session.request(session.state.open?'close':'open',{view:this.camera}));
      if(this.editing){
        action('Ajouter les jetons sélectionnés',async()=>{
          const selection=canvas.tokens?.controlled?.filter(token=>token.actor)??[];
          if(!selection.length)return ui.notifications.info('Sélectionnez un ou plusieurs jetons sur la table.');
          await save(a=>{selection.forEach((token,i)=>a.push({id:uuid(),type:'actor',uuid:token.actor.uuid,name:token.document.name,img:token.document.texture.src||token.actor.img,
            x:clamp(Math.round(this.camera.x+this.camera.w/2)+(i%8)*120,50,boardWidth-50),y:clamp(Math.round(this.camera.y+this.camera.h/2)+Math.floor(i/8)*140,50,boardHeight-75),r:50}));});
        });
        action('Ajouter un libellé',async()=>{const name=(await this.textPrompt('Ajouter un libellé',''))?.trim();if(name)await save(a=>a.push({type:'label',id:uuid(),name,x:Math.round(this.camera.x+this.camera.w/2),y:Math.round(this.camera.y+this.camera.h/2),color:'#dec892',size:40}));});
        const chosen=entries().find(e=>e.id===this.selected);
        if(chosen){
          action('Renommer',async()=>{const name=(await this.textPrompt('Renommer',chosen.name))?.trim();if(name)await save(a=>{const e=a.find(v=>v.id===chosen.id);if(e)e.name=name;});});
          if(chosen.type==='actor')action(chosen.dead?'Retirer la croix rouge':'Ajouter la croix rouge',()=>toggleCross(chosen.id));
          action('Retirer du tableau',()=>save(a=>{const i=a.findIndex(e=>e.id===chosen.id);if(i>=0)a.splice(i,1);this.noteDrafts.delete(chosen.id);this.selected=null;}));
        }
        for(const preset of presets.values())action('Ajouter '+preset.name,async()=>{
          const incoming=await preset.load();await save(a=>{const ids=new Set(a.map(e=>e.id));for(const e of incoming)if(!ids.has(e.id))a.push(e);});
        });
      }
    }
    root.append(nav);
    if(this.marking)root.append(html('p','Cliquez sur un portrait pour ajouter ou retirer sa croix de décès. Cliquez de nouveau sur « Croix rouge » pour terminer.'));
    if(this.editing)root.append(html('p','Glissez un acteur du répertoire, du compendium ou un jeton de la table sur le tableau. Sélectionnez un élément pour le modifier ou faites-le glisser pour le déplacer.'));
    stage.append(board, panel);
    root.append(stage);
    redraw();
    showNote();
    const moveCamera=c=>{this.camera=view(c);board.setAttribute('viewBox',Object.values(this.camera).join(' '));};
    this.follow=c=>moveCamera(c);
    board.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY>0?1.2:1/1.2,point(board,e));},{passive:false});
    let drag;
    board.addEventListener('pointerdown',e=>{
      if(e.button!==0)return;
      const item=e.target.closest('[data-key]'),entry=item&&entries().find(v=>v.id===item.dataset.key);
      drag={id:e.pointerId,start:point(board,e),client:[e.clientX,e.clientY],camera:{...this.camera},el:item,entry};
    });
    board.addEventListener('pointermove',e=>{
      if(drag?.id!==e.pointerId)return;
      if(Math.hypot(e.clientX-drag.client[0],e.clientY-drag.client[1])<3&&!board.hasPointerCapture(e.pointerId))return;
      drag.moved=true;
      if (!canNavigate() && !this.editing) return;
      if(!board.hasPointerCapture(e.pointerId))board.setPointerCapture(e.pointerId);
      const p=point(board,e);
      if(this.editing&&drag.entry){
        drag.x=clamp(drag.entry.x+p.x-drag.start.x,0,boardWidth);drag.y=clamp(drag.entry.y+p.y-drag.start.y,0,boardHeight);
        drag.el.setAttribute('transform','translate('+drag.x+' '+drag.y+')');
      }else if(canNavigate()){
        const scale=board.getScreenCTM().a;
        updateCamera({...drag.camera,x:drag.camera.x-(e.clientX-drag.client[0])/scale,y:drag.camera.y-(e.clientY-drag.client[1])/scale});
      }
    });
    board.addEventListener('pointercancel',()=>{drag=null;redraw();});
    board.addEventListener('pointerup',async e=>{
      if(drag?.id!==e.pointerId)return;
      const d=drag;drag=null;
      const clicked = !d.moved && Math.hypot(e.clientX-d.client[0], e.clientY-d.client[1]) < 3;
      if(this.marking && game.user.isGM){
        if (clicked && d.entry?.type === 'actor') await toggleCross(d.entry.id);
        return;
      }
      if(this.editing&&game.user.isGM){this.selected=d.entry?.id??null;
        if(d.entry&&d.x!==undefined&&Math.hypot(d.x-d.entry.x,d.y-d.entry.y)>2)
          await save(a=>{const v=a.find(e=>e.id===d.entry.id);if(v){v.x=d.x;v.y=d.y;}});
        else await refresh();
      } else if (clicked) {
        this.selected = d.entry?.type === 'actor' ? d.entry.id : null;
        showNote();
      }
    });
    board.addEventListener('dblclick',async e=>{
      if(this.editing||this.marking)return;
      const entry=entries().find(row=>row.id===e.target.closest('[data-key]')?.dataset.key);
      if(!entry?.uuid)return;
      try{const actor=await fromUuid(entry.uuid);if(actor?.testUserPermission(game.user,'LIMITED'))return actor.sheet.render({force:true});
        new foundry.applications.apps.ImagePopout({src:entry.img,window:{title:entry.name}}).render({force:true});}catch(error){warn(error);}
    });
    board.addEventListener('dragover',e=>{if(game.user.isGM&&this.editing)e.preventDefault();});
    board.addEventListener('drop',async e=>{
      if(!game.user.isGM||!this.editing)return;e.preventDefault();
      try{const p=point(board,e),data=foundry.applications.ux.TextEditor.implementation.getDragEventData(e);
        const doc=data.uuid?await fromUuid(data.uuid):null;
        const actor=doc?.documentName==='Token'?doc.actor:doc;
        if(actor?.documentName!=='Actor')return;
        await save(a=>a.push({id:uuid(),type:'actor',uuid:actor.uuid,name:doc.name,img:doc.texture?.src||actor.prototypeToken?.texture?.src||actor.img,x:clamp(p.x,0,boardWidth),y:clamp(p.y,0,boardHeight),r:50}));
      }catch(error){warn(error);}
    });
    return root;
  }
  async textPrompt(title,initial){
    return foundry.applications.api.DialogV2.prompt({window:{title},content:'<label>Libellé <input name="label" maxlength="120" required></label>',render:(_event,dialog)=>{const input=dialog.element.querySelector('input');input.value=initial;input.focus();input.select();},ok:{label:'Enregistrer',callback:(_e,b)=>b.form.elements.label.value},rejectClose:false});
  }
  _replaceHTML(result,content){content.replaceChildren(result);}
  async _onClose(options){
    await super._onClose(options);
    if(session?.state.open && (game.user.isGM || session.canNavigate())){
      await session.request('close').catch(warn);
    }
  }
}
function openBoard(){if(!enabled())return;app??=new Trombinoscope();return app.render({force:true});}
function pilotage(){
  if(!session||!enabled())return;
  renderSharedWindowControls('trombinoscope',{title:'Trombinoscope',shared:session.state.open,open:session.state.open,ownerId:session.state.navigatorId,ownerLabel:'Navigation',ownerAria:'Responsable du trombinoscope',
    onModeChange:on=>session.request(on?'open':'close',{view:app?.camera||origin()}),onOwnerChange:target=>session.request('handoff',{target}),refresh:pilotage});
}
Hooks.once('init',()=>{
  const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('../../styles/trombinoscope.css',import.meta.url).href;document.head.append(css);
  game.settings.register(scope,'enableTrombinoscope',{name:'Activer le trombinoscope',hint:'Affiche le bouton du trombinoscope dans la barre de gauche.',scope:'world',config:true,type:Boolean,default:false,requiresReload:true});
  game.settings.register(scope,'trombinoscopeEntries',{scope:'world',config:false,type:Array,default:[],onChange:()=>{if(app?.rendered)app.render({force:true});}});
});
Hooks.on('renderSceneControls',(_app,htmlRoot)=>{
  if(!enabled())return;const root=htmlRoot?.[0]??htmlRoot;
  const menu=root?.querySelector('#scene-controls-layers > menu, [data-application-part="layers"] > menu, menu');
  if(!menu||menu.querySelector('[data-trombinoscope]'))return;
  const li=html('li'),btn=html('button');btn.type='button';btn.dataset.trombinoscope='';btn.className='ui-control icon fa-solid fa-address-book';btn.title='Trombinoscope';btn.setAttribute('aria-label','Trombinoscope');btn.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();openBoard();});li.append(btn);menu.append(li);
});
Hooks.on('renderPilotageMJ',pilotage);
Hooks.once('ready',async()=>{
  if(!enabled())return;
  Hooks.callAll('starwarsffgTrombinoscopePresets',presets);
  let wasShared=false,navigatorId=null,painting=Promise.resolve();
  session=createSharedWindowSession({scope,stateKey:'trombinoscopeSession',requestKey:'trombinoscopeRequest',initialView:true,sanitizeView:view,
    validateRequest:({user,request})=>{if(request.action==='open'&&!user.isGM)throw Error('Seul le MJ peut lancer le partage.');},
    validateState:(user,s)=>s.writerId===user.id&&(user.isGM||game.users.activeGM?.id===user.id),
    onState:s=>{painting=painting.catch(warn).then(async()=>{if(s.open){app??=new Trombinoscope();app.camera=view(s.view);if(!wasShared||!app.rendered||s.navigatorId!==navigatorId)await openBoard();else app.follow?.(app.camera);}else if(wasShared&&app?.rendered)await app.close();wasShared=s.open;navigatorId=s.navigatorId;pilotage();});return painting;},onError:warn});
  await session.start();
});
