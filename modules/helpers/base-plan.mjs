import {galleryTiles, arrangeGalleryTiles, gallerySides, galleryLayouts, galleryMargins, galleryPadding, normalizeGalleryLayout} from './plan-gallery-tiles.mjs';
import {supportsVehiclePlan} from './actor-types.mjs';
import {drawIllustrationEdge, illustrationEdges} from './illustration-edges.mjs';
import {movableHud} from './character-shortcut-position.mjs';
const supportsScenePlan = actor => actor?.type === 'homestead' || supportsVehiclePlan(actor);
const scope = 'starwarsffg';
const t = key => game.i18n.localize('SWFFG.BasePlan.' + key);
const flag = (doc, key) => doc?.getFlag(scope, key);
const baseId = scene => flag(scene, 'planBase');
const sceneFor = actor => game.scenes.find(scene => baseId(scene) === actor.id);
const canView = scene => scene && (scene.active || scene.testUserPermission(game.user, 'OBSERVER'));
const Dialog = () => foundry.applications.api.DialogV2;
const pending = new Set();
let panel, legendDrag, pins, placement;

export function basePlanContext(actor) {
  if (!supportsScenePlan(actor) || actor.pack || actor.isToken) return null;
  const scene = sceneFor(actor);
  const deckImage = supportsVehiclePlan(actor) && actor.testUserPermission(game.user,'OBSERVER') ? flag(actor,'vehicleDeck')?.image : '';
  if (!game.user.isGM && !canView(scene) && !deckImage) return null;
  const linked = canView(scene) ? scene : null;
  return {
    gm: game.user.isGM,
    name: linked?.name,
    caption: linked?.name || actor.name,
    shortcut: !!flag(scene, 'basePlanShortcut'),
    image: linked?.initialLevel?.background?.src || linked?.thumb || deckImage
  };
}

function element(tag, text) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  return node;
}

function button(label, icon, action) {
  const node = element('button');
  node.type = 'button';
  node.setAttribute('aria-label', label);
  node.title = label;
  const glyph = element('i');
  glyph.className = 'fa-solid fa-' + icon;
  glyph.setAttribute('aria-hidden', 'true');
  node.append(glyph);
  node.addEventListener('click', () => Promise.resolve().then(action).catch(report));
  return node;
}

function report(error) {
  console.error('Star Wars FFG | Base plan', error);
  ui.notifications.warn(error.message);
}

function field(form, label, input) {
  const wrapper = element('label', label);
  wrapper.className = 'ffg-plan-field';
  wrapper.append(input);
  form.append(wrapper);
}

async function chooseScene() {
  const content = element('div'), select = element('select');
  for (const scene of game.scenes.filter(s => !baseId(s)).sort((a,b) => a.name.localeCompare(b.name))) {
    select.add(new Option(scene.name, scene.id));
  }
  if (!select.length) { ui.notifications.info(t('NoScene')); return; }
  field(content,t('Scene'),select);
  return Dialog().prompt({window:{title:t('Link')},content,ok:{callback:(_event,button) => button.form.querySelector('select').value}});
}

function addGalleryLayout(content, actor, settings) {
  const initial = normalizeGalleryLayout(settings);
  const fields = element('div');
  fields.className = 'ffg-plan-gallery-layout';
  const selectField = (name, choices, value) => {
    const select = element('select');
    select.name = 'gallery' + name;
    for (const choice of choices) select.add(new Option(t('Gallery.' + choice), choice, choice === value));
    select.value = value;
    field(fields,t('Gallery.' + name),select);
    return select;
  };
  const side = selectField('Side',gallerySides,initial.side);
  const layout = selectField('Layout',galleryLayouts,initial.layout);
  layout.disabled = side.value === 'around';
  const range = element('div');
  range.className = 'ffg-plan-gallery-size';
  const size = element('input');
  Object.assign(size,{type:'range',name:'gallerySize',min:'25',max:'100',step:'5',defaultValue:String(initial.size)});
  const output = element('output',size.value + ' %');
  range.append(size,output);
  field(fields,t('Gallery.Size'),range);
  selectField('Margin',galleryMargins,initial.margin);
  selectField('Effect',illustrationEdges,initial.effect);
  const sample = Object.values(flag(actor,'baseGallery') ?? {}).find(image => image?.path);
  if (sample) {
    const preview = element('canvas');
    preview.className = 'ffg-plan-edge-preview';
    preview.dataset.src = foundry.utils.getRoute(sample.path);
    preview.setAttribute('aria-hidden','true');
    preview.hidden = true;
    fields.append(preview);
  }
  content.append(fields);
}

function bindGalleryLayout(_event, dialog) {
  const {gallerySide, galleryLayout, gallerySize, galleryEffect} = dialog.element.querySelector('form').elements;
  if (!gallerySide) return;
  gallerySide.addEventListener('change',() => { galleryLayout.disabled = gallerySide.value === 'around'; });
  const output = gallerySize.nextElementSibling;
  gallerySize.addEventListener('input',() => { output.value = gallerySize.value + ' %'; });
  const preview = dialog.element.querySelector('.ffg-plan-edge-preview');
  if (!preview) return;
  const image = new Image();
  const refresh = () => {
    if (!preview.isConnected) return;
    preview.hidden = !drawIllustrationEdge(preview,image,galleryEffect.value,420);
  };
  image.addEventListener('load',refresh,{once:true});
  galleryEffect.addEventListener('change',refresh);
  image.src = preview.dataset.src;
}

function readGalleryLayout(form) {
  const {gallerySide, galleryLayout, gallerySize, galleryMargin, galleryEffect} = form.elements;
  return normalizeGalleryLayout({
    side:gallerySide?.value, layout:galleryLayout?.value, size:gallerySize?.valueAsNumber,
    margin:galleryMargin?.value, effect:galleryEffect?.value
  });
}

async function configureGallery(actor, scene) {
  const content = element('div');
  addGalleryLayout(content,actor,flag(scene,'planGalleryLayout'));
  const settings = await Dialog().prompt({
    window:{title:t('ArrangeGallery')}, content, rejectClose:false, render:bindGalleryLayout,
    ok:{label:t('Gallery.Apply'),callback:(_event,button) => readGalleryLayout(button.form)}
  });
  if (!settings || sceneFor(actor) !== scene || !supportsScenePlan(actor)) return;
  const padding = galleryPadding(settings,scene.padding);
  if (padding > scene.padding) {
    await convertPlanPositions(scene);
    await scene.update({padding}, {autoReposition:true});
    if (scene.padding !== padding) return;
  }
  await arrangeGalleryTiles(actor,scene,settings);
  await scene.setFlag(scope,'planGalleryLayout',settings);
}

async function createScene(actor) {
  const content = element('div'), picker = element('file-picker');
  picker.setAttribute('type','image');
  picker.setAttribute('name','image');
  if (supportsVehiclePlan(actor)) picker.setAttribute('value', flag(actor,'vehicleDeck')?.image || '');
  field(content,t('Image'),picker);
  if (Object.keys(flag(actor,'baseGallery') ?? {}).length) addGalleryLayout(content,actor);
  const options = await Dialog().prompt({
    window:{title:t('Create')}, content, rejectClose:false, render:bindGalleryLayout,
    ok:{callback:(_event,button) => ({
      src:button.form.querySelector('file-picker').value?.trim(),
      layout:readGalleryLayout(button.form)
    })}
  });
  if (!options?.src) return;
  const {src,layout} = options;
  const img = new Image();
  img.src = src;
  try { await img.decode(); } catch { throw Error(t('InvalidImage')); }
  if (!supportsScenePlan(actor) || sceneFor(actor)) return;
  const ship = supportsVehiclePlan(actor);
  const folderKey = ship ? 'shipPlans' : 'basePlans';
  const folderName = t(ship ? 'ShipFolder' : 'Folder');
  let folder = game.folders.find(f => f.type === 'Scene' && (flag(f,folderKey) || (!f.folder && f.name === folderName)));
  folder ??= await Folder.create({type:'Scene',name:folderName,flags:{[scope]:{[folderKey]:true}}});
  if (!supportsScenePlan(actor) || sceneFor(actor)) return;
  const levelId = foundry.utils.randomID();
  const data = {name:actor.name,folder:folder.id,active:false,navigation:false,tokenVision:false,
    width:img.naturalWidth,height:img.naturalHeight,levels:[{_id:levelId,name:actor.name,background:{src,color:'#000000'}}],
    flags:{[scope]:{planBase:actor.id}}};
  if (Object.keys(flag(actor,'baseGallery') ?? {}).length) {
    const preview = new CONFIG.Scene.documentClass(data);
    data.padding = galleryPadding(layout,preview.padding);
    if (data.padding !== preview.padding) preview.updateSource({padding:data.padding});
    data.tiles = galleryTiles(actor, preview.getDimensions(), levelId, layout);
    data.flags[scope].planGalleryLayout = layout;
  }
  return Scene.create(data);
}

export async function basePlanAction(event, target) {
  event.preventDefault();
  const actor = this.actor, action = target.dataset.plan;
  if (!supportsScenePlan(actor) || actor.pack || actor.isToken || pending.has(actor.id)) return;
  pending.add(actor.id);
  try {
    const scene = sceneFor(actor);
    if (action === 'open' || action === 'activate') {
      if (!canView(scene) || (action === 'activate' && !game.user.isGM)) return;
      if (action === 'activate') await scene.activate({pullUsers:true});
      await scene.view();
      if (canvas.scene?.id === scene.id) await this.close();
    } else if (game.user.isGM) {
      if (action === 'create' && !scene) await createScene(actor);
      if (action === 'link' && !scene) {
        const selected = game.scenes.get(await chooseScene());
        if (supportsScenePlan(actor) && selected && !baseId(selected) && !sceneFor(actor)) await selected.setFlag(scope,'planBase',actor.id);
      }
      if (action === 'arrange-gallery' && scene) await configureGallery(actor,scene);
      if (action === 'shortcut' && scene) {
        await scene.setFlag(scope, 'basePlanShortcut', target.getAttribute('aria-pressed') !== 'true');
      }
      if (action === 'unlink' && scene && await Dialog().confirm({window:{title:t('Unlink')},content:t('UnlinkHint')})) {
        await scene.update({['flags.'+scope+'.-=planBase']:null, ['flags.'+scope+'.-=basePlanShortcut']:null});
      }
      await this.render();
    }
  } catch (error) { report(error); }
  finally { pending.delete(actor.id); }
}

function hasShortcut(scene) {
  return flag(scene, 'basePlanShortcut') && supportsScenePlan(game.actors.get(baseId(scene))) && canView(scene);
}

export function scenePlanShortcuts() {
  return game.scenes.filter(hasShortcut).sort((a,b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export function renderBasePlanShortcuts(menu, anchor, scenes) {
  const existing = new Map(Array.from(menu.querySelectorAll('li[data-base-plan-scene]'), row => [row.dataset.basePlanScene, row]));
  for (const scene of scenes) {
    let row = existing.get(scene.id);
    if (row) existing.delete(scene.id);
    else {
      row = element('li');
      row.dataset.basePlanScene = scene.id;
      const open = button(scene.name, supportsVehiclePlan(game.actors.get(baseId(scene))) ? 'shuttle-space' : 'location-dot', () => {
        const current = game.scenes.get(scene.id);
        if (current && hasShortcut(current)) return current.view();
      });
      open.className = 'ui-control icon';
      row.append(open);
    }
    const open = row.firstElementChild;
    const label = t('Open') + ' · ' + scene.name;
    open.title = open.dataset.tooltip = label;
    open.setAttribute('aria-label', label);
    if (anchor && anchor.nextElementSibling !== row) anchor.after(row);
    else if (!row.isConnected) menu.append(row);
    anchor = row;
  }
  for (const row of existing.values()) row.remove();
}

function journals(scene) {
  return game.journal.filter(entry => flag(entry,'planScene') === scene.id);
}

async function convertPlanPositions(scene) {
  const {sceneX,sceneY} = scene.getDimensions();
  for (const journal of journals(scene)) {
    const updates = [];
    for (const page of journal.pages) {
      const point = flag(page,'planPoint');
      if (!point || point.relative) continue;
      updates.push({_id:page.id, ['flags.'+scope+'.planPoint']:{
        ...point, x:point.x-sceneX, y:point.y-sceneY, relative:true
      }});
    }
    if (updates.length) await journal.updateEmbeddedDocuments('JournalEntryPage',updates);
  }
}

function markers(scene) {
  return journals(scene).flatMap(entry => entry.pages.filter(page =>
    flag(page,'planPoint') && page.testUserPermission(game.user,'OBSERVER')
  )).sort((a,b) => flag(a,'planPoint').number - flag(b,'planPoint').number || a.id.localeCompare(b.id));
}

function description(page) {
  const content = document.createElement('template');
  content.innerHTML = page?.text?.content || '';
  return content.content.textContent || '';
}

async function editMarker(scene, point, page) {
  if (!game.user.isGM) return;
  const content = element('div'), name = element('input'), notes = element('textarea'), privacy = element('input');
  name.required = true;
  name.name = 'markerName';
  notes.name = 'markerDescription';
  privacy.name = 'gmOnly';
  name.defaultValue = page?.name || '';
  notes.defaultValue = description(page);
  privacy.type = 'checkbox';
  privacy.defaultChecked = page ? page.ownership.default === 0 : true;
  field(content,t('Name'),name);
  field(content,t('Description'),notes);
  field(content,t('Private'),privacy);
  const values = await Dialog().prompt({window:{title:t(page?'Edit':'Add')},content,
    ok:{callback:(_event,button) => new FormData(button.form)}});
  const title = values?.get('markerName')?.trim();
  if (!title || !game.scenes.has(scene.id) || !baseId(scene)) return;
  const paragraph = element('p',values.get('markerDescription'));
  paragraph.style.textAlign = 'justify';
  paragraph.style.whiteSpace = 'pre-line';
  const data = {name:title,type:'text',text:{content:paragraph.outerHTML},
    ownership:{default:values.has('gmOnly') ? 0 : 2}};
  if (page) return page.update(data);
  let [journal] = journals(scene);
  if (!journal) journal = await JournalEntry.create({name:t('Legend')+' - '+scene.name,ownership:{default:2},
    flags:{[scope]:{planScene:scene.id}}},{renderSheet:false});
  const number = Math.max(0,...markers(scene).map(p => flag(p,'planPoint').number)) + 1;
  await journal.createEmbeddedDocuments('JournalEntryPage',[{...data,flags:{[scope]:{planPoint:{...point,number}}}}]);
}

function stopPlacement() { placement?.abort(); placement = undefined; }

function placeMarker(scene) {
  stopPlacement();
  const controller = placement = new AbortController();
  const board = canvas.app.view;
  board.classList.add('ffg-plan-placing');
  controller.signal.addEventListener('abort',() => board.classList.remove('ffg-plan-placing'),{once:true});
  const options = {signal:controller.signal,capture:true};
  document.addEventListener('keydown',event => {
    if (event.key === 'Escape') { event.stopImmediatePropagation(); stopPlacement(); }
  },options);
  document.addEventListener('pointerdown',event => {
    if (event.target !== board || event.button !== 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const {x,y} = canvas.canvasCoordinatesFromClient({x:event.clientX,y:event.clientY});
    if (!canvas.dimensions.sceneRect.contains(x,y)) return;
    stopPlacement();
    const {sceneX,sceneY} = canvas.dimensions;
    editMarker(scene,{
      x:Math.round(x-sceneX), y:Math.round(y-sceneY), relative:true, level:canvas.level?.id
    }).catch(report);
  },options);
  ui.notifications.info(t('PlaceHint'));
}

function clearOverlay() {
  legendDrag?.destroy();
  legendDrag = undefined;
  panel?.remove(); panel = undefined;
  if (pins && !pins.destroyed) pins.destroy({children:true});
  pins = undefined;
}

// Lay out names in screen pixels while their point stays fixed on the plan.
function layoutNames(zoom) {
  if (!pins || !(zoom > 0) || pins.labelZoom === zoom) return;
  pins.labelZoom = zoom;
  const occupied = [];
  for (const pin of pins.children) {
    const [plate, text] = pin.children;
    const w = Math.ceil(text.width) + 12, h = Math.ceil(text.height) + 6;
    const px = pin.x * zoom, py = pin.y * zoom;
    const positions = [[8,-h/2],[-w-8,-h/2],[-w/2,-h-8],[-w/2,8]];
    let best = positions[0], bestOverlap = Infinity;
    for (const pos of positions) {
      const left = px+pos[0], top = py+pos[1];
      const area = occupied.reduce((sum, box) =>
        sum + Math.max(0, Math.min(left+w+2,box.right)-Math.max(left-2,box.left)) *
          Math.max(0, Math.min(top+h+2,box.bottom)-Math.max(top-2,box.top)), 0);
      if (area < bestOverlap) { best = pos; bestOverlap = area; }
      if (!area) break;
    }
    const [x,y] = best;
    occupied.push({left:px+x,top:py+y,right:px+x+w,bottom:py+y+h});
    pin.scale.set(1/zoom);
    text.position.set(x+6,y+3);
    plate.clear().beginFill(0x101e26,.9).drawRoundedRect(x,y,w,h,3).endFill();
    plate.lineStyle(1,0x14232a).beginFill(pin.accent).drawCircle(0,0,3).endFill();
  }
}

function renderOverlay() {
  clearOverlay();
  const scene = globalThis.canvas?.scene;
  if (!globalThis.canvas?.ready || !supportsScenePlan(game.actors.get(baseId(scene)))) { stopPlacement(); return; }
  const pages = markers(scene).filter(page => {
    const level = flag(page,'planPoint').level;
    return !level || level === canvas.level?.id;
  });
  pins = new PIXI.Container();
  pins.eventMode = 'none';
  canvas.interface.addChild(pins);
  panel = element('section');
  panel.id = 'ffg-base-legend';
  const head = element('header');
  const expanded = game.settings.get(scope,'basePlanLegend');
  const toggle = button(t('Legend'),expanded?'chevron-down':'chevron-right',() => game.settings.set(scope,'basePlanLegend',!expanded));
  toggle.append(document.createTextNode(t('Legend')));
  toggle.setAttribute('aria-expanded',String(expanded));
  const handle = element('button');
  handle.type = 'button';
  handle.className = 'ffg-plan-legend-handle';
  handle.setAttribute('aria-label',t('MoveLegend'));
  handle.title = t('MoveLegendHint');
  const grip = element('i');
  grip.className = 'fa-solid fa-grip-vertical';
  grip.setAttribute('aria-hidden','true');
  handle.append(grip);
  head.append(toggle,handle);
  if (game.user.isGM) head.append(button(t('Add'),'plus',() => placeMarker(scene)));
  panel.append(head);
  const list = element('ol');
  list.hidden = !expanded;
  for (const page of pages) {
    const point = flag(page,'planPoint');
    const x = point.x + (point.relative ? canvas.dimensions.sceneX : 0);
    const y = point.y + (point.relative ? canvas.dimensions.sceneY : 0);
    const secret = page.ownership.default === 0;
    const pin = new PIXI.Container();
    pin.position.set(x,y);
    pin.accent = secret ? 0xe6bc91 : 0x8ac9c2;
    const text = new PIXI.Text(page.name,{fontFamily:'Arial, sans-serif',fontSize:13,fontWeight:'500',
      fill:0xf5f8f9,wordWrap:true,wordWrapWidth:160,breakWords:true,lineHeight:16});
    text.resolution = Math.max(2,window.devicePixelRatio || 1);
    pin.addChild(new PIXI.Graphics(),text);
    pins.addChild(pin);
    const row = element('li');
    row.toggleAttribute('data-private',secret);
    const jump = button(page.name,secret?'lock':'location-dot',() => canvas.animatePan({x,y}));
    jump.append(document.createTextNode(page.name));
    row.append(jump);
    if (game.user.isGM) {
      row.append(button(t('Edit'),'pen',() => editMarker(scene,null,page)));
      row.append(button(t('Delete'),'trash',async() => {
        if (await Dialog().confirm({window:{title:t('Delete')},content:t('DeleteHint')})) await page.delete();
      }));
    }
    const note = description(page);
    if (note) row.append(element('p',note));
    list.append(row);
  }
  layoutNames(canvas.stage.scale.x);
  panel.append(list);
  document.body.append(panel);
  legendDrag = movableHud(panel,handle,{key:`starwarsffg.plan-legend-position.${game.world.id}.${game.user.id}`});
}

globalThis.Hooks?.once('init',() => {
  game.settings.register(scope,'basePlanLegend',{scope:'client',config:false,type:Boolean,default:true,onChange:renderOverlay});
  const css = element('link');
  css.rel = 'stylesheet';
  css.href = new URL('../../styles/base-plan.css',import.meta.url).href;
  document.head.append(css);
});
globalThis.Hooks?.on('canvasReady',renderOverlay);
globalThis.Hooks?.on('canvasPan',(board, position) => layoutNames(position?.scale ?? board.stage.scale.x));
globalThis.Hooks?.on('updateActor',(actor,changes) => {
  if (actor.type === 'vehicle' && baseId(globalThis.canvas?.scene) === actor.id &&
      (changes.system?.stats?.silhouette || 'system.stats.silhouette.value' in changes)) renderOverlay();
});
globalThis.Hooks?.on('canvasTearDown',() => { stopPlacement(); clearOverlay(); });
globalThis.Hooks?.on('updateScene',(scene,changes) => {
  if (scene.id === canvas.scene?.id && changes.flags?.[scope]) renderOverlay();
});
for (const action of ['create','update','delete']) {
  for (const kind of ['JournalEntry','JournalEntryPage']) globalThis.Hooks?.on(action+kind,doc => {
    if (flag(doc.parent || doc,'planScene') === globalThis.canvas?.scene?.id && globalThis.canvas?.scene) renderOverlay();
  });
}
