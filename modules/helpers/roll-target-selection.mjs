import {isTargetedAttack,targetAdversaryEffect} from './target-adversary.mjs';
import {chooseGroundTarget,cancelGroundTarget} from './ground-target-picker.mjs';
import {groundTokenForActor,rangeFor,bands,groundAttackDifficulty} from './ground-movement-state.mjs';
import {replaceWeaponPool} from './weapon-selection.js';
import {dualDistance} from './metric-distances.mjs';
const actorFor=builder=>builder.weaponContext?.actor??builder.roll.data?.document??game.actors.get(builder.roll.data?.actor?._id);
const el=(tag,css,text)=>{const node=document.createElement(tag);if(css)node.className=css;if(text!==undefined)node.textContent=text;return node;};
function sourceActor(builder){
 const item=builder.roll.item;
 if(item?.type==='shipweapon'){
  const owned=item.parent??(item.uuid||item.flags?.starwarsffg?.uuid?fromUuidSync(item.uuid??item.flags.starwarsffg.uuid)?.parent:null);
  if(owned?.type==='vehicle')return owned;
 }return actorFor(builder);
}
function sourceToken(builder){
 const actor=sourceActor(builder);if(!actor||!canvas.scene)return null;
 if(actor.isToken&&actor.parent?.parent?.id===canvas.scene.id)return actor.parent;
 const ground=groundTokenForActor(actor);if(ground)return ground;
 const tokens=canvas.scene.tokens.filter(token=>token.actorId===actor.id&&(game.user.isGM||!token.hidden&&token.object?.isVisible));
 const controlled=tokens.filter(token=>token.object?.controlled);return controlled.length===1?controlled[0]:tokens.length===1?tokens[0]:null;
}
class RollTargets{
 constructor(builder){
  this.builder=builder;this.hooks=[];
  this.watch('targetToken',(user)=>{if(user.id===game.user.id)void this.sync();});
  for(const name of ['updateToken','deleteToken','createToken','canvasReady','updateScene','ffgGroundRangesChanged'])this.watch(name,()=>void this.sync());
  for(const name of ['createItem','updateItem','deleteItem'])this.watch(name,item=>{if(this.targets().some(token=>token.actor?.uuid===item.parent?.uuid))void this.sync(true);});
  this.watch('updateActor',actor=>{if(actor.uuid===actorFor(builder)?.uuid||this.targets().some(token=>token.actor?.uuid===actor.uuid))void this.sync();});
 }
 watch(name,callback){this.hooks.push([name,Hooks.on(name,callback)]);}
 targets(){return [...game.user.targets].filter(token=>canvas.scene?.tokens.has(token.id)&&token.actor&&(game.user.isGM||token.isVisible&&!token.document.hidden));}
 range(targets=this.targets(),source=sourceToken(this.builder)){return source&&targets.length===1?rangeFor(source,targets[0].document):null;}
 signature(){const source=sourceToken(this.builder),targets=this.targets();return JSON.stringify({scene:canvas.scene?.id,source:source?.uuid,range:this.range(targets,source),item:this.builder.roll.item?.id,adversary:targetAdversaryEffect(this.builder,targets),targets:targets.map(token=>[token.document.uuid,token.x,token.y,token.document.elevation,token.actor?._stats?.modifiedTime,token.actor?.system?.stats?.defence])});}
 render(html){
  this.html=html;const root=html[0];root.querySelector('.ffg-roll-target-selection')?.remove();
  let host=root.querySelector('.ffg-weapon-selection');
  if(!host){host=el('div','ffg-weapon-selection');host.append(el('div','',game.i18n.localize("SWFFG.UI.Dice.WeaponUsedNone")));root.querySelector('input[name=boost]')?.closest('table')?.after(host);}
  const field=el('div','ffg-roll-target-selection');field.style.cssText='margin:8px 0;font-size:12px';
  const row=el('div','ffg-sheet-target-row'),label=el('div','ffg-sheet-movement-field');
  this.pick=el('button','ffg-sheet-target-pick');this.pick.type='button';this.pick.dataset.rollTargetPick='';this.pick.setAttribute('aria-label',game.i18n.localize("SWFFG.UI.Dice.ChooseATargetOnTheMap"));this.pick.title=this.pick.getAttribute('aria-label');this.name=el('span','ffg-sheet-target-name');this.pick.append(el('i','fa-solid fa-crosshairs'),this.name);
  this.pick.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();if(this.busy||this.builder._postingRoll)return;
   const actor=actorFor(this.builder),vehicle=sourceActor(this.builder),others=[...foundry.applications.instances.values()].filter(app=>app.rendered&&app.actor&&[actor?.uuid,vehicle?.uuid].includes(app.actor.uuid));
   void chooseGroundTarget(this.builder,sourceToken(this.builder),()=>this.sync(),{sourceOptional:true,canTarget:doc=>doc.documentName==='Token'&&!!doc.actor,hideApps:others}).catch(error=>ui.notifications.warn(error.message));
  });label.append(this.pick);row.append(label);
  this.clear=el('button','ffg-sheet-target-clear');this.clear.type='button';this.clear.dataset.rollTargetClear='';this.clear.setAttribute('aria-label',game.i18n.localize("SWFFG.UI.Dice.ClearTarget"));this.clear.title=this.clear.getAttribute('aria-label');this.clear.append(el('i','fa-solid fa-xmark'));this.clear.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();if(!this.busy&&!this.builder._postingRoll){canvas.tokens.setTargets([],{mode:'replace'});void this.sync();}});row.append(this.clear);field.append(row);
  this.info=el('p','hint');this.info.style.cssText='font-size:11px;font-style:italic;margin:4px 0;text-align:justify';this.info.setAttribute('aria-live','polite');field.append(this.info);
  const anchor=host.querySelector(':scope>select')??host.firstElementChild;if(anchor)anchor.after(field);else host.append(field);
  this.root=field;this.refreshUI();void this.sync(true);
 }
 refreshUI(){
  if(!this.root||this.closed)return;const targets=this.targets(),range=this.range(targets);
  this.name.textContent=targets.length===1?targets[0].name:targets.length>1?game.i18n.format('SWFFG.UI.Dice.SelectedTargets',{count:targets.length}):game.i18n.localize("SWFFG.UI.Dice.ChooseATarget");
  this.clear.hidden=targets.length===0;this.clear.disabled=this.busy||!!this.builder._postingRoll;this.pick.disabled=this.busy||!!this.builder._postingRoll||!canvas.ready;
  if(!this.builder._postingRoll)this.builder.roll.targetTokenUuids=targets.map(token=>token.document.uuid);
  this.info.textContent=this.error??(range?(bands[range.band]?game.i18n.localize(bands[range.band]):game.i18n.localize("SWFFG.UI.Dice.BeyondExtreme"))+(Number.isFinite(range.distance)?' · '+dualDistance(range.distance,canvas.scene):''):!canvas.ready?(game.i18n.localize("SWFFG.UI.Dice.OpenASceneToSelectATarget")):'');
  const base=range?.band===0?groundAttackDifficulty(actorFor(this.builder),this.builder.roll.item):range?.band;
  if(!this.error&&Number.isInteger(base)&&base>0&&base<=4){
   const dice=el('span','ffg-roll-range-dice');dice.style.cssText='display:inline-flex;gap:2px;margin-left:7px;vertical-align:middle;font-style:normal';
   dice.setAttribute('role','img');const label=game.i18n.format(base>1?'SWFFG.UI.Dice.BaseDifficultyMany':'SWFFG.UI.Dice.BaseDifficultyOne',{count:base});dice.setAttribute('aria-label',label);dice.title=label;
   for(let i=0;i<base;i++){const image=el('img');image.src='systems/starwarsffg/images/dice/starwars/purple.png';image.alt='';image.setAttribute('aria-hidden','true');image.style.cssText='width:12px;height:16px;object-fit:contain;border:0;box-shadow:none;background:none';dice.append(image);}
   this.info.append(dice);
  }
  if(!this.builder._postingRoll)this.builder.roll.targetAdversary=targetAdversaryEffect(this.builder,targets);
  const effect=this.builder.roll.targetAdversary;
  let notice=this.root.querySelector?.('.ffg-target-adversary');
  if(!notice){notice=el('p','ffg-target-adversary');notice.style.cssText='margin:4px 0;font-weight:600;text-align:justify';notice.setAttribute('role','status');this.root.append?.(notice);}
  notice.hidden=!effect?.rank;notice.textContent=effect?.rank?game.i18n.format('SWFFG.UI.Dice.TargetAdversary',{rank:effect.rank}):'';
  this.info.hidden=!this.info.textContent;
 }
 sync(force=false){
  if(this.closed)return Promise.resolve();
  // Keep the pool, range and saved targets together while resources are committed.
  if(this.builder._postingRoll){if(force)this.lastSignature=undefined;this.again=true;this.refreshUI();return Promise.resolve();}
  if(this.busy){this.again=true;return this.promise;}if(this.builder._selectingWeapon){this.again=true;return Promise.resolve();}
  if(!force&&this.lastSignature===this.signature()){this.refreshUI();return Promise.resolve();}
  this.busy=true;this.builder._selectingTarget=true;this.refreshUI();
  const selector=this.html?.[0]?.querySelector('.ffg-weapon-selection>select');if(selector)selector.disabled=true;
  this.promise=(async()=>{
   do{
    this.again=false;const signature=this.signature(),context=this.builder.weaponContext;
    try{
     const next=context?.makePool?await context.makePool(this.builder.roll.item??{}):null;
     if(this.closed)return;if(signature!==this.signature()){this.again=true;continue;}
     if(next){const baseline=this.builder._weaponBaseline??{...this.builder.dicePool};Object.assign(this.builder.dicePool,replaceWeaponPool(this.builder.dicePool,baseline,next));this.builder._weaponBaseline={...next};}
     const range=this.range();if(this.builder.roll.item?.type==='weapon')this.builder.roll.shotRange=range?(range.band===0?'engaged':range.band===1?'short':'beyond'):undefined;
     this.error=null;this.lastSignature=signature;this.builder._activateShotMode(this.html);this.builder._initializeInputs(this.html);
    }catch(error){this.error=error.message;this.lastSignature=signature;}
   }while(this.again&&!this.closed);
  })().finally(()=>{this.busy=false;this.builder._selectingTarget=false;if(selector)selector.disabled=!!this.builder._selectingWeapon;this.refreshUI();});return this.promise;
 }
 destroy(){this.closed=true;for(const [name,id]of this.hooks)Hooks.off(name,id);this.hooks=[];cancelGroundTarget(this.builder);}
}
export function activateRollTargets(builder,html){
 if(!isTargetedAttack(builder)){closeRollTargets(builder);return;}
 builder._rollTargets??=new RollTargets(builder);builder._rollTargets.render(html);
}
export function closeRollTargets(builder){builder._rollTargets?.destroy();builder._rollTargets=null;}
