import {stateFor,strainPaymentField} from './ground-movement-state.mjs';
const el=(tag,css,text)=>{const node=document.createElement(tag);if(css)node.className=css;if(text!==undefined)node.textContent=text;return node;};
export async function paymentFor(token,count){
 const state=stateFor(token);if(state.used+count>2)throw Error(game.i18n.localize("SWFFG.UI.Ground.TwoManeuverLimit"));
 if(state.used+count<2)return null;
 const content=el('div'),body=el('div','ffg-movement-confirm'),field=strainPaymentField(token.actor),damage=field==='wounds'?game.i18n.localize("SWFFG.UI.Ground.TwoWounds"):game.i18n.localize("SWFFG.UI.Ground.TwoStrain");
 body.append(el('p','',game.i18n.format(field?'SWFFG.UI.Ground.SecondPayment':'SWFFG.UI.Ground.SecondPaymentMinion',{name:token.name,damage})));content.append(body);
 const buttons=[{action:'action',label:game.i18n.localize("SWFFG.UI.Ground.ExchangeAction"),callback:()=> 'action'}];if(field)buttons.push({action:'strain',label:game.i18n.format('SWFFG.UI.Ground.SufferDamage',{damage}),callback:()=> 'strain'});buttons.push({action:'cancel',label:game.i18n.localize("SWFFG.UI.Ground.Cancel"),callback:()=>false});
 let resolveClosed;const closed=new Promise(resolve=>{resolveClosed=resolve;});
 const result=await foundry.applications.api.DialogV2.wait({window:{title:game.i18n.localize("SWFFG.UI.Ground.SecondManeuver")},position:{width:420},content,buttons,rejectClose:false,close:()=>resolveClosed()});
 await closed;return result;
}
