const system = 'starwarsffg';

function feather(ctx, width, height, amount) {
  const size = Math.min(width,height) * amount;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  for (const [x,y,dx,dy] of [[0,0,size,0],[width,0,-size,0],[0,0,0,size],[0,height,0,-size]]) {
    const gradient = ctx.createLinearGradient(x,y,x+dx,y+dy);
    gradient.addColorStop(0,'transparent');
    gradient.addColorStop(.45,'rgba(0,0,0,.55)');
    gradient.addColorStop(1,'black');
    ctx.fillStyle = gradient;
    ctx.fillRect(0,0,width,height);
  }
  ctx.restore();
}

function path(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (const point of points.slice(1)) ctx.lineTo(...point);
  ctx.closePath();
}

function tornEdge(ctx, image, width, height) {
  const unit = Math.min(width,height);
  const inset = unit * .015;
  const points = [];
  const corners = [[inset,inset],[width-inset,inset],[width-inset,height-inset],[inset,height-inset]];
  for (const [i,[x,y]] of corners.entries()) {
    const [endX,endY] = corners[(i+1)%corners.length];
    const dx = endX-x, dy = endY-y;
    const length = Math.hypot(dx,dy);
    const steps = Math.max(3,Math.round(length/(unit*.033)));
    for (let j=0; j<steps; j++) {
      const jag = (Math.sin(i*5+j*9.17)+.55*Math.cos(j*17.3))*inset*.66;
      points.push([x+dx*j/steps-dy/length*jag,y+dy*j/steps+dx/length*jag]);
    }
  }
  ctx.save();
  path(ctx,points);
  ctx.clip();
  ctx.drawImage(image,0,0,width,height);
  ctx.strokeStyle = '#d8c5a1';
  ctx.lineWidth = unit*.014;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,245,221,.7)';
  ctx.lineWidth *= .35;
  ctx.stroke();
  ctx.restore();
}

function vintageEdge(ctx, image, width, height) {
  const unit = Math.min(width,height), border = unit*.04;
  const paper = ctx.createLinearGradient(0,0,width,height);
  paper.addColorStop(0,'#ecdcc0');
  paper.addColorStop(.59,'#cab495');
  paper.addColorStop(1,'#a48969');
  ctx.fillStyle = paper;
  ctx.fillRect(border*.3,border*.3,width-border*.6,height-border*.6);
  ctx.filter = 'sepia(.48) saturate(.82) contrast(.94)';
  ctx.drawImage(image,border,border,width-border*2,height-border*2);
  ctx.filter = 'none';
  feather(ctx,width,height,.025);
}

function techEdge(ctx, image, width, height) {
  const unit = Math.min(width,height), cut = unit*.07, trim = unit*.022;
  const points = [
    [cut,trim],[width-cut,trim],[width-trim,cut],[width-trim,height-cut],
    [width-cut,height-trim],[cut,height-trim],[trim,height-cut],[trim,cut]
  ];
  ctx.save();
  path(ctx,points);
  ctx.clip();
  ctx.drawImage(image,0,0,width,height);
  ctx.strokeStyle = 'rgba(66,184,188,.6)';
  ctx.lineWidth = unit*.012;
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = '#8ee0d7';
  ctx.lineWidth = unit*.008;
  const accent = unit*.11;
  for (const [x,y,sx,sy] of [[trim,trim,1,1],[width-trim,trim,-1,1],
    [width-trim,height-trim,-1,-1],[trim,height-trim,1,-1]]) {
    ctx.beginPath();
    ctx.moveTo(x,y+sy*accent);
    ctx.lineTo(x,y+sy*(cut-trim));
    ctx.lineTo(x+sx*(cut-trim),y);
    ctx.lineTo(x+sx*accent,y);
    ctx.stroke();
  }
}

function portholeEdge(ctx, image, width, height) {
  const unit = Math.min(width,height), margin = unit*.018, rim = unit*.05, radius = unit*.09;
  const steel = ctx.createLinearGradient(0,0,width*.65,height);
  steel.addColorStop(0,'#647983');
  steel.addColorStop(.37,'#293943');
  steel.addColorStop(.65,'#1a252c');
  steel.addColorStop(1,'#526771');

  ctx.beginPath();
  ctx.roundRect(margin,margin,width-2*margin,height-2*margin,radius);
  ctx.fillStyle = steel;
  ctx.fill();
  ctx.strokeStyle = '#728892';
  ctx.lineWidth = unit*.004;
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  const insetX = width*.05, insetY = height*.05;
  ctx.roundRect(insetX,insetY,width-2*insetX,height-2*insetY,radius*.62);
  ctx.clip();
  ctx.drawImage(image,insetX,insetY,width-2*insetX,height-2*insetY);
  ctx.strokeStyle = '#101a20';
  ctx.lineWidth = unit*.012;
  ctx.stroke();
  ctx.restore();

  const bolt = unit*.083;
  for (const [x,y] of [[bolt,rim*.64],[width-bolt,rim*.64],[bolt,height-rim*.64],[width-bolt,height-rim*.64]]) {
    ctx.beginPath();
    ctx.arc(x,y,unit*.0085,0,Math.PI*2);
    ctx.fillStyle = '#879ca4';
    ctx.fill();
    ctx.strokeStyle = '#293a41';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x-unit*.005,y+unit*.003);
    ctx.lineTo(x+unit*.005,y-unit*.003);
    ctx.stroke();
  }
}

function hologramEdge(ctx, image, width, height) {
  ctx.drawImage(image,0,0,width,height);
  feather(ctx,width,height,.10);
  const unit = Math.min(width,height), inset = unit*.042, corner = unit*.052;
  ctx.beginPath();
  ctx.roundRect(inset,inset,width-2*inset,height-2*inset,corner);
  ctx.setLineDash([unit*.055,unit*.023,unit*.013,unit*.023]);
  ctx.shadowColor = '#43e2e5';
  ctx.shadowBlur = unit*.025;
  ctx.lineWidth = unit*.006;
  ctx.strokeStyle = 'rgba(132,241,237,.8)';
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(109,225,229,.33)';
  ctx.lineWidth = unit*.003;
  for (const y of [inset*.57,height-inset*.57]) {
    ctx.beginPath();
    ctx.moveTo(width*.27,y);
    ctx.lineTo(width*.73,y);
    ctx.stroke();
  }
}

function softShadowEdge(ctx, image, width, height) {
  const unit = Math.min(width,height);
  ctx.beginPath();
  ctx.roundRect(0,0,width,height,unit*.065);
  ctx.clip();
  ctx.drawImage(image,0,0,width,height);

  // Shade the rim while leaving the centre at its original brightness.
  ctx.globalCompositeOperation = 'source-atop';
  const depth = unit*.14;
  for (const [x,y,dx,dy] of [[0,0,depth,0],[width,0,-depth,0],[0,0,0,depth],[0,height,0,-depth]]) {
    const shadow = ctx.createLinearGradient(x,y,x+dx,y+dy);
    shadow.addColorStop(0,'rgba(0,0,0,.65)');
    shadow.addColorStop(.4,'rgba(0,0,0,.2)');
    shadow.addColorStop(1,'transparent');
    ctx.fillStyle = shadow;
    ctx.fillRect(0,0,width,height);
  }
  ctx.globalCompositeOperation = 'source-over';
  feather(ctx,width,height,.03);
}

const edgeRenderers = {
  none: (ctx,image,width,height) => ctx.drawImage(image,0,0,width,height),
  fade: (ctx,image,width,height) => {
    ctx.drawImage(image,0,0,width,height);
    feather(ctx,width,height,.10);
  },
  torn: tornEdge,
  vintage: vintageEdge,
  tech: techEdge,
  porthole: portholeEdge,
  hologram: hologramEdge,
  shadow: softShadowEdge
};
export const illustrationEdges = Object.keys(edgeRenderers);

export function drawIllustrationEdge(target, image, effect, maxSize) {
  const width = image.naturalWidth ?? image.width;
  const height = image.naturalHeight ?? image.height;
  if (!width || !height) return false;
  const scale = Math.min(1,maxSize/Math.max(width,height));
  target.width = Math.max(1,Math.round(width*scale));
  target.height = Math.max(1,Math.round(height*scale));
  const ctx = target.getContext('2d');
  const {width:w,height:h} = target;
  const render = Object.hasOwn(edgeRenderers,effect) ? edgeRenderers[effect] : edgeRenderers.none;
  render(ctx,image,w,h);
  return true;
}

// Keep the source texture on the Tile. Only its displayed mesh gets the treatment.
const decorated = new Map();
function setTileTexture(tile, texture) {
  tile.mesh.texture = texture;
  const {width,height,texture: {fit,scaleX,scaleY}} = tile.document;
  tile.mesh.resize(width,height,{fit,scaleX,scaleY});
}

function clearTile(tile) {
  const current = decorated.get(tile);
  if (!current) return;
  decorated.delete(tile);
  if (tile.mesh && !tile.mesh.destroyed && tile.mesh.texture === current.texture) setTileTexture(tile,tile.texture);
  current.texture.destroy(true);
}

function decorateTile(tile) {
  const scene = tile.document.parent;
  const baseId = scene?.getFlag(system,'planBase');
  const effect = scene?.getFlag(system,'planGalleryLayout')?.effect;
  const isIllustration = baseId && tile.document.getFlag(system,'planGalleryActor') === baseId;
  const current = decorated.get(tile);
  if (isIllustration && current?.effect === effect && current?.texture === tile.mesh?.texture) return;
  clearTile(tile);
  if (!isIllustration || effect === 'none' || !illustrationEdges.includes(effect) || !tile.mesh || tile.isVideo) return;
  const image = tile.sourceElement;
  if (!image) return;
  const drawing = document.createElement('canvas');
  if (!drawIllustrationEdge(drawing,image,effect,2048)) return;
  const texture = PIXI.Texture.from(drawing);
  setTileTexture(tile,texture);
  decorated.set(tile,{texture,effect});
}

globalThis.Hooks?.on('drawTile',decorateTile);
globalThis.Hooks?.on('destroyTile',clearTile);
globalThis.Hooks?.on('canvasTearDown',() => {
  for (const tile of decorated.keys()) clearTile(tile);
});
globalThis.Hooks?.on('updateScene',(scene,changes) => {
  const flags = changes.flags?.[system];
  if (scene.id !== globalThis.canvas?.scene?.id || !flags) return;
  const effect = Object.hasOwn(flags.planGalleryLayout ?? {},'effect') || Object.hasOwn(flags,'-=planGalleryLayout');
  const linked = Object.hasOwn(flags,'planBase') || Object.hasOwn(flags,'-=planBase');
  if (effect || linked) for (const tile of canvas.tiles.placeables) decorateTile(tile);
});
