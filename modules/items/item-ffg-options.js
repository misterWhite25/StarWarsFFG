import SheetOptions from '../applications/sheet-options.js';

export default class ItemOptions extends SheetOptions {
  static sheetLabel = 'SWFFG.ItemSheet';

  async save(changes) {
    const item = await fromUuid(this.data.item.uuid);
    if (!item) return ui.notifications.warn('Unable to find item');
    await this.updateFlags(item, changes);
  }
}
