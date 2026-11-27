import { bookActivation } from './book-tree-presentation.js';
import { enrichTreeDescriptions } from './sheet-text-cache.mjs';
import { talentTitle, treeTalentDescription } from './talent-tree-presentation.js';

export async function prepareBookTalents(item, talents) {
  const nodes = Object.values(talents);
  const names = nodes.map(node => node.name).filter(Boolean);
  await enrichTreeDescriptions(item, nodes);
  for (const node of nodes) {
    node.bookActivation = bookActivation(node, game.i18n.lang);
    node.displayName = talentTitle(node.name);
    node.textVerified = node.verification?.status === 'verified';
    node.enrichedDescription = treeTalentDescription(node, node.enrichedDescription, names);
  }
}

export const TREE_NODE_WIDTHS = {single: 1, double: 2, triple: 3, full: 4};

export async function prepareBookForceUpgrades(item, upgrades) {
  for (const [key, upgrade] of Object.entries(upgrades)) {
    const index = Number(key.slice('upgrade'.length));
    const column = index % 4;
    const span = Math.min(TREE_NODE_WIDTHS[upgrade.size] ?? 1, 4 - column);
    upgrade.bookColumn = column + 1;
    upgrade.bookRow = Math.floor(index / 4) + 2;
    upgrade.sizeInt = span;
    upgrade.topLinks = Array.from({length: span}, (_, offset) => ({
      number: offset + 1,
      active: upgrade[`links-top-${offset + 1}`],
    }));
  }
  await enrichTreeDescriptions(item, Object.values(upgrades));
}

function observeTreeConnections(grid, cards, drawConnections) {
  const namespace = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(namespace, 'svg');
  svg.classList.add('ffg-book-connections');
  svg.setAttribute('aria-hidden', 'true');
  grid.querySelector(':scope > .ffg-book-connections')?.remove();
  grid.prepend(svg);

  const draw = () => {
    const bounds = grid.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    svg.setAttribute('width', String(bounds.width));
    svg.setAttribute('height', String(bounds.height));
    svg.replaceChildren();
    const appendPath = data => {
      const path = document.createElementNS(namespace, 'path');
      path.setAttribute('d', data);
      svg.append(path);
    };
    for (const node of cards) {
      const header = node.querySelector('.talent-header');
      if (header) header.style.setProperty('--ffg-arrow-half', `${header.getBoundingClientRect().height / 2}px`);
    }
    drawConnections(bounds, appendPath);
  };
  const observer = new ResizeObserver(draw);
  observer.observe(grid);
  for (const node of cards) observer.observe(node);
  draw();
  return observer;
}

export function observeBookTree(grid) {
  const nodes = new Map(Array.from(grid.querySelectorAll('.specialization-talent'), node =>
    [Number((node.dataset.talentKey ?? node.id).slice('talent'.length)), node]));
  return observeTreeConnections(grid, [...nodes.values()], (bounds, appendPath) => {
    for (const [index, node] of nodes) {
      const current = node.getBoundingClientRect();
      const above = node.dataset.linkTop === 'true' ? nodes.get(index - 4)?.getBoundingClientRect() : null;
      const right = node.dataset.linkRight === 'true' ? nodes.get(index + 1)?.getBoundingClientRect() : null;
      if (above) {
        const x = current.left + current.width / 2 - bounds.left;
        appendPath(`M ${x} ${current.top - bounds.top} L ${x} ${above.bottom - bounds.top}`);
      }
      if (right) {
        const x1 = current.right - bounds.left;
        const x2 = right.left - bounds.left;
        const y1 = current.top + 22 - bounds.top;
        const y2 = right.top + 22 - bounds.top;
        appendPath(`M ${x1} ${y1} H ${(x1 + x2) / 2} V ${y2} H ${x2}`);
      }
    }
  });
}

export function observeForceTree(grid) {
  const base = grid.querySelector('.ffg-force-base');
  const upgrades = Array.from(grid.querySelectorAll('.force-power:not(.talent-hidden)'), node => ({
    node,
    index: Number(node.dataset.upgradeKey.slice('upgrade'.length)),
    width: Number(node.dataset.span),
    top: (node.dataset.topLinks.match(/\d+/g) ?? []).map(number => Number(number) - 1),
    right: node.dataset.linkRight === 'true',
  }));
  const occupied = new Map();
  for (const upgrade of upgrades) {
    for (let offset = 0; offset < upgrade.width; offset++) occupied.set(upgrade.index + offset, upgrade.node);
  }
  // Older powers without explicit links to the base open their first row.
  const implicitRoots = !upgrades.some(upgrade => upgrade.index < 4 && upgrade.top.length);
  return observeTreeConnections(grid, [base, ...upgrades.map(upgrade => upgrade.node)], (bounds, appendPath) => {
    const baseBounds = base.getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(grid).columnGap);
    for (const {node, index, width, top, right} of upgrades) {
      const current = node.getBoundingClientRect();
      const trackOffset = (current.width + gap) / width;
      const firstTrackCenter = (trackOffset - gap) / 2;
      const offsets = index < 4 && implicitRoots ? [0] : top;
      for (const offset of offsets) {
        const above = index < 4 ? baseBounds : occupied.get(index - 4 + offset)?.getBoundingClientRect();
        if (!above) continue;
        const x = current.left - bounds.left + firstTrackCenter + offset * trackOffset;
        appendPath(`M ${x} ${above.bottom - bounds.top} V ${current.top - bounds.top}`);
      }
      if (right && index % 4 + width < 4) {
        const adjacent = occupied.get(index + width)?.getBoundingClientRect();
        if (!adjacent) continue;
        const y = current.top + 22 - bounds.top;
        appendPath(`M ${current.right - bounds.left} ${y} H ${adjacent.left - bounds.left}`);
      }
    }
  });
}

