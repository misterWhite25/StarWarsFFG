/** Legacy getData methods communicate their preferred size by writing to position. */
export async function prepareLegacySheetContext(sheet, options, getData) {
  const previous = {width: sheet.position.width, height: sheet.position.height};
  try {
    const context = await getData.call(sheet, options);
    if (!sheet._ffgInitialSizeApplied) {
      const requested = {...options.position};
      const defaults = sheet.constructor.DEFAULT_OPTIONS.position;
      for (const key of ['width', 'height']) {
        if (requested[key] === undefined || requested[key] === defaults[key]) requested[key] = sheet.position[key];
      }
      options.position = requested;
      sheet._ffgInitialSizeApplied = true;
    }
    return context;
  } finally {
    for (const key of ['width', 'height']) {
      if (sheet.position[key] !== previous[key]) sheet.position[key] = previous[key];
    }
  }
}

export function revealSheetFrame(sheet, options) {
  if (!options.isFirstRender || !sheet.element?.classList.contains('ffg-sheet-pending')) return;
  sheet.setPosition(options.position ?? sheet.position);
  sheet.element.classList.remove('ffg-sheet-pending');
}
