import {talentRank,strainRemaining,talentCostAccount} from './roll-talents.js';
const names=['dodge','esquive'];
const fr=()=>game.i18n.lang==='fr';
export function dodgeMaximum(actor){return Math.min(talentRank(actor,names),strainRemaining(actor));}
export function validateDodge(actor,amount){if(!actor?.isOwner||!Number.isInteger(amount)||amount<1||amount>dodgeMaximum(actor))throw Error(fr()?'Esquive indisponible : vérifiez le rang, le stress et les permissions.':'Dodge unavailable: check rank, strain and ownership.');}
const dodgeLocks=new Set();
export async function announceDodge(actor,amount){
 const key=actor.uuid;if(dodgeLocks.has(key))throw Error(fr()?'Esquive déjà en cours.':'Dodge already in progress.');dodgeLocks.add(key);
 try{validateDodge(actor,amount);const account=talentCostAccount(actor);const before=Number(account.stat.value)||0;
 await actor.update({[account.path]:before+amount});
 try{return await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content:'<p><strong>'+foundry.utils.escapeHTML(actor.name)+'</strong> - '+(fr()?'Esquive : subir ':'Dodge: suffer ')+amount+' '+account.label+(fr()?' ; améliorer de ':'; upgrade incoming combat difficulty ')+amount+(fr()?' dé(s) la difficulté du jet de combat qui le vise. À appliquer par l’attaquant sur ce jet uniquement.':' time(s). The attacker applies this to that check only.')+'</p>'});}
 catch(error){if(Number(talentCostAccount(actor)?.stat.value)===before+amount)await actor.update({[account.path]:before});throw error;}
 }finally{dodgeLocks.delete(key);}
}
export async function openDodge(actor){
 const max=dodgeMaximum(actor);if(!max){ui.notifications.warn(fr()?'Esquive : aucun stress disponible ou talent non acquis.':'Dodge: no available strain or acquired talent.');return;}
 await foundry.applications.api.DialogV2.prompt({classes:['starwarsffg','themed'],window:{title:fr()?'Esquive':'Dodge'},position:{width:420},rejectClose:false,
 content:`<p>${fr()?'Réaction à une attaque qui vous vise. Le stress est dépensé à la validation ; le tchat indique à l’attaquant les améliorations à appliquer.':'React to an attack targeting you. Confirmation spends strain and announces difficulty upgrades in chat.'}</p><label>${fr()?'Stress':'Strain'} (1-${max})<input name="dodge-amount" type="number" min="1" max="${max}" step="1" value="1"></label>`,
 ok:{label:fr()?'Utiliser Esquive':'Use Dodge',callback:(_e,_b,app)=>announceDodge(actor,Number(app.element.querySelector('[name=dodge-amount]').value))}});
}
export function renderDodgeButton(sheet){sheet.element.querySelector('.ffg-dodge-reaction')?.remove();if(!sheet.actor?.isOwner||!talentRank(sheet.actor,names))return;const button=document.createElement('button');button.type='button';button.className='ffg-dodge-reaction';button.textContent=fr()?'Esquive':'Dodge';button.title=fr()?'Dépenser du stress et annoncer Esquive dans le tchat':'Spend strain and announce Dodge in chat';button.addEventListener('click',e=>{e.preventDefault();void openDodge(sheet.actor).catch(error=>ui.notifications.error(error.message));});const parent=sheet.element.querySelector('.sheet-tabs')??sheet.element.querySelector('.window-content');parent?.append(button);}
