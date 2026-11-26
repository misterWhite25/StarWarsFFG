const scope = 'starwarsffg';
const setting = 'sidebarTabOrder';
const dividerKey = '#separator';
const primaryTabs = [
  'chat', 'ffgCharacters', 'ffgPilotage', 'ffgPilotageCombat', 'combat',
  'scenes', 'actors', 'npcs', 'vehicles', 'journal'
];

const localize = key => game.i18n.localize('SWFFG.UI.Interface.SidebarOrder.' + key);
const sidebarMenu = sidebar => sidebar?.element?.querySelector('#sidebar-tabs > menu');
const dividerPosition = 'ffg-sidebar-divider';

function tabRows(menu) {
  const rows = new Map();
  for (const row of menu.children) {
    const button = row.querySelector('button[data-tab]');
    if (button) rows.set(button.dataset.tab, row);
  }
  return rows;
}

function orderedTabs(tabs, saved) {
  const keys = [...tabs];
  const available = new Set([...keys, dividerKey]);
  const defaults = [...primaryTabs, dividerKey, ...keys];
  return [...new Set([...saved, ...defaults])].filter(key => available.has(key));
}

function layoutSidebarTabs(sidebar) {
  const menu = sidebarMenu(sidebar);
  if (!menu) return;
  const rows = tabRows(menu);
  const order = orderedTabs(rows.keys(), game.settings.get(scope, setting));
  const divider = menu.querySelector('.'+dividerPosition) ?? menu.ownerDocument.createElement('li');
  divider.className = dividerPosition;
  divider.setAttribute('role', 'separator');
  divider.setAttribute('aria-orientation', 'horizontal');
  const arranged = order.map(tab => tab === dividerKey ? divider : rows.get(tab));
  const dividerIndex = arranged.indexOf(divider);
  const hasVisibleRows = items => items.some(row => !row.hidden);
  divider.hidden = !hasVisibleRows(arranged.slice(0, dividerIndex)) || !hasVisibleRows(arranged.slice(dividerIndex + 1));
  const known = new Set(arranged);
  const expected = [...arranged, ...Array.from(menu.children).filter(row => !known.has(row))];
  if (expected.some((row, index) => menu.children[index] !== row)) menu.append(...expected);
}

function refreshMoveButtons(list) {
  for (const row of list.children) {
    row.querySelector('[data-move=up]').disabled = !row.previousElementSibling;
    row.querySelector('[data-move=down]').disabled = !row.nextElementSibling;
  }
}

function layoutDialogContent(menu) {
  const container = document.createElement('div');
  const hint = document.createElement('p');
  hint.className = 'ffg-sidebar-order-hint';
  hint.textContent = localize('Instructions');
  const list = document.createElement('ol');
  list.className = 'ffg-sidebar-order-list';
  list.setAttribute('aria-label', localize('Title'));
  const rows = menu ? tabRows(menu) : new Map();
  for (const key of orderedTabs(rows.keys(), game.settings.get(scope, setting))) {
    const row = document.createElement('li');
    row.dataset.sidebarOrderKey = key;
    row.draggable = true;
    const grip = document.createElement('i');
    grip.className = key === dividerKey ? 'fa-solid fa-minus' : 'fa-solid fa-grip-vertical';
    grip.setAttribute('aria-hidden', 'true');
    const name = key === dividerKey ? localize('Separator') : rows.get(key).querySelector('button[data-tab]').ariaLabel;
    const label = document.createElement('span');
    label.textContent = name;
    row.append(grip, label);
    for (const [direction, keyName] of [['up', 'MoveUp'], ['down', 'MoveDown']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ui-control plain icon fa-solid fa-chevron-' + direction;
      button.dataset.move = direction;
      button.ariaLabel = game.i18n.format('SWFFG.UI.Interface.SidebarOrder.' + keyName, {name});
      button.dataset.tooltip = '';
      row.append(button);
    }
    list.append(row);
  }
  refreshMoveButtons(list);
  container.append(hint, list);
  return container;
}

function bindLayoutDialog(list) {
  list.addEventListener('click', event => {
    const button = event.target.closest('[data-move]');
    if (!button) return;
    const row = button.parentElement;
    if (button.dataset.move === 'up') row.previousElementSibling?.before(row);
    else row.nextElementSibling?.after(row);
    refreshMoveButtons(list);
    (button.disabled ? row.querySelector('button:not(:disabled)') : button)?.focus();
  });

  let dragged;
  list.addEventListener('dragstart', event => {
    dragged = event.target.closest('[data-sidebar-order-key]');
    if (!dragged) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', dragged.dataset.sidebarOrderKey);
  });
  list.addEventListener('dragover', event => {
    if (dragged) event.preventDefault();
  });
  list.addEventListener('drop', event => {
    const target = event.target.closest('[data-sidebar-order-key]');
    if (!dragged || !target || dragged === target) return;
    event.preventDefault();
    const bounds = target.getBoundingClientRect();
    if (event.clientY < bounds.top + bounds.height / 2) target.before(dragged);
    else target.after(dragged);
    dragged = null;
    refreshMoveButtons(list);
  });
  list.addEventListener('dragend', () => { dragged = null; });
}

Hooks.once('init', () => {
  game.settings.register(scope, setting, {
    scope: 'user',
    config: false,
    type: Array,
    default: [],
    onChange: () => layoutSidebarTabs(ui.sidebar)
  });

  const {DialogV2} = foundry.applications.api;
  class SidebarOrderDialog extends DialogV2 {
    constructor() {
      super({
        id: 'ffg-sidebar-order',
        classes: ['starwarsffg', 'themed'],
        window: {title: localize('Title')},
        position: {width: Math.min(420, innerWidth - 32)},
        content: layoutDialogContent(sidebarMenu(ui.sidebar)),
        buttons: [
          {
            action: 'save',
            label: 'SETTINGS.Save',
            default: true,
            callback: (_event, _button, dialog) => game.settings.set(scope, setting,
              Array.from(dialog.element.querySelectorAll('[data-sidebar-order-key]'), row => row.dataset.sidebarOrderKey))
          },
          {action: 'cancel', label: 'Cancel'}
        ]
      });
    }

    _onRender(context, options) {
      super._onRender(context, options);
      bindLayoutDialog(this.element.querySelector('.ffg-sidebar-order-list'));
    }
  }

  game.settings.registerMenu(scope, 'sidebarOrder', {
    name: 'SWFFG.UI.Interface.SidebarOrder.Title',
    label: 'SWFFG.UI.Interface.SidebarOrder.Configure',
    hint: 'SWFFG.UI.Interface.SidebarOrder.Hint',
    icon: 'fa-solid fa-list-ol',
    type: SidebarOrderDialog,
    restricted: false
  });
});

Hooks.on('renderSidebar', layoutSidebarTabs);
