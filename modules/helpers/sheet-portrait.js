/** Restore editable portraits for the legacy templates hosted by V2 sheets. */
export function activateSheetPortrait(sheet) {
  for (const image of sheet.element.querySelectorAll('img[data-edit="img"]')) {
    if (!sheet.isEditable) continue;
    image.style.cursor = 'pointer';
    image.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      if (!sheet.isEditable) return;
      const picker = new foundry.applications.apps.FilePicker.implementation({
        type: 'image',
        current: sheet.document.img,
        document: sheet.document,
        callback: async path => {
          if (sheet.isEditable) await sheet.document.update({img: path});
        },
        position: {top: sheet.position.top + 40, left: sheet.position.left + 10},
      });
      await picker.browse();
    });
  }
}
