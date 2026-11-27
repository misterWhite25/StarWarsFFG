import {CREATION_CHARACTERISTIC_MAX} from './advancement.js';

export const characteristics = {Brawn:'SWFFG.CharacteristicBrawn',Agility:'SWFFG.CharacteristicAgility',Intellect:'SWFFG.CharacteristicIntellect',Cunning:'SWFFG.CharacteristicCunning',Willpower:'SWFFG.CharacteristicWillpower',Presence:'SWFFG.CharacteristicPresence'};
export default class CharacteristicIncrease {
  static matches(item) {
    if (item.type !== 'talent') return false;
    const name=(item.name??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
    return Boolean(item.flags?.starwarsffg?.characteristicIncrease) || ['entrainement','dedication','augmenter un attribut','increase a characteristic'].includes(name);
  }
  static label(item) {
    const selected=item.flags?.starwarsffg?.characteristicIncrease?.characteristic;
    if (selected) return characteristics[selected]?game.i18n.localize(characteristics[selected]):selected;
    const attrs=Object.values(item.system?.attributes??{}).filter(a=>a.modtype==='Characteristic' && characteristics[a.mod]);
    return attrs.length ? attrs.map(a=>game.i18n.localize(characteristics[a.mod])).join(', ') : game.i18n.localize("SWFFG.UI.Characteristic.CharacteristicNotSpecified");
  }
  static configure(data,actor,characteristic,phase) {
    if (!characteristics[characteristic] || !['creation','progression'].includes(phase)) throw new Error(game.i18n.localize("SWFFG.UI.Characteristic.InvalidCharacteristic"));
    const current=Number(actor.system.characteristics[characteristic]?.value);
    const max = phase === 'creation' ? CREATION_CHARACTERISTIC_MAX : 6;
    if (!Number.isFinite(current)||current>=max) throw new Error(game.i18n.localize("SWFFG.UI.Characteristic.CharacteristicCap"));
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
  static async choose(data,actor,{phase = data.flags?.starwarsffg?.characteristicIncrease?.creationTool ? 'creation' : 'progression'} = {}) {
    const root=document.createElement('div');
    const p=document.createElement('p');p.textContent=game.i18n.localize("SWFFG.UI.Characteristic.ChooseCharacteristicHint");root.append(p);
    const label=document.createElement('label');label.textContent=game.i18n.localize("SWFFG.UI.Characteristic.CharacteristicLabel");root.append(label);
    const select=document.createElement('select');select.name='characteristic';label.append(select);
    for(const [key,name] of Object.entries(characteristics)) {
      const value=Number(actor.system.characteristics[key]?.value);
      const max = phase === 'creation' ? CREATION_CHARACTERISTIC_MAX : 6;
      if(!Number.isFinite(value)||value>=max) continue;
      const option=document.createElement('option');option.value=key;option.textContent=game.i18n.localize(name);select.append(option);
    }
    if(!select.options.length){ui.notifications.warn(game.i18n.localize("SWFFG.UI.Characteristic.NoCharacteristicAvailable"));return null;}
    const choice=await foundry.applications.api.DialogV2.wait({classes:['starwarsffg','themed'],window:{title:data.name},content:root,
      buttons:[{action:'select',label:game.i18n.localize("SWFFG.UI.Characteristic.Choose"),default:true,callback:(_event,_button,dialog)=>({characteristic:dialog.element.querySelector('[name="characteristic"]').value,phase})},{action:'cancel',type:'button',label:game.i18n.localize("SWFFG.UI.Characteristic.Cancel")}]});
    if(!choice?.characteristic)return null;
    try{return this.configure(data,actor,choice.characteristic,choice.phase);}catch(error){ui.notifications.warn(error.message);return null;}
  }
}
