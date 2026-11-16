export const SHIP_ICONS = Object.freeze([
  ['yt-1300', 'YT-1300'], ['yt-2400', 'YT-2400'], ['ghtroc-720', 'Ghtroc 720'],
  ['vcx-100', 'VCX-100'], ['hwk-290', 'HWK-290'], ['x-wing', 'X-wing'],
  ['y-wing', 'Y-wing'], ['a-wing', 'A-wing'], ['tie-fighter', 'TIE'],
  ['tie-interceptor', 'SWFFG.UI.Vehicle.TIEInterceptor'], ['lambda', 'SWFFG.UI.Vehicle.LambdaShuttle'], ['cr90', 'SWFFG.UI.Vehicle.CR90Corvette'],
  ['imperial-class-i', 'SWFFG.UI.Vehicle.ImperialClassICruiser']
].map(([id, label]) => Object.freeze({id, get label(){return label.startsWith('SWFFG.')?game.i18n.localize(label):label;}})));
const choices = [{id:'default', get label(){return game.i18n.localize("SWFFG.UI.Vehicle.GenericIcon");}}, ...SHIP_ICONS];
const selected = ship => choices.find(choice => choice.id === ship.getFlag('starwarsffg', 'vehicleDeck')?.icon) ?? choices[0];
const image = id => new URL('../../images/ship-icons/'+id+'.svg', import.meta.url).href;

function glyph(choice) {
  const icon = document.createElement('span');
  icon.setAttribute('aria-hidden', 'true');
  if (choice.id === 'default') icon.className = 'fa-solid fa-shuttle-space';
  else {
    icon.className = 'ffg-ship-glyph';
    icon.style.setProperty('--ffg-ship-icon', `url("${image(choice.id)}")`);
  }
  return icon;
}

function drawPicker(app) {
  const ship = app.actor;
  const section = app.element?.matches?.('[data-vehicle-deck-sheet]') ? app.element : app.element?.querySelector('[data-vehicle-deck-sheet]');
  if (!section || ship?.type !== 'vehicle' || ship.pack || ship.isToken || !ship.isOwner || !app.isEditable) return;
  section.querySelector('.ffg-ship-icon-picker')?.remove();
  const details = document.createElement('details');
  details.className = 'ffg-ship-icon-picker';
  details.open = !!app.forceIconPickerOpen;
  const summary = document.createElement('summary');
  const current = selected(ship);
  summary.append(glyph(current), document.createTextNode(game.i18n.format('SWFFG.UI.Vehicle.MapIconFor',{name:current.label})));
  const grid = document.createElement('div');
  grid.className = 'ffg-ship-icon-grid';
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', game.i18n.localize("SWFFG.UI.Vehicle.MapButtonIconLower"));
  for (const choice of choices) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.shipIcon = choice.id;
    button.setAttribute('aria-pressed', String(choice.id === current.id));
    button.append(glyph(choice), document.createTextNode(choice.label));
    button.addEventListener('click', async event => {
      event.preventDefault(); event.stopPropagation();
      if (!ship.isOwner || !app.isEditable) return;
      for (const option of grid.querySelectorAll('button')) option.disabled = true;
      let saved=false;
      try { await ship.setFlag('starwarsffg', 'vehicleDeck.icon', choice.id); saved=true; }
      catch (error) { ui.notifications.warn(error.message); }
      finally { if(saved && app.onIconSaved)app.onIconSaved();else drawPicker(app); }
    });
    grid.append(button);
  }
  details.append(summary, grid);
  const mode = section.querySelector('.ffg-deck-mode');
  if (mode) mode.after(details);
  else section.append(details);
}

let observer, watched, frame;
function refreshControls() {
  const root = document.getElementById('scene-controls');
  if (root !== watched) {
    observer?.disconnect(); watched = root;
    if (root) {
      observer = new MutationObserver(schedule);
      observer.observe(root, {childList:true, subtree:true});
    }
  }
  if (!root) return;
  for (const row of root.querySelectorAll('li[data-deck-ship]')) {
    const ship = game.actors.get(row.dataset.deckShip), button = row.querySelector('button');
    if (!ship || !button) continue;
    const choice = selected(ship);
    button.classList.toggle('ffg-ship-silhouette', choice.id !== 'default');
    if (choice.id === 'default') button.style.removeProperty('--ffg-ship-icon');
    else button.style.setProperty('--ffg-ship-icon', `url("${image(choice.id)}")`);
  }
}
function schedule() {
  if (frame) return;
  frame = requestAnimationFrame(() => {frame = null; refreshControls();});
}

Hooks.once('init', () => {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('../../styles/vehicle-deck-icons.css', import.meta.url).href;
  document.head.append(link);
});
Hooks.once('ready', schedule);
Hooks.on('renderSceneControls', schedule);
// Wait until the existing deck section has been filled by its own render hook.
Hooks.on('renderActorSheetFFGV2', app => queueMicrotask(() => drawPicker(app)));
Hooks.on('updateActor', actor => {if (actor.type === 'vehicle') schedule();});

export function shipIconGlyph(ship){return glyph(selected(ship));}

export async function showShipIconPicker(ship){
  if(!ship.isOwner || ship.type!=='vehicle' || ship.isToken || ship.pack)return;
  const section=document.createElement('div');
  section.dataset.vehicleDeckSheet='';
  const content=document.createElement('div');content.append(section);
  let dialog;
  const picker={actor:ship,element:section,isEditable:true,forceIconPickerOpen:true,onIconSaved:()=>dialog.close()};
  drawPicker(picker);
  dialog=new foundry.applications.api.DialogV2({
    classes:['ffg-ship-icon-dialog'],
    window:{title:game.i18n.localize("SWFFG.UI.Vehicle.MapButtonIcon")},position:{width:560},
    content,buttons:[{action:'close',label:game.i18n.localize("SWFFG.UI.Vehicle.Close")}]
  });
  await dialog.render({force:true});
  picker.element=dialog.element;
  drawPicker(picker);
}
