/** Display data only: the stored roll, damage rules and spending state stay authoritative. */
export function spaceRollPresentation(data,localize){
  const item=data.system??{},crew=item.crew;
  if(!data.publicRoll||(!data.hasFFG&&!data.hasStandard))return null;
  const roles={pilot:'pilot',pilote:'pilot',copilot:'copilot',copilote:'copilot',gunner:'gunner',artilleur:'gunner',engineer:'engineer',mecanicien:'engineer',technicien:'operator',operator:'operator',astromech:'astromech'};
  const normalized=String(crew?.role??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z]/g,'');
  const kind=roles[normalized];
  const value=stat=>{
    const adjusted=Number(stat?.adjusted);
    if(Number.isFinite(adjusted)&&adjusted!==0)return adjusted;
    const base=stat?.value;
    return base!==''&&base!=null&&Number.isFinite(Number(base))?Number(base):null;
  };
  const image=crew?.img??item.img;
  const portrait=image&&!/\/icons\/svg\/|^icons\/svg\/|\/(?:mystery-man|d20|item-bag|target)\.svg$/i.test(image)?image:null;
  const weapon=['weapon','shipweapon'].includes(item.type),force=item.type==='forcepower';
  return {
    title:crew?.name||item.name||null,
    icon:crew?.crew_card?'fa-rocket':weapon?'fa-crosshairs':force?'fa-hand-sparkles':'fa-dice',
    portrait,role:kind?localize('SWFFG.AutoCrew.Role.'+kind):crew?.role,
    weapon,weaponLine:weapon&&!!crew?.name,force,description:force?item.system?.description:null,powerUpgrades:force?(item.powerUpgrades??item.system?.powerUpgrades??[]):[],
    damage:value(item.system?.damage),critical:value(item.system?.crit),
    results:Object.entries(data.ffg??{}).filter(([,count])=>Number(count)!==0).map(([key,count])=>({key,count,label:data.diceresults?.[key]??key}))
  };
}
