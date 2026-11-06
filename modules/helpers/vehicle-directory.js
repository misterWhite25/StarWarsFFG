/** Separate views of the same Actor documents; no folders or actors are moved. */
export function isNpcActor(actor) {
  if(actor.type==='vehicle')return false;
  return actor.flags?.starwarsffg?.npcDirectory ?? ['minion','rival','nemesis'].includes(actor.type);
}
export function actorDirectoryGroup(actor) {return actor.type==='vehicle'?'vehicles':isNpcActor(actor)?'npcs':'actors';}
export function filterActorTree(tree, vehicles) {
  const entries = tree.entries.filter(actor => actorDirectoryGroup(actor) === (vehicles===true?'vehicles':vehicles===false?'actors':vehicles));
  const children = tree.children.map(child => filterActorTree(child, vehicles))
    .filter(child => child.visible);
  const empty = tree.entries.length === 0 && tree.children.length === 0;
  return {...tree, entries, children, visible: tree.visible && (tree.root || empty || entries.length > 0 || children.length > 0)};
}

export function createDirectoryClasses(Base) {
  class ManagedActorDirectory extends Base {
    async _getDroppedEntryFromData(data){
      const entry=await super._getDroppedEntryFromData(data);
      if(!entry)return entry;
      if(entry.type==='vehicle'){
        ui.notifications.warn(game.i18n.localize('SWFFG.NpcDirectory.DropCharacterOnly'));return null;
      }
      if(!game.user.isGM&&actorDirectoryGroup(entry)!==this.constructor.tabName)return null;
      return entry;
    }
    async _handleDroppedEntry(target,data){
      const entry=await this._getDroppedEntryFromData(data);
      if(!entry)return;
      if(!entry.pack&&game.actors.get(entry.id)===entry&&actorDirectoryGroup(entry)!==this.constructor.tabName){
        await moveActorDirectory(entry,this.constructor.tabName);
      }
      return super._handleDroppedEntry(target,data);
    }
    _createDroppedEntry(entry,updates={}){
      const npc=this.constructor.tabName==='npcs';
      return super._createDroppedEntry(entry,{...updates,flags:{...entry.flags,...updates.flags,starwarsffg:{...entry.flags?.starwarsffg,...updates.flags?.starwarsffg,npcDirectory:npc}}});
    }

    _getEntryContextOptions(){
      const options=super._getEntryContextOptions();
      const npc=this.constructor.tabName==='npcs';
      options.push({label:npc?'SWFFG.NpcDirectory.MoveToPlayers':'SWFFG.NpcDirectory.MoveToNpcs',icon:'fa-solid fa-user',
        visible:li=>game.user.isGM&&this.collection.get(li.dataset.entryId)?.type!=='vehicle',
        onClick:async(event,li)=>{
          if(!game.user.isGM)return;
          const actor=this.collection.get(li.dataset.entryId);
          if(!actor||actor.type==='vehicle')return;
          await moveActorDirectory(actor, npc ? 'actors' : 'npcs');
        }});
      return options;
    }
  }
  class CharacterDirectory extends ManagedActorDirectory {
    _onCreateEntry(event,target){
      event.stopPropagation();
      const folder=target.closest('.directory-item')?.dataset.folderId??null;
      return this.documentClass.createDialog({type:'character',folder},{},{classes:['ffg-actor-create-dialog']});
    }
    async _prepareDirectoryContext(context, options) {
      await super._prepareDirectoryContext(context, options);
      context.tree = filterActorTree(context.tree, false);
    }
  }
  class NpcDirectory extends ManagedActorDirectory {
    static tabName='npcs';
    static DEFAULT_OPTIONS={id:'npcs'};
    get title(){return game.i18n.localize('SWFFG.NpcDirectory.Title');}
    _canRender(options){if(!game.user.isGM)return false;return super._canRender(options);}
    async _prepareDirectoryContext(context,options){
      await super._prepareDirectoryContext(context,options);
      context.tree=filterActorTree(context.tree,'npcs');
    }
    async _prepareHeaderContext(context,options){
      await super._prepareHeaderContext(context,options);
      context.searchMode.placeholder=game.i18n.localize('SWFFG.NpcDirectory.Search');
    }
    async _onRender(context,options){
      await super._onRender(context,options);
      for(const button of this.element.querySelectorAll('[data-action="createEntry"]')){
        const label=game.i18n.localize('SWFFG.NpcDirectory.Create');
        if(!button.classList.contains('create-button')){
          const icon=button.querySelector('i');button.replaceChildren(...(icon?[icon]:[]),document.createTextNode(' '+label));
        }
        button.setAttribute('aria-label',label);
      }
    }
    _onCreateEntry(event,target){
      event.stopPropagation();if(!game.user.isGM)return;
      const folder=target.closest('.directory-item')?.dataset.folderId??null;
      return this.documentClass.createDialog({type:'rival',folder,flags:{starwarsffg:{npcDirectory:true}}},{},{classes:['ffg-actor-create-dialog']});
    }
    async _getDroppedEntryFromData(data){
      if(!game.user.isGM)return null;
      return super._getDroppedEntryFromData(data);
    }
  }
  class VehicleDirectory extends Base {
    static tabName = 'vehicles';
    static DEFAULT_OPTIONS = {id: 'vehicles'};
    get title() { return game.i18n.localize('SWFFG.VehicleDirectory.Title'); }
    async _prepareDirectoryContext(context, options) {
      await super._prepareDirectoryContext(context, options);
      context.tree = filterActorTree(context.tree, true);
    }
    async _prepareHeaderContext(context, options) {
      await super._prepareHeaderContext(context, options);
      context.searchMode.placeholder = game.i18n.localize('SWFFG.VehicleDirectory.Search');
    }
    async _onRender(context, options) {
      await super._onRender(context, options);
      for (const button of this.element.querySelectorAll('[data-action="createEntry"]')) {
        const label = game.i18n.localize('SWFFG.VehicleDirectory.Create');
        if (!button.classList.contains('create-button')) {
          const icon = button.querySelector('i');
          button.replaceChildren(...(icon ? [icon] : []), document.createTextNode(` ${label}`));
        }
        button.setAttribute('aria-label', label);
      }
    }
    _onCreateEntry(event, target) {
      event.stopPropagation();
      const folder = target.closest('.directory-item')?.dataset.folderId ?? null;
      return this.documentClass.createDialog({type: 'vehicle', folder}, {}, {types: ['vehicle'],classes:['ffg-actor-create-dialog']});
    }
    async _getDroppedEntryFromData(data) {
      const entry = await super._getDroppedEntryFromData(data);
      if (entry && entry.type !== 'vehicle') {
        ui.notifications.warn(game.i18n.localize('SWFFG.VehicleDirectory.VehiclesOnly'));
        return null;
      }
      return entry;
    }
  }
  return {CharacterDirectory, NpcDirectory, VehicleDirectory};
}

export function registerVehicleDirectory() {
  const Base = CONFIG.ui.actors;
  const {CharacterDirectory, NpcDirectory, VehicleDirectory} = createDirectoryClasses(Base);
  CONFIG.ui.actors = CharacterDirectory;
  CONFIG.ui.vehicles = VehicleDirectory;
  CONFIG.ui.npcs = NpcDirectory;
  const Sidebar = CONFIG.ui.sidebar;
  const tabs = {};
  for (const [key, value] of Object.entries(Sidebar.TABS)) {
    if(key==='npcs'||key==='vehicles')continue;
    tabs[key] = value;
    if (key === 'actors') {
      tabs.npcs={tooltip:'SWFFG.NpcDirectory.Title',gmOnly:true,icon:(value.icon??CONFIG.Actor.sidebarIcon)+' ffg-npc-actor-icon'};
      tabs.vehicles={tooltip:'SWFFG.VehicleDirectory.Title',icon:'ffg-xwing-icon'};
    }
  }
  Sidebar.TABS = tabs;
}

/** Reorder existing options only: keep native values, selection and change listeners. */
export const ACTOR_TYPE_ORDER=['character','nemesis','rival','minion','vehicle','homestead'];
export function orderActorCreationTypes(root){
  const select=root?.querySelector('select[name="type"]');
  if(!select)return;
  const selected=select.value;
  const options=Array.from(select.options);
  const rank=value=>{const index=ACTOR_TYPE_ORDER.indexOf(value);return index<0?ACTOR_TYPE_ORDER.length:index;};
  options.sort((a,b)=>rank(a.value)-rank(b.value));
  const rows=[];
  const split=options.findIndex(option=>['vehicle','homestead'].includes(option.value));
  for(let index=0;index<options.length;index++){
    if(index===split&&split>0)rows.push(document.createElement('hr'));
    rows.push(options[index]);
  }
  select.replaceChildren(...rows);
  select.value=selected;
}
if(globalThis.Hooks)Hooks.on('renderDialogV2',app=>{
  if(app.element?.classList.contains('ffg-actor-create-dialog'))orderActorCreationTypes(app.element);
});

/** Classify a world Actor without changing its type, folder, ownership or identity. */
export async function moveActorDirectory(actor,target){
  if(!game.user.isGM)throw Error(game.i18n.localize('SWFFG.NpcDirectory.DropGmOnly'));
  if(!['actors','npcs'].includes(target)||!actor||actor.type==='vehicle'||actor.pack||game.actors.get(actor.id)!==actor){
    throw Error(game.i18n.localize('SWFFG.NpcDirectory.DropCharacterOnly'));
  }
  if(actorDirectoryGroup(actor)!==target)await actor.setFlag('starwarsffg','npcDirectory',target==='npcs');
  for(const directory of [ui.actors,ui.npcs])directory?.render({force:true});
  return actor;
}

export async function dropActorOnDirectoryTab(event,target){
  let data;try{data=JSON.parse(event.dataTransfer.getData('text/plain'));}catch{return;}
  if(data.type!=='Actor')return;
  event.preventDefault();event.stopPropagation();
  if(!game.user.isGM)throw Error(game.i18n.localize('SWFFG.NpcDirectory.DropGmOnly'));
  const match=/^Actor\.([^.]+)$/.exec(data.uuid??'');
  const actor=game.actors.get(match?.[1]??(!data.uuid?data.id:null));
  if(actor)await moveActorDirectory(actor,target);
  else if(data.uuid?.startsWith('Compendium.'))await ui[target]?._handleDroppedEntry(null,data);
  else throw Error(game.i18n.localize('SWFFG.NpcDirectory.DropCharacterOnly'));
  ui.sidebar.changeTab(target,'primary');
}

export function activateActorDirectoryTabDrops(sidebar){
  if(!game.user.isGM)return;
  for(const tab of sidebar.element.querySelectorAll('#sidebar-tabs [data-tab="actors"], #sidebar-tabs [data-tab="npcs"]')){
    if(tab.dataset.ffgActorDropBound)continue;
    tab.dataset.ffgActorDropBound='true';
    let timer;
    tab.addEventListener('dragover',event=>{
      if(!Array.from(event.dataTransfer?.types??[]).includes('text/plain'))return;
      event.preventDefault();event.dataTransfer.dropEffect='move';tab.classList.add('ffg-actor-drop-target');
      timer??=setTimeout(()=>{timer=null;ui.sidebar.changeTab(tab.dataset.tab,'primary');},400);
    });
    const clear=()=>{clearTimeout(timer);timer=null;tab.classList.remove('ffg-actor-drop-target');};
    tab.addEventListener('dragleave',clear);
    tab.addEventListener('drop',event=>{
      clear();void dropActorOnDirectoryTab(event,tab.dataset.tab).catch(error=>ui.notifications.warn(error.message));
    });
  }
}
if(globalThis.Hooks)Hooks.on('renderSidebar',activateActorDirectoryTabDrops);
