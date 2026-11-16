import {changedFields,isDocumentMetadataField} from './actor-change-fields.mjs';

const types=new Set(['character','rival','nemesis','minion','vehicle']);
const eligible=actor=>types.has(actor.type)&&!(actor.type==='vehicle'&&actor.flags?.starwarsffg?.vehicleMinionGroup?.enabled);
const allowed=new Set(['system.stats.wounds.value','system.stats.strain.value','system.quantity.max','system.unit_wounds.value','system.stats.hullTrauma.value','system.stats.systemStrain.value']);
const signatures=actor=>new Map(Object.entries(actor.system.skills??{}).map(([key,skill])=>[key,JSON.stringify([skill,actor.system.characteristics?.[skill.characteristic]])]));
export function captureCombatRefresh(sheet){
  sheet._ffgCombatRefresh=sheet._ffgCombatMode&&eligible(sheet.actor)?{element:sheet.element,editable:sheet.isEditable,skills:signatures(sheet.actor)}:null;
}
export function canRefreshCombatStats(sheet,options,changes=changedFields(options.renderData)){
  const saved=sheet._ffgCombatRefresh;
  if(!saved||!eligible(sheet.actor)||!sheet._ffgCombatMode||!sheet.rendered||saved.element!==sheet.element||!sheet.element?.isConnected||saved.editable!==sheet.isEditable||sheet._manualEditMode||options.force||options.renderContext!=='updateActor')return false;
  if(!sheet.actor.testUserPermission(game.user,'OBSERVER'))return false;
  const paths=changes.filter(path=>!isDocumentMetadataField(path));
  return paths.length>0&&paths.every(path=>allowed.has(path));
}
/** Update scalar fields in place. Only minion skills changed by losses need new dice. */
export function refreshCombatStats(sheet,options,DiceHelpers){
  const paths=changedFields(options.renderData);
  if(!canRefreshCombatStats(sheet,options,paths))return null;
  const actor=sheet.actor,root=sheet.element,saved=sheet._ffgCombatRefresh;
  const changed=new Set(paths);
  for(const input of root.querySelectorAll('input[name]')){
    const path=input.name.replace(/^data\./,'system.');
    if(!/^system\.(stats|quantity|unit_wounds|skills)\./.test(path))continue;
    if(root.ownerDocument.activeElement===input&&input.value!==input.defaultValue&&!changed.has(path))continue;
    const value=foundry.utils.getProperty(actor,path);
    if(value===undefined||value===null||typeof value==='object')continue;
    if(input.type==='checkbox'){if(input.checked!==!!value)input.checked=!!value;}
    else {const next=String(value);if(input.value!==next)input.value=next;if(input.defaultValue!==next)input.defaultValue=next;}
  }
  const next=signatures(actor),work=[];
  for(const row of root.querySelectorAll('.skill[data-ability]')){
    const key=row.dataset.ability;
    if(next.get(key)===saved.skills.get(key))continue;
    row.querySelector('.roll-button')?.replaceChildren();
    work.push(DiceHelpers.addSkillDicePool({data:actor.system},row));
  }
  saved.skills=next;
  return Promise.all(work).then(()=>{
    if(sheet.rendered&&sheet.element===root)Hooks.callAll('refreshActorSheetFFGStats',sheet,options.renderData);
    return sheet;
  });
}
