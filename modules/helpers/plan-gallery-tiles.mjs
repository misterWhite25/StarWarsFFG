import {illustrationEdges} from './illustration-edges.mjs';

const scope = 'starwarsffg';
export const gallerySides = ['around', 'top', 'bottom', 'left', 'right'];
export const galleryLayouts = ['strip', 'grid'];

export const galleryMargins = ['keep', 'wide', 'max'];
const marginValues = {keep:0, wide:.35, max:.5};

export function galleryPadding(settings, currentPadding) {
  return Math.max(currentPadding, marginValues[settings.margin]);
}

export function normalizeGalleryLayout(settings) {
  const {side, layout, size, margin, effect} = settings ?? {};
  return {
    side: gallerySides.includes(side) ? side : 'around',
    layout: galleryLayouts.includes(layout) ? layout : 'strip',
    margin: galleryMargins.includes(margin) ? margin : 'keep',
    effect: illustrationEdges.includes(effect) ? effect : 'none',
    size: Number.isFinite(size) ? Math.max(25, Math.min(100, size)) : 100
  };
}

function groupCells(area, count, useGrid) {
  const across = useGrid ? Math.ceil(Math.sqrt(count)) : count;
  const depth = Math.ceil(count / across);
  const columns = area.horizontal ? across : depth;
  const rows = area.horizontal ? depth : across;
  return {area, count, across, columns, rows, cellWidth:area.width / columns, cellHeight:area.height / rows};
}

function tilePosition(group, index, frame, compact) {
  const {area, across, count, columns, rows, cellWidth, cellHeight} = group;
  const line = Math.floor(index / across);
  const offset = index % across;
  const lineCount = Math.min(across, count - line * across);
  const center = (position, total) => position - (total - 1) / 2;
  const column = area.horizontal ? center(offset, lineCount) : center(line, columns);
  const row = area.horizontal ? center(line, rows) : center(offset, lineCount);
  const gap = Math.max(1, Math.round(Math.min(frame.width, frame.height) * .12));
  const stepX = compact ? Math.min(cellWidth, frame.width + gap) : cellWidth;
  const stepY = compact ? Math.min(cellHeight, frame.height + gap) : cellHeight;
  return {
    x: Math.round(area.x + area.width / 2 + column * stepX),
    y: Math.round(area.y + area.height / 2 + row * stepY)
  };
}

export function galleryTiles(actor, dimensions, levelId, settings) {
  const entries = Object.entries(actor.getFlag(scope, 'baseGallery') ?? {})
    .filter(([, image]) => image?.path)
    .sort(([idA, a], [idB, b]) => a.name.localeCompare(b.name, game.i18n.lang, {numeric:true}) || idA.localeCompare(idB));
  if (!entries.length) return [];
  const {side, layout, size, margin} = normalizeGalleryLayout(settings);
  const {sceneX:x, sceneY:y, sceneWidth:w, sceneHeight:h, width, height} = dimensions;
  const right = x + w, bottom = y + h;
  // With wider margins, each side gets one corner to lengthen all four rows.
  const useCorners = side === 'around' && margin !== 'keep' && x > 0 && y > 0 && right < width && bottom < height;
  const areas = [
    {side:'top', x:useCorners ? 0 : x, y:0, width:useCorners ? right : w, height:y, horizontal:true},
    {side:'bottom', x, y:bottom, width:useCorners ? width-x : w, height:height-bottom, horizontal:true},
    {side:'right', x:right, y:useCorners ? 0 : y, width:width-right, height:useCorners ? bottom : h, horizontal:false},
    {side:'left', x:0, y, width:x, height:useCorners ? height-y : h, horizontal:false}
  ].filter(area => (side === 'around' || area.side === side) && area.width >= 4 && area.height >= 4);
  if (!areas.length) throw Error(game.i18n.localize('SWFFG.BasePlan.TileMargin'));

  // Alternate opposite sides in automatic mode. A selected side groups its tiles around its center.
  const compact = side !== 'around';
  const groups = areas.map((area,i) => ({area,count:Math.ceil((entries.length-i) / areas.length)}))
    .filter(group => group.count > 0)
    .map(({area,count}) => groupCells(area, count, compact && layout === 'grid'));
  const maxWidth = Math.min(w/2, ...groups.map(group => group.cellWidth));
  const maxHeight = Math.min(h/2, ...groups.map(group => group.cellHeight));
  if (Math.min(maxWidth,maxHeight) < 2) throw Error(game.i18n.localize('SWFFG.BasePlan.TileMargin'));
  const factor = .009 * size;
  const frame = {
    width: Math.max(1, Math.floor(factor * (compact ? Math.min(maxWidth, maxHeight * 4/3) : maxWidth))),
    height: Math.max(1, Math.floor(factor * (compact ? Math.min(maxHeight, maxWidth * 3/4) : maxHeight)))
  };

  let index = 0;
  return groups.flatMap(group => Array.from({length:group.count}, (_, i) => {
    const [id, image] = entries[index++];
    return {
      _id:id, name:image.name, texture:{src:image.path, fit:'contain', anchorX:.5, anchorY:.5},
      ...tilePosition(group,i,frame,compact), ...frame, levels:[levelId],
      flags:{[scope]:{planGalleryActor:actor.id, planGalleryImage:id}}
    };
  }));
}

export async function arrangeGalleryTiles(actor, scene, settings) {
  const existing = new Map(scene.tiles.filter(tile => tile.getFlag(scope,'planGalleryActor') === actor.id)
    .map(tile => [tile.getFlag(scope,'planGalleryImage'), tile]));
  const create = [], update = [];
  for (const data of galleryTiles(actor, scene.getDimensions(), scene.initialLevel.id, settings)) {
    const tile = existing.get(data._id);
    if (!tile) {
      if (scene.tiles.has(data._id)) data._id = foundry.utils.randomID();
      create.push(data);
    } else {
      const {x,y,width,height} = data;
      if (tile.x !== x || tile.y !== y || tile.width !== width || tile.height !== height || tile.rotation) {
        update.push({_id:tile.id, x,y,width,height, rotation:0});
      }
    }
  }
  if (create.length) await scene.createEmbeddedDocuments('Tile',create,{keepId:true});
  if (update.length) await scene.updateEmbeddedDocuments('Tile',update);
}
