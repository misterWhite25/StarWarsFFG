import SheetOptions from '../applications/sheet-options.js';

export default class ActorOptions extends SheetOptions {
  static sheetLabel = 'SWFFG.CharacterSheet';

  optionValue(name, fallback) {
    return name === 'enableEditMode' ? Boolean(this.data._manualEditMode) : super.optionValue(name, fallback);
  }

  async save(changes) {
    const previousMode = Boolean(this.data._manualEditMode);
    this.data._manualEditMode = Boolean(changes['flags.starwarsffg.config.enableEditMode']);
    delete changes['flags.starwarsffg.config.enableEditMode'];
    delete changes['flags.starwarsffg.config.editModeActor'];
    const saved = await this.updateFlags(this.data.object, changes);
    // A document update refreshes its sheets. A local edit-mode change has no such event.
    if (!saved && previousMode !== this.data._manualEditMode) await this.data.object.sheet.render(false);
  }
}
