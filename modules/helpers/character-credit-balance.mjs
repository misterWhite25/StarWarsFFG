/** Keep the existing spendable balance; reserve funds are stored separately. */
export function renderCharacterCredits(sheet,root=sheet.element) {
  if(sheet.actor?.type!=='character')return;
  const input=root?.querySelector('.tab[data-tab=items] input[name="data.stats.credits.value"], .tab[data-tab=items] input[name="system.stats.credits.value"]');
  const card=input?.closest('.resource'),body=card?.querySelector('.block-attribute');
  if(!body)return;
  const credits=sheet.actor.system.stats?.credits??{},carried=Number(credits.value)||0,reserve=Number(credits.reserve)||0;
  card.classList.add('ffg-credit-balances');
  const label=(text,control)=>{const node=document.createElement('label'),caption=document.createElement('span');caption.textContent=text;node.append(caption,control);return node;};
  input.type='number';input.min='0';input.step='1';input.value=carried;input.dataset.dtype='Number';input.setAttribute('aria-label',game.i18n.localize("SWFFG.UI.Equipment.CharacterCreditBalance.CarriedCredits"));
  const reserveInput=document.createElement('input');reserveInput.type='number';reserveInput.min='0';reserveInput.step='1';reserveInput.name=input.name.replace(/\.value$/,'.reserve');reserveInput.dataset.dtype='Number';reserveInput.value=reserve;reserveInput.disabled=input.disabled||!sheet.isEditable;reserveInput.readOnly=input.readOnly;reserveInput.setAttribute('aria-label',game.i18n.localize("SWFFG.UI.Equipment.CharacterCreditBalance.ReserveCredits"));
  const total=document.createElement('output');total.dataset.creditTotal='';total.value=new Intl.NumberFormat(game.i18n.lang).format(carried+reserve);total.setAttribute('aria-label',game.i18n.localize("SWFFG.UI.Equipment.CharacterCreditBalance.TotalCreditsOwned"));total.title=game.i18n.localize("SWFFG.UI.Equipment.CharacterCreditBalance.CarriedReserveAutomaticSpendingUsesCarriedCredits");
  body.replaceChildren(label(game.i18n.localize("SWFFG.UI.Equipment.CharacterCreditBalance.Carried"),input),label(game.i18n.localize("SWFFG.UI.Equipment.CharacterCreditBalance.Reserve"),reserveInput),label(game.i18n.localize("SWFFG.UI.Equipment.CharacterCreditBalance.TotalOwned"),total));
}

