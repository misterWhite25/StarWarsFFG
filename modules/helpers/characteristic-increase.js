export const characteristics = {Brawn:'Vigueur',Agility:'Agilité',Intellect:'Intelligence',Cunning:'Ruse',Willpower:'Volonté',Presence:'Présence'};
export default class CharacteristicIncrease {
  static matches(item) {
    if (item.type !== 'talent') return false;
    const name=(item.name??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
    return Boolean(item.flags?.starwarsffg?.characteristicIncrease) || ['entrainement','dedication','augmenter un attribut','increase a characteristic'].includes(name);
  }
  static label(item) {
    const selected=item.flags?.starwarsffg?.characteristicIncrease?.characteristic;
    if (selected) return characteristics[selected]??selected;
    const attrs=Object.values(item.system?.attributes??{}).filter(a=>a.modtype==='Characteristic' && characteristics[a.mod]);
    return attrs.length ? attrs.map(a=>characteristics[a.mod]).join(', ') : 'Non renseigné';
  }
  static configure(data,actor,characteristic,phase) {
    if (!characteristics[characteristic] || !['creation','progression'].includes(phase)) throw new Error('Choix de caractéristique invalide.');
    const current=Number(actor.system.characteristics[characteristic]?.value);
    if (!Number.isFinite(current)||current>=6) throw new Error('Cette caractéristique ne peut pas dépasser 6.');
    const result=structuredClone(data);
    delete result._id;
    result.flags??={};result.flags.starwarsffg??={};
    result.flags.starwarsffg.characteristicIncrease={...result.flags.starwarsffg.characteristicIncrease,characteristic,phase};
    result.system.ranks={ranked:true,current:1,min:0};
    result.system.attributes={attrCharacteristicIncrease:{modtype:'Characteristic',mod:characteristic,value:1}};
    const changes=[{key:`system.characteristics.${characteristic}.value`,value:1,type:'add'}];
    if(characteristic==='Brawn') {
      changes.push({key:'system.stats.soak.value',value:1,type:'add'},{key:'system.stats.encumbrance.max',value:1,type:'add'});
      if(phase==='creation') changes.push({key:'system.stats.wounds.max',value:1,type:'add'});
    }
    if(characteristic==='Willpower' && phase==='creation') changes.push({key:'system.stats.strain.max',value:1,type:'add'});
    result.effects=[{name:'attrCharacteristicIncrease',type:'base',transfer:true,disabled:false,
      system:{changes},flags:{starwarsffg:{characteristicIncrease:true}}}];
    return result;
  }
  static async choose(data,actor) {
    const root=document.createElement('div');
    const p=document.createElement('p');p.textContent='Choisissez la caractéristique qui reçoit +1 (maximum 6). Chaque acquisition est conservée séparément.';root.append(p);
    const label=document.createElement('label');label.textContent='Caractéristique ';root.append(label);
    const select=document.createElement('select');select.name='characteristic';label.append(select);
    for(const [key,name] of Object.entries(characteristics)) {
      const value=Number(actor.system.characteristics[key]?.value);
      if(!Number.isFinite(value)||value>=6) continue;
      const option=document.createElement('option');option.value=key;option.textContent=name;select.append(option);
    }
    if(!select.options.length){ui.notifications.warn('Aucune caractéristique ne peut être augmentée (maximum 6).');return null;}
    const custom=Boolean(data.flags?.starwarsffg?.characteristicIncrease?.creationTool);
    const choice=await foundry.applications.api.DialogV2.wait({classes:['starwarsffg','themed','theme-light'],window:{title:data.name},content:root,
      buttons:[{action:'select',label:'Choisir',default:true,callback:(_event,_button,dialog)=>({characteristic:dialog.element.querySelector('[name="characteristic"]').value,phase:custom?'creation':'progression'})},{action:'cancel',type:'button',label:'Annuler'}]});
    if(!choice?.characteristic)return null;
    try{return this.configure(data,actor,choice.characteristic,choice.phase);}catch(error){ui.notifications.warn(error.message);return null;}
  }
}
