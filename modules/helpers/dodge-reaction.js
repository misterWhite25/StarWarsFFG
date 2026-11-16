import {talentRank,strainRemaining,talentCostAccount} from './roll-talents.js';
const names=['dodge','esquive'];
export function dodgeMaximum(actor){return Math.min(talentRank(actor,names),strainRemaining(actor));}
export function validateDodge(actor,amount){if(!actor?.isOwner||!Number.isInteger(amount)||amount<1||amount>dodgeMaximum(actor))throw Error(game.i18n.localize("SWFFG.UI.Dice.DodgeReaction.DodgeUnavailableCheckRankStrainAndOwnership"));}
const dodgeLocks=new Set();
export async function announceDodge(actor,amount){
 const key=actor.uuid;if(dodgeLocks.has(key))throw Error(game.i18n.localize("SWFFG.UI.Dice.DodgeReaction.DodgeAlreadyInProgress"));dodgeLocks.add(key);
 try{validateDodge(actor,amount);const account=talentCostAccount(actor);const before=Number(account.stat.value)||0;
 await actor.update({[account.path]:before+amount});
 try{return await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content:'<p><strong>'+foundry.utils.escapeHTML(actor.name)+'</strong> - '+(game.i18n.localize("SWFFG.UI.Dice.DodgeReaction.DodgeSuffer"))+amount+' '+account.label+(game.i18n.localize("SWFFG.UI.Dice.DodgeReaction.UpgradeIncomingCombatDifficulty"))+amount+(game.i18n.localize("SWFFG.UI.Dice.DodgeReaction.TimeSTheAttackerAppliesThisToThat"))+'</p>'});}
 catch(error){if(Number(talentCostAccount(actor)?.stat.value)===before+amount)await actor.update({[account.path]:before});throw error;}
 }finally{dodgeLocks.delete(key);}
}
export async function openDodge(actor){
 const max=dodgeMaximum(actor);if(!max){ui.notifications.warn(game.i18n.localize("SWFFG.UI.Dice.DodgeReaction.DodgeNoAvailableStrainOrAcquiredTalent"));return;}
 await foundry.applications.api.DialogV2.prompt({classes:['starwarsffg','themed'],window:{title:game.i18n.localize("SWFFG.UI.Dice.DodgeReaction.Dodge")},position:{width:420},rejectClose:false,
 content:`<p>${game.i18n.localize("SWFFG.UI.Dice.DodgeReaction.ReactToAnAttackTargetingYouConfirmationSpends")}</p><label>${game.i18n.localize("SWFFG.UI.Dice.DodgeReaction.Strain")} (1-${max})<input name="dodge-amount" type="number" min="1" max="${max}" step="1" value="1"></label>`,
 ok:{label:game.i18n.localize("SWFFG.UI.Dice.DodgeReaction.UseDodge"),callback:(_e,_b,app)=>announceDodge(actor,Number(app.element.querySelector('[name=dodge-amount]').value))}});
}
export function renderDodgeButton(sheet){sheet.element.querySelector('.ffg-dodge-reaction')?.remove();if(!sheet.actor?.isOwner||!talentRank(sheet.actor,names))return;const button=document.createElement('button');button.type='button';button.className='ffg-dodge-reaction';button.textContent=game.i18n.localize("SWFFG.UI.Dice.DodgeReaction.Dodge");button.title=game.i18n.localize("SWFFG.UI.Dice.DodgeReaction.SpendStrainAndAnnounceDodgeInChat");button.addEventListener('click',e=>{e.preventDefault();void openDodge(sheet.actor).catch(error=>ui.notifications.error(error.message));});const parent=sheet.element.querySelector('.sheet-tabs')??sheet.element.querySelector('.window-content');parent?.append(button);}
