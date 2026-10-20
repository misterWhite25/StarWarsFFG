// Modèle expérimental : identités de tokens, effets au prochain jet, placement.
const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const groups=[['RangedLight','Ranged: Light','Armes légères','SWFFG.SkillsNameRangedLight'],['RangedHeavy','Ranged: Heavy','Armes lourdes','SWFFG.SkillsNameRangedHeavy'],['Melee','Corps à corps','SWFFG.SkillsNameMelee'],['Brawl','Pugilat','SWFFG.SkillsNameBrawl'],['Medicine','Médecine','SWFFG.SkillsNameMedicine'],['Gunnery','Artillerie','SWFFG.SkillsNameGunnery']];
export function skillKey(value){const name=normalize(value);return groups.find(group=>group.some(alias=>normalize(alias)===name))?.[0]??name;}
export function matchingModifiers(entries,subjectUuid,skill){return entries.filter(entry=>entry.state==='pending'&&entry.subjectUuid===subjectUuid&&(!entry.skill||skillKey(entry.skill)===skillKey(skill)));}
export function modifierTotals(entries){return entries.reduce((total,entry)=>({boost:total.boost+entry.boost,setback:total.setback+entry.setback}),{boost:0,setback:0});}
export function modifierCounts(value){const result={};for(const key of ['boost','setback']){const n=Number(value[key]);if(!Number.isInteger(n)||n<0||n>20)throw Error('Saisir entre 0 et 20 dés.');result[key]=n;}return result;}
export function adjacentPlacement(rect,viewport,{gap=12,preferredWidth=520,minWidth=300}={}){
  const margin=12,rightSpace=viewport.width-margin-rect.right-gap,leftSpace=rect.left-margin-gap;
  const side=rightSpace>=leftSpace?'right':'left';
  const space=Math.max(rightSpace,leftSpace);
  const jetWidth=rect.right-rect.left;
  if(space<minWidth&&viewport.width>=jetWidth+minWidth+2*margin+gap){
    const width=Math.min(preferredWidth,viewport.width-2*margin-gap-jetWidth);
    const jetLeft=side==='right'?margin:viewport.width-margin-jetWidth;
    return {side,jetLeft,left:side==='right'?jetLeft+jetWidth+gap:margin,top:Math.max(margin,Math.min(rect.top,viewport.height-180)),width};
  }
  if(space<minWidth)return {side:'fallback',left:margin,top:Math.max(margin,Math.min(rect.bottom+gap,viewport.height-180)),width:Math.min(preferredWidth,viewport.width-2*margin)};
  const width=Math.min(preferredWidth,space);
  return {side,left:side==='right'?rect.right+gap:rect.left-gap-width,top:Math.max(margin,Math.min(rect.top,viewport.height-180)),width};
}
