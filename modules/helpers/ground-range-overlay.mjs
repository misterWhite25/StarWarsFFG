import {calibration} from './ground-movement-model.mjs';
import {movementMode,isGroundToken} from './ground-movement-state.mjs';
export const rangeColors=[0x76b9b1,0x91afc7,0xc4b58b,0xb89cae];
export const rangeLabels=["SWFFG.UI.Ground.BandShort","SWFFG.UI.Ground.BandMedium","SWFFG.UI.Ground.BandLong","SWFFG.UI.Ground.BandExtreme"];
let active,graphic,frame;
export const hasGroundRangeOverlay=owner=>!!active&&(active.owner===owner||active.tokenUuid===owner?.token?.uuid);
export function clearGroundRangeOverlay(owner){
 if(owner&&!hasGroundRangeOverlay(owner))return;
 const changed=!!active;
 active=null;graphic?.destroy({children:true});graphic=null;
 if(changed)Hooks.callAll('ffgGroundRangeOverlayChanged');
}
export function setGroundRangeOverlay(owner,token,enabled){
 if(!enabled){clearGroundRangeOverlay(owner);return;}
 if(!isGroundToken(token)||!token.actor.isOwner)throw Error(game.i18n.localize("SWFFG.UI.Ground.OwnTokenForRanges"));
 if(movementMode(token.parent)!=='battlemap')throw Error(game.i18n.localize("SWFFG.UI.Ground.BattlemapRangesRequired"));
 active={owner,tokenUuid:token.uuid};schedule();Hooks.callAll('ffgGroundRangeOverlayChanged');
}
// Keep the four possible rings and their rasterized labels for the life of the overlay.
function createBand(layer, index) {
 const ring = new PIXI.Graphics();
 const badge = new PIXI.Container();
 const background = new PIXI.Graphics();
 const label = new PIXI.Text('', {fontFamily:'Arial', fontSize:13, fontWeight:'600', fill:'#f4f7f8'});
 label.anchor.set(.5);
 label.roundPixels = true;
 badge.addChild(background, label);
 layer.addChildAt(ring, 0);
 layer.addChild(badge);
 const angle = (-35 + index * 10) * Math.PI / 180;
 return {ring, badge, background, label, dx:Math.cos(angle), dy:Math.sin(angle)};
}

function updateBand(layer, band, index, radiusPixels, zoom) {
 const {ring, badge, background, label} = band;
 const color = rangeColors[index];
 if (band.radiusPixels !== radiusPixels || band.zoom !== zoom) {
  ring.clear().lineStyle(1.5 / zoom, color, .78).drawCircle(0, 0, radiusPixels);
  badge.scale.set(1 / zoom);
  band.radiusPixels = radiusPixels;
  band.zoom = zoom;
 }
 const text = game.i18n.localize(rangeLabels[index]);
 const resolution = Math.max(2, window.devicePixelRatio || 1);
 if (label.text !== text || label.resolution !== resolution) {
  label.text = text;
  label.resolution = resolution;
  background.clear().lineStyle(1, color, .85).beginFill(0x132733, .95)
   .drawRoundedRect(-label.width / 2 - 6, -label.height / 2 - 3, label.width + 12, label.height + 6, 4).endFill();
 }
 const point = new PIXI.Point(band.dx * radiusPixels, band.dy * radiusPixels);
 const screen = layer.toGlobal(point);
 screen.set(Math.round(screen.x), Math.round(screen.y));
 badge.position.copyFrom(layer.toLocal(screen));
 return text;
}

function draw() {
 frame = null;
 if (!active || !canvas.ready) { graphic?.destroy({children:true}); graphic = null; return; }
 const token = fromUuidSync(active.tokenUuid), object = token?.object;
 if (!isGroundToken(token) || !object || token.parent.id !== canvas.scene?.id || !token.actor.isOwner || (!game.user.isGM && !object.isVisible)) {
  clearGroundRangeOverlay();
  return;
 }
 if (movementMode(token.parent) !== 'battlemap') { graphic?.destroy({children:true}); graphic = null; return; }
 const config = calibration(token.parent), grid = canvas.grid, center = object.center, zoom = canvas.stage.scale.x || 1;
 const bounds = canvas.dimensions.rect ?? new PIXI.Rectangle(0, 0, canvas.dimensions.width, canvas.dimensions.height);
 const corners = [{x:bounds.x, y:bounds.y}, {x:bounds.right, y:bounds.y}, {x:bounds.right, y:bounds.bottom}, {x:bounds.x, y:bounds.bottom}];
 const maxDistance = Math.max(...corners.map(point => grid.measurePath([center, point]).distance));
 if (!graphic) {
  graphic = new PIXI.Container();
  graphic.name = 'ffg-ground-range-overlay';
  graphic.eventMode = 'none';
  graphic.interactiveChildren = false;
  graphic.bands = [];
  canvas.interface.addChild(graphic);
 }
 graphic.position.copyFrom(center);
 graphic.ffgCenter = {x:center.x, y:center.y};
 graphic.ffgRanges = [];
 for (const [index, key] of ['short','medium','long','extreme'].entries()) {
  const radius = config[key];
  let radiusPixels = 0;
  if (radius <= maxDistance * 1.25) {
   const edge = grid.getTranslatedPoint(center, 0, radius);
   radiusPixels = Math.hypot(edge.x - center.x, edge.y - center.y);
  }
  const visible = Number.isFinite(radiusPixels) && radiusPixels > 0;
  let band = graphic.bands[index];
  if (!band && visible) band = graphic.bands[index] = createBand(graphic, index);
  if (!band) continue;
  band.ring.visible = band.badge.visible = visible;
  if (!visible) continue;
  const label = updateBand(graphic, band, index, radiusPixels, zoom);
  graphic.ffgRanges.push({label, distance:radius, radiusPixels, shape:'circle'});
 }
}
export function refreshGroundRangeOverlay(){schedule();}
function schedule(){if(active && frame == null)frame=requestAnimationFrame(draw);}
Hooks.on('refreshToken',token=>{if(token.document.uuid===active?.tokenUuid)schedule();});
for(const hook of ['updateToken','canvasPan'])Hooks.on(hook,schedule);
Hooks.on('deleteToken',token=>{if(token.uuid===active?.tokenUuid)clearGroundRangeOverlay();});
Hooks.on('canvasTearDown',()=>{if(frame)cancelAnimationFrame(frame);frame=null;clearGroundRangeOverlay();});

// Local display only: the HUD and actor sheet share the same token overlay.
let rangeHUD;
function refreshRangeHUD(){
 const button=rangeHUD?.element?.querySelector('.ffg-ground-ranges-toggle');if(!button)return;
 const token=rangeHUD.document,available=isGroundToken(token)&&token.actor.isOwner&&movementMode(token.parent)==='battlemap';
 button.disabled=!available;button.hidden=!available;
 if(available)button.style.removeProperty('display');else button.style.setProperty('display','none','important');
 const enabled=available&&active?.tokenUuid===token.uuid;
 button.classList.toggle('active',enabled);button.setAttribute('aria-pressed',String(enabled));
 const label=!available?game.i18n.localize("SWFFG.UI.Ground.RangesUnavailable"):enabled?game.i18n.localize("SWFFG.UI.Ground.HideRanges"):game.i18n.localize("SWFFG.UI.Ground.ShowRanges");button.setAttribute('aria-label',label);button.title=label;
}
Hooks.on('renderTokenHUD',(hud,element)=>{
 rangeHUD=hud;const root=element?.querySelector?element:element?.[0];root?.querySelector('.ffg-ground-ranges-toggle')?.remove();
 const token=hud.document;if(!isGroundToken(token)||!token.actor.isOwner)return;
 const host=root?.querySelector('.col.left');if(!host)return;
 const button=document.createElement('button');button.type='button';button.className='control-icon ffg-ground-ranges-toggle';button.dataset.tooltip='';
 const icon=document.createElement('i');icon.className='fa-solid fa-circle-radiation';icon.setAttribute('inert','');button.append(icon);
 button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();if(button.disabled)return;try{setGroundRangeOverlay({token},token,active?.tokenUuid!==token.uuid);}catch(error){ui.notifications.warn(error.message);}});
 host.append(button);refreshRangeHUD();
});
Hooks.on('ffgGroundRangeOverlayChanged',refreshRangeHUD);

for(const hook of ['updateSetting','updateScene','canvasReady','updateActor','ffgGroundRangesChanged'])Hooks.on(hook,()=>{refreshRangeHUD();schedule();});
