export async function openVehiclePlan(sheet) {
  try {
    const {openVehicleDeck} = await import('./vehicle-deck.mjs');
    await openVehicleDeck(sheet.actor,{shared:false});
  } catch (error) {
    ui.notifications.warn(error.message);
  }
}

export function configureVehiclePlan(sheet) {
  sheet._sheetTab = 'interior-plan';
  sheet._tabs[0]?.activate('interior-plan', {triggerCallback:true});
}

export function prepareVehiclePlanButton(sheet, sidebar) {
  if (sheet.actor.type !== 'vehicle') return;
  const settingsTab = sidebar.querySelector('[data-tab="interior-plan"]');
  if (!settingsTab) return;
  if (sheet.actor.isToken || sheet.actor.pack) { settingsTab.remove(); return; }
  // Foundry validates programmatic tab changes against its navigation entries.
  // Keep that entry hidden for the settings command; expose a separate action.
  const button = settingsTab.cloneNode(true);
  settingsTab.hidden = true;
  settingsTab.style.display = 'none';
  settingsTab.setAttribute('aria-hidden', 'true');
  settingsTab.after(button);
  button.removeAttribute('data-tab');
  button.classList.remove('active');
  button.classList.add('ffg-open-vehicle-plan');
  button.setAttribute('role', 'button');
  button.setAttribute('aria-label', game.i18n.localize("SWFFG.UI.Vehicle.OpenDeckPlan"));
  button.title = game.i18n.localize("SWFFG.UI.Vehicle.OpenDeckPlan");
  button.tabIndex = 0;
  button.addEventListener('click', event => {
    event.preventDefault(); event.stopPropagation();
    void openVehiclePlan(sheet);
  });
  button.addEventListener('keydown', event => {
    if (!['Enter', ' '].includes(event.key)) return;
    event.preventDefault(); button.click();
  });
}
