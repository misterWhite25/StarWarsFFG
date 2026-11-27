import {DEFAULT_GROUND_RANGES,groundRangeValues,validateGroundRanges} from './ground-range-values.mjs';
const labels={contact:"SWFFG.UI.Ground.BandContact",short:"SWFFG.UI.Ground.BandShort",medium:"SWFFG.UI.Ground.BandMedium",long:"SWFFG.UI.Ground.BandLong",extreme:"SWFFG.UI.Ground.BandExtreme"};
const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
class GroundRangeSettings extends foundry.applications.api.ApplicationV2{
 static DEFAULT_OPTIONS={classes:['starwarsffg','themed','ffg-ground-range-settings'],window:{resizable:true},position:{width:540,height:'auto'}};
 constructor(){
  super({window:{title:game.i18n.localize("SWFFG.UI.Ground.SettingsTitle")},position:{width:Math.min(540,innerWidth-32)}});
  this.reference=!game.user.isGM;
 }
 async _renderHTML(){
  const root=el('form','standard-form');root.addEventListener('submit',event=>{event.preventDefault();void this.save();});
  this.modeInputs={};
  if(!this.reference){
   const modes=el('fieldset');modes.append(el('legend','',game.i18n.localize("SWFFG.UI.Ground.MovementModes")));
   for(const key of ['enableNarrativeMovement','enableBattlemapMovement']){
    const definition=game.settings.settings.get('starwarsffg.'+key),row=el('label');row.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:12px;padding:5px 0;';
    const input=el('input');input.type='checkbox';input.name='starwarsffg.'+key;input.checked=game.settings.get('starwarsffg',key);input.style.cssText='flex:none;margin:0;width:18px;height:18px;';
    row.append(el('span','',game.i18n.localize(definition.name)),input);modes.append(row);this.modeInputs[key]=input;
   }
   const help=el('p','hint',game.i18n.localize("SWFFG.UI.Ground.BothModesHint"));help.style.cssText='text-align:justify;font-style:italic;';modes.append(help);root.append(modes,el('h3','',game.i18n.localize("SWFFG.UI.Ground.GroundDistancesTitle")));
  }
  const note=el('p','hint',game.i18n.localize("SWFFG.UI.Ground.TableConventionHint"));note.style.textAlign='justify';root.append(note);
  const values=groundRangeValues();
  const table=el('table'),head=el('thead'),header=el('tr');for(const text of [game.i18n.localize("SWFFG.UI.Ground.Range"),game.i18n.localize("SWFFG.UI.Ground.Meters"),game.i18n.localize("SWFFG.UI.Ground.Feet")])header.append(el('th','',text));head.append(header);table.append(head);const body=el('tbody');this.inputs={};
  for(const [key,labelKey]of Object.entries(labels)){const label=game.i18n.localize(labelKey);
   const row=el('tr');row.append(el('th','',label));
   if(this.reference){for(const value of [values[key],values[key]/0.3048]){const cell=el('td','',value.toLocaleString(game.i18n.lang,{maximumFractionDigits:2}));cell.style.textAlign='center';row.append(cell);}}
   else{
    const m=el('input'),ft=el('input');for(const [input,unit]of [[m,'m'],[ft,'ft']]){input.type='number';input.min='0.001';input.step='any';input.required=true;input.setAttribute('aria-label',label+' ('+unit+')');input.dataset.rangeKey=key;input.dataset.rangeUnit=unit;input.style.textAlign='center';const cell=el('td');cell.append(input);row.append(cell);}
    m.value=String(values[key]);ft.value=String(Math.round(values[key]/0.3048*1e9)/1e9);
    m.addEventListener('input',()=>{ft.value=m.value===''?'':String(Math.round(Number(m.value)/0.3048*1e9)/1e9);});
    ft.addEventListener('input',()=>{m.value=ft.value===''?'':String(Math.round(Number(ft.value)*0.3048*1e9)/1e9);});this.inputs[key]={m,ft};
   }body.append(row);
  }table.append(body);root.append(table);
  if(!this.reference){const hint=el('p','hint',game.i18n.localize("SWFFG.UI.Ground.DefaultValuesHint"));hint.style.textAlign='justify';root.append(hint);}
  this.error=el('p','ffg-ground-range-error');this.error.style.color='var(--color-level-error, #a52d3d)';this.error.style.textAlign='justify';this.error.hidden=true;this.error.setAttribute('role','alert');root.append(this.error);
  const footer=el('footer','form-footer');
  const button=(text,action)=>{const node=el('button','',text);node.type='button';node.addEventListener('click',action);return node;};
  if(!this.reference){footer.append(button(game.i18n.localize("SWFFG.UI.Ground.DefaultDistances"),()=>{for(const [key,value]of Object.entries(DEFAULT_GROUND_RANGES)){this.inputs[key].m.value=String(value);this.inputs[key].ft.value=String(Math.round(value/0.3048*1e9)/1e9);}this.error.hidden=true;}));const save=el('button','',game.i18n.localize("SWFFG.UI.Ground.Save"));save.type='submit';footer.append(save);}
  footer.append(button(game.i18n.localize("SWFFG.UI.Ground.Close"),()=>this.close()));root.append(footer);return root;
 }
 _replaceHTML(result,content){content.replaceChildren(result);}
 async save(){
  if(this.reference||!game.user.isGM||this.busy)return;this.error.hidden=true;
  try{const values=validateGroundRanges(Object.fromEntries(Object.entries(this.inputs).map(([key,pair])=>[key,pair.m.value])));this.busy=true;
   await game.settings.set('starwarsffg','groundRangeDistances',values);for(const [key,input]of Object.entries(this.modeInputs)){if(game.settings.get('starwarsffg',key)!==input.checked)await game.settings.set('starwarsffg',key,input.checked);}await this.close({animate:false});}
  catch(error){this.error.textContent=error.message;this.error.hidden=false;}finally{this.busy=false;}
 }
}
export async function showGroundRangeSettings(){if(!game.user.isGM)return;const app=new GroundRangeSettings();await app.render({force:true});return app;}
Hooks.once('init',()=>{
 game.settings.register('starwarsffg','groundRangeDistances',{scope:'world',config:false,type:Object,default:{...DEFAULT_GROUND_RANGES},onChange:()=>Hooks.callAll('ffgGroundRangesChanged')});
 game.settings.registerMenu('starwarsffg','groundRangeDistances',{name:"SWFFG.UI.Ground.SettingsTitle",label:"SWFFG.UI.Ground.SettingsTitle",icon:'fa-solid fa-ruler-combined',restricted:true,type:GroundRangeSettings});
});
