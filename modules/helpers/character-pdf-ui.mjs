const exporting = new WeakSet();

export function characterPdfHeaderControl(sheet) {
  const actor = sheet.actor;
  if (actor.type !== 'character' || actor.limited || !actor.testUserPermission(game.user, 'OBSERVER')) return null;
  return {
    action: 'ffgExportPdf',
    icon: 'fa-solid fa-file-pdf',
    label: game.i18n.localize('SWFFG.UI.Pdf.Export'),
    onClick: () => openCharacterPdf(sheet)
  };
}

async function openCharacterPdf(sheet) {
  if (exporting.has(sheet)) return;

  // Open in the sheet's window while the click still grants popup permission.
  const host = sheet.element.ownerDocument.defaultView;
  const popup = host.open('about:blank', '_blank', 'popup,width=900,height=900');
  if (!popup) {
    ui.notifications.warn(game.i18n.localize('SWFFG.UI.Pdf.PopupBlocked'));
    return;
  }

  exporting.add(sheet);
  try {
    popup.document.title = game.i18n.localize('SWFFG.UI.Pdf.Export');
    popup.document.body.textContent = game.i18n.localize('SWFFG.UI.Pdf.Preparing');
    const {exportCharacterPdf} = await import('./character-pdf.mjs');
    await exportCharacterPdf(sheet.actor, popup);
  } catch (error) {
    if (!popup.closed) popup.close();
    console.error('Star Wars FFG | PDF', error);
    ui.notifications.error(error.message);
  } finally {
    exporting.delete(sheet);
  }
}
