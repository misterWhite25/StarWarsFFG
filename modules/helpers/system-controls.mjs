// Style the system shortcuts in place, preserving Foundry's control hierarchy.
const shortcuts = '[data-trombinoscope], [data-open-space-combat], [data-open-galactic-travel], [data-open-galactic-market], li[data-deck-ship] > button, li[data-base-plan-scene] > button';
let observedRoot, observer, frame;

function windowId(button) {
  if (button.hasAttribute('data-trombinoscope')) return 'ffg-trombinoscope';
  if (button.hasAttribute('data-open-space-combat')) return 'ffg-space-combat';
  if (button.hasAttribute('data-open-galactic-travel')) return 'swffg-galactic-travel';
  if (button.hasAttribute('data-open-galactic-market')) return 'swffg-galactic-market';
  const ship = button.closest('li[data-deck-ship]')?.dataset.deckShip;
  return ship ? 'ffg-deck-' + ship : null;
}

function refresh() {
  const root = document.getElementById('scene-controls');
  if (root !== observedRoot) {
    observer?.disconnect();
    observedRoot = root;
    if (root) {
      observer = new MutationObserver(schedule);
      observer.observe(root, {childList: true, subtree: true});
    }
  }
  if (!root) return;
  const market=root.querySelector('[data-open-galactic-market]')?.closest('li');
  const space=root.querySelector('[data-open-space-combat]')?.closest('li');
  if(market&&space&&market.parentElement===space.parentElement&&market.nextElementSibling!==space)market.after(space);
  const portraits = root.querySelector('[data-trombinoscope]')?.closest('li');
  if (space && portraits && space.parentElement === portraits.parentElement && space.nextElementSibling !== portraits) {
    space.after(portraits);
  }
  const rows = new Set();
  for (const button of root.querySelectorAll(shortcuts)) {
    const row = button.closest('li');
    if (!row) continue;
    rows.add(row);
    const id = windowId(button);
    const sceneId = row.dataset.basePlanScene;
    const open = sceneId ? canvas.scene?.id === sceneId : !!(id && document.getElementById(id));
    button.classList.add('ffg-system-control');
    button.classList.toggle('ffg-system-control-open', open);
    if (sceneId) button.setAttribute('aria-current', open ? 'location' : 'false');
    else button.setAttribute('aria-expanded', String(open));
  }
  for (const row of root.querySelectorAll('.ffg-system-control-row')) {
    if (!rows.has(row)) row.classList.remove('ffg-system-control-row', 'ffg-system-control-start', 'ffg-system-control-end');
  }
  for (const row of rows) {
    row.classList.add('ffg-system-control-row');
    row.classList.toggle('ffg-system-control-start', !rows.has(row.previousElementSibling));
    row.classList.toggle('ffg-system-control-end', !rows.has(row.nextElementSibling));
  }
}

function schedule() {
  if (frame) return;
  frame = requestAnimationFrame(() => { frame = null; refresh(); });
}

Hooks.once('init', () => {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('../../styles/system-controls.css', import.meta.url).href;
  document.head.append(link);
});
Hooks.once('ready', schedule);
Hooks.on('renderSceneControls', schedule);
Hooks.on('canvasReady', schedule);
for (const hook of ['renderApplicationV2', 'closeApplicationV2']) {
  Hooks.on(hook, app => {
    if (app.id === 'ffg-trombinoscope' || app.id === 'ffg-space-combat' || app.id === 'swffg-galactic-travel' || app.id === 'swffg-galactic-market' || app.id?.startsWith('ffg-deck-')) schedule();
  });
}
