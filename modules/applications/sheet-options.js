const {DialogV2} = foundry.applications.api;

export default class SheetOptions {
  constructor(sheet) {
    this.data = sheet;
    this.options = {};
  }

  async register(name, config) {
    const option = this.options[name] ??= {...config};
    option.value = this.optionValue(name, option.default);
  }

  optionValue(name, fallback) {
    return this.data.object.flags?.starwarsffg?.config?.[name] ?? fallback;
  }

  registerMany(options) {
    options.forEach(({name, options: config}) => this.register(name, config));
  }

  unregister(name) {
    delete this.options[name];
  }

  clear() {
    this.options = {};
  }

  async updateFlags(document, changes) {
    const updates = {};
    for (const [path, value] of Object.entries(changes)) {
      const key = path.slice('flags.starwarsffg.'.length);
      if (document.getFlag('starwarsffg', key) !== value) updates[path] = value;
    }
    if (!Object.keys(updates).length) return false;
    await document.update(updates);
    return true;
  }

  async handler() {
    const content = document.createElement('div');
    content.innerHTML = await foundry.applications.handlebars.renderTemplate(
      'systems/starwarsffg/templates/dialogs/ffg-sheet-options.html', {options: this.options}
    );
    const title = game.i18n.localize(this.constructor.sheetLabel) + ' ' + game.i18n.localize('SWFFG.Options') + ': ' + this.data.object.name;
    await DialogV2.wait({
      window: {title}, classes: ['starwarsffg'], content,
      buttons: [{
        action: 'accept', icon: 'fas fa-check', label: game.i18n.localize('SWFFG.ButtonAccept'), default: true,
        callback: async (_event, _button, dialog) => {
          const changes = {};
          for (const control of dialog.element.querySelectorAll('input, select')) {
            const value = control.dataset.dtype === 'Boolean' ? control.checked : control.value;
            this.options[control.id].value = value;
            changes['flags.starwarsffg.' + control.name] = value;
          }
          await this.save(changes);
        }
      }, {
        action: 'cancel', icon: 'fas fa-times', label: game.i18n.localize('SWFFG.Cancel'), type: 'button'
      }]
    });
  }
}
