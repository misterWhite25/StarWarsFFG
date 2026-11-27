import {localizeSystem} from "../helpers/system-localization.mjs";
import {reconcileSvg,reconcileSvgChildren} from './svg-reconcile.mjs';
import {vehicleMinionGroup} from '../helpers/vehicle-minion-group.mjs';
import { previewFlight, rangeBetween, tokenDiameter,movementRadius } from "./flight.mjs";
import {footprintCells,nearestHex} from "./hex.mjs";
import {tokenStatus} from "./token-status.mjs";
import {shipRanges} from "./ranges.mjs";
import {movementDestination} from "./movement.mjs";
import {orderedShips} from "./token-order.mjs";

const NS = "http://www.w3.org/2000/svg";
const plots = new WeakMap();
let nextId = 0;
let resizer;
const format = value => Number(value).toLocaleString(game.i18n?.lang, {maximumFractionDigits: 1});

function element(tag, attributes = {}, content) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (content !== undefined) node.textContent = content;
  return node;
}

function label(x, y, text, className, color) {
  return element("text", { x, y, class: className, fill: color, stroke: "#07111c", "stroke-width": 3,
    "paint-order": "stroke", "stroke-linejoin": "round", "text-anchor": "middle", "font-size": 12,
    "font-weight": 600, "pointer-events": "none" }, text);
}

function paintGrid(root, frame, id) {
  // One tactical unit separates adjacent centres. Two staggered rows repeat
  // every three circumradii, with a hexagon centred on the tactical origin.
  const width = frame.scale;
  const height = Math.sqrt(3) * width;
  const pattern = element("pattern", {
    id, patternUnits: "userSpaceOnUse", width, height,
    x: (frame.ox - width / 4) % width, y: frame.oy % height
  });
  const point = (column, row) => `${column * width / 4} ${row * height / 6}`;
  // Extend the crossing edges beyond the tile so no stroke runs along a seam.
  pattern.append(element("path", {
    d: [
      `M${point(-1,1)} L${point(1,2)} L${point(3,1)} L${point(5,2)}`,
      `M${point(-1,5)} L${point(1,4)} L${point(3,5)} L${point(5,4)}`,
      `M${point(1,2)} L${point(1,4)} M${point(3,-1)} L${point(3,1)} M${point(3,5)} L${point(3,7)}`
    ].join(" "),
    fill: "none", stroke: "#7297a6", "stroke-opacity": 0.21, "stroke-width": 1
  }));
  const defs = element("defs");
  defs.append(pattern);
  root.append(defs, element("rect", {
    class: "sc-hex-grid", width: "100%", height: "100%", fill: "url(#" + id + ")", "pointer-events": "none"
  }));
}

function paintCourse(root, ship, frame) {
  const plan = previewFlight(ship);
  if(plan.distance<1e-8)return;
  if(plan.limited&&!ship.destination) {
    const direction=plan.desiredHeading*Math.PI/180;
    const distance=Math.max(2,plan.distance*1.3);
    root.append(element("line",{class:"sc-requested-direction",x1:frame.x(ship.x),y1:frame.y(ship.y),
      x2:frame.x(ship.x+Math.cos(direction)*distance),y2:frame.y(ship.y+Math.sin(direction)*distance),
      stroke:"#ddba77","stroke-opacity":.7,"stroke-width":1.3,"stroke-dasharray":"3 7","pointer-events":"none"}));
  }
  const points = plan.path.map((point,index) => {
    const p = index === 0 || index === plan.path.length-1 ? nearestHex(point) : point;
    return frame.x(p.x) + "," + frame.y(p.y);
  }).join(" ");
  root.append(element("polyline", { class: "sc-trajectory", points, fill: "none", stroke: "#6ee7dd",
    "stroke-width": 2, "stroke-dasharray": "5 5", "pointer-events": "none" }));
  const destination = nearestHex(plan.end);
  const end = element("g", { class: "sc-destination", transform: `translate(${frame.x(destination.x)} ${frame.y(destination.y)})`,
    "data-destination-x":plan.end.x,"data-destination-y":plan.end.y,"data-destination-heading":plan.end.heading,
    fill: "#102e37", stroke: "#79efe7", "stroke-width": 1.6, "pointer-events": "none" });
  const cells=footprintCells({...ship,...plan.end});
  for(const cell of cells)end.append(element("polygon",{
    points:hexPoints((cell.x-destination.x)*frame.scale,-(cell.y-destination.y)*frame.scale,frame.scale*.95),
    fill:"#72ebe0","fill-opacity":.08,stroke:"#79efe7","stroke-opacity":.7,"stroke-width":1.2,"stroke-dasharray":"4 4"
  }));
  end.append(element("title", {}, localizeSystem("SWFFG.UI.SpaceCombat.ConfirmedPilotPosition")),
    element("path", { d: "M0 -10 L7 7 L0 4 L-7 7 Z",transform:`rotate(${90-plan.end.heading})` }));
  if(plan.distance) {
    const bottom=Math.max(...cells.map(cell=>(destination.y-cell.y+1/Math.sqrt(3))*frame.scale));
    end.append(label(0,bottom+16,localizeSystem("SWFFG.UI.SpaceCombat.ExpectedArrival"),"sc-destination-label","#a4fff0"));
  }
  root.append(end);
}

function paintRuler(root, from, to, frame) {
  const start = nearestHex(from), end = nearestHex(to);
  const x1 = frame.x(start.x), y1 = frame.y(start.y), x2 = frame.x(end.x), y2 = frame.y(end.y);
  const measure = rangeBetween(from, to);
  const group = element("g", { class: "sc-measure", "pointer-events": "none" });
  group.append(element("line", { x1, y1, x2, y2, stroke: "#edc477", "stroke-width": 1.5,
    "stroke-dasharray": "3 5" }), label((x1 + x2) / 2, (y1 + y2) / 2 - 8,
    format(measure.distance) + " u · " + measure.band, "sc-range-label", "#ffe6b1"));
  root.append(group);
}

function hexPoints(x,y,scale) {
  const radius = scale/Math.sqrt(3);
  return Array.from({length:6},(_,i)=>{
    const angle = (30+i*60)*Math.PI/180;
    return (x+radius*Math.cos(angle))+","+(y+radius*Math.sin(angle));
  }).join(" ");
}

function paintRanges(root,ship,ranges,frame) {
  const layer=element("g",{class:"sc-range-overlay","data-range-source":ship.id,
    "data-range-x":ship.x,"data-range-y":ship.y,"pointer-events":"none"});
  for(const band of ranges.bands.filter(band=>band.limit!==null)) {
    layer.append(element("circle",{class:"sc-range-boundary"+(band.weaponLimit?" is-weapon-limit":""),
      "data-band":band.key,"data-limit":band.limit,cx:frame.x(ship.x),cy:frame.y(ship.y),r:band.limit*frame.scale,
      fill:band.weaponLimit?band.color:"none","fill-opacity":.045,stroke:band.color,
      "stroke-width":band.weaponLimit?2.4:1.3,"stroke-opacity":band.weaponLimit?.9:.65}));
  }
  root.append(layer);
}
function paintRangeKey(root,ship,ranges,frame) {
  const width=198,height=ranges.usesAltitude?174:158;
  const key=element("g",{class:"sc-range-key",transform:`translate(${Math.max(8,frame.width-width-12)} 12)`,"pointer-events":"none"});
  key.append(element("rect",{width,height,rx:5,fill:"#10232e","fill-opacity":.95,stroke:"#536974","stroke-width":1}));
  const name=ship.name.length>27?ship.name.slice(0,26)+"…":ship.name;
  key.append(element("title",{},localizeSystem("SWFFG.UI.SpaceCombat.RangeOf", {name:ship.name})),element("text",{x:10,y:19,fill:"#e1f3f4","font-size":12,"font-weight":650},name));
  for(const band of ranges.bands) {
    const y=40+band.index*16;
    key.append(element("circle",{cx:13,cy:y-4,r:3,fill:band.color}),element("text",{
      x:23,y,fill:band.color,"font-size":11,"font-weight":band.weaponLimit?700:500
    },band.label+" "+(band.limit===null?"≥ "+ranges.bands[band.index-1].limit:"< "+band.limit)+" u"));
  }
  key.append(element("text",{x:10,y:126,fill:"#bde8d8","font-size":11},localizeSystem("SWFFG.UI.SpaceCombat.WeaponRange", {range:ranges.weaponRange??localizeSystem("SWFFG.UI.SpaceCombat.NotSpecified")})),
    element("text",{x:10,y:145,fill:"#afc2cb","font-size":10},localizeSystem("SWFFG.UI.SpaceCombat.WithinDistance")));
  if(ranges.usesAltitude)key.append(element("text",{x:10,y:162,fill:"#afc2cb","font-size":10},localizeSystem("SWFFG.UI.SpaceCombat.EqualAltitude")));
  root.append(key);
}
function paintRangeTarget(group,range,radius,hasWeapons) {
  const color=range.inRange?"#8fe0c5":range.color;
  const text=range.band+(range.inRange?" ✓":"");
  const width=Math.max(52,text.length*6.2+14),y=-radius-26;
  const indicator=element("g",{class:"sc-range-target","data-range-band":range.bandKey,"data-in-range":range.inRange,
    "data-range-distance":range.distance,"pointer-events":"none"});
  const description=range.inRange?localizeSystem("SWFFG.UI.SpaceCombat.InWeaponRange", {weapons:range.weapons.join(", ")}):hasWeapons?localizeSystem("SWFFG.UI.SpaceCombat.OutsideWeaponRange"):localizeSystem("SWFFG.UI.SpaceCombat.WeaponRangeUnknown");
  indicator.append(element("title",{},range.band+" · "+range.distance.toLocaleString(game.i18n?.lang,{maximumFractionDigits:3})+" u. "+description),
    element("circle",{r:radius+3,fill:"none",stroke:color,"stroke-width":range.inRange?2:1.2,"stroke-opacity":range.inRange?.9:.5,
      "stroke-dasharray":range.inRange?"none":"3 4"}),
    element("rect",{x:-width/2,y:y-11,width,height:18,rx:4,fill:"#0d202a","fill-opacity":.96,stroke:color,"stroke-width":1}));
  const caption=label(0,y+2,text,"sc-range-target-label",color);caption.setAttribute("font-size","11");indicator.append(caption);
  group.append(indicator);
}
function paintRangeButton(root,ship,frame,active) {
  const center=nearestHex(ship),radius=(ship.silhouette<5?.86:tokenDiameter(ship.silhouette))*frame.scale/2;
  const button=element("g",{class:"sc-token-ranges"+(active?" is-active":""),"data-range-ship":ship.id,
    transform:`translate(${frame.x(center.x)+radius+13} ${frame.y(center.y)-Math.max(18,radius*.65)})`,
    role:"button",tabindex:0,"aria-pressed":active,"aria-label":localizeSystem(active?"SWFFG.UI.SpaceCombat.HideRange":"SWFFG.UI.SpaceCombat.ShowRange", {name:ship.name}),cursor:"pointer"});
  button.append(element("title",{},localizeSystem(active?"SWFFG.UI.SpaceCombat.HideRange":"SWFFG.UI.SpaceCombat.ShowRange", {name:ship.name})),
    element("circle",{class:"sc-range-button-face",r:12,fill:active?"#24534d":"#102733",stroke:active?"#8fe0c5":"#91afc7","stroke-width":1.4}),
    element("circle",{r:7,fill:"none",stroke:"#ddf0f1","stroke-width":1,"pointer-events":"none"}),
    element("circle",{r:3.5,fill:"none",stroke:"#ddf0f1","stroke-width":1,"pointer-events":"none"}),
    element("path",{d:"M0 0 L6 -6",stroke:"#ddf0f1","stroke-width":1.5,"pointer-events":"none"}),
    element("circle",{r:1,fill:"#ddf0f1","pointer-events":"none"}));
  root.append(button);
}
function paintFrontButton(root,ship,frame) {
  const center=nearestHex(ship),radius=(ship.silhouette<5?.86:tokenDiameter(ship.silhouette))*frame.scale/2;
  const button=element("g",{class:"sc-token-front","data-front-ship":ship.id,
    transform:`translate(${frame.x(center.x)+radius+13} ${frame.y(center.y)-Math.max(18,radius*.65)-28})`,
    role:"button",tabindex:0,"aria-label":localizeSystem("SWFFG.UI.SpaceCombat.BringShipForward", {name:ship.name}),cursor:"pointer"});
  button.append(element("title",{},localizeSystem("SWFFG.UI.SpaceCombat.BringToFront")),
    element("circle",{class:"sc-front-button-face",r:12,fill:"#102733",stroke:"#91afc7","stroke-width":1.4}),
    element("rect",{x:-6,y:-2,width:8,height:8,rx:1,fill:"#102733",stroke:"#8aa6b4","stroke-width":1.2,"pointer-events":"none"}),
    element("rect",{x:-1,y:-7,width:8,height:8,rx:1,fill:"#d9f2f1",stroke:"#d9f2f1","stroke-width":1.2,"pointer-events":"none"}));
  root.append(button);
}

function paintStatus(group,status,radius,bottom,color) {
  const text=value=>value===null?"?":format(value);
  const direction=element("g",{class:"sc-token-heading",transform:`rotate(${90-status.heading})`,
    "data-current-heading":status.heading,"data-compass-heading":status.compass,"pointer-events":"none"});
  direction.append(element("title",{},localizeSystem("SWFFG.UI.SpaceCombat.CurrentHeading") + " "+status.direction+" ("+text(status.compass)+"°)"),
    element("path",{class:"sc-heading",d:`M-6 ${-radius+2} L0 ${-radius-9} L6 ${-radius+2} L0 ${-radius-1} Z`,
      fill:color,stroke:"#061017","stroke-width":2,"stroke-linejoin":"round","paint-order":"stroke"}));
  group.append(direction);
  const badgeWidth=Math.max(28,18+String(text(status.speed)).length*7);
  const badge=element("g",{class:"sc-token-speed","data-current-speed":status.speed??"unknown",
    transform:`translate(0 ${Math.max(0,radius-8)})`,"pointer-events":"none"});
  badge.append(element("title",{},localizeSystem("SWFFG.UI.SpaceCombat.CurrentSpeed") + " "+text(status.speed)),
    element("rect",{x:-badgeWidth/2,y:-9,width:badgeWidth,height:18,rx:5,fill:"#0b1922","fill-opacity":.96,stroke:color,"stroke-opacity":.8,"stroke-width":1}),
    element("text",{class:"sc-token-speed-value",x:0,y:4,fill:"#efffff","text-anchor":"middle","font-size":11,"font-weight":700},localizeSystem("SWFFG.UI.SpaceCombat.SpeedBadge", {speed:text(status.speed)})));
  group.append(badge);
  const damageColor={normal:"#79d3ab",warning:"#edbf68",danger:"#f17c7c",unknown:"#a3b2bb"}[status.tone];
  const width=Math.max(46,Math.min(100,radius*1.7));
  const damage=element("g",{class:"sc-token-damage is-"+status.tone,"data-damage":status.damage??"unknown",
    "data-damage-threshold":status.threshold??"unknown","data-damage-ratio":status.ratio??"unknown",
    transform:`translate(0 ${bottom+23})`,"pointer-events":"none"});
  const caption=localizeSystem("SWFFG.UI.SpaceCombat.DamageShort") + " "+text(status.damage)+" / "+text(status.threshold)+(status.criticals?" · Crit. "+status.criticals:"");
  damage.append(element("title",{},localizeSystem("SWFFG.UI.SpaceCombat.HullTaken") + " "+text(status.damage)+" / "+text(status.threshold)+
      (status.exceeded?localizeSystem("SWFFG.UI.SpaceCombat.ThresholdExceeded"):"")+(status.criticals?" " + localizeSystem("SWFFG.UI.SpaceCombat.CriticalHits") + " "+status.criticals+".":"")),
    element("rect",{class:"sc-damage-track",x:-width/2,y:0,width,height:6,rx:3,fill:"#08151d",stroke:damageColor,"stroke-opacity":.7,"stroke-width":1}));
  if(status.ratio!==null)damage.append(element("rect",{class:"sc-damage-fill",x:-width/2,y:0,width:width*status.ratio,height:6,rx:3,fill:damageColor}));
  damage.append(label(0,20,caption,"sc-token-damage-value",damageColor));
  group.append(damage);
}

function paintShip(root, ship, frame, selected, targeted, plotId, selectable,range,hasWeapons,status=tokenStatus(ship),minions=vehicleMinionGroup(game.actors.get(ship.actorId))) {
  const center = nearestHex(ship), cells = footprintCells(ship);
  const diameter = (ship.silhouette < 5 ? 0.86 : tokenDiameter(ship.silhouette)) * frame.scale;
  const radius = diameter / 2;
  const active = ship.id === selected;
  const color = active ? "#72ebe0" : targeted ? "#edc477" : "#b2cbd5";
  const group = element("g", { class: "sc-ship" + (active ? " is-selected" : "") + (targeted ? " is-target" : ""),
    "data-ship": ship.id, "data-hex-count":cells.length, transform: `translate(${frame.x(center.x)} ${frame.y(center.y)})`,
    role: "button", tabindex: selectable?0:-1, "aria-label": localizeSystem("SWFFG.UI.SpaceCombat.ShipAria", {name:ship.name, silhouette:ship.silhouette, direction:status.direction, speed:status.speed??"?", damage:status.damage??"?", threshold:status.threshold??localizeSystem("SWFFG.UI.SpaceCombat.UnknownThreshold")}),
    "aria-pressed": active, "aria-disabled":!selectable, cursor: selectable?"pointer":"default" });
  group.append(element("title", {}, localizeSystem("SWFFG.UI.SpaceCombat.ShipTooltip", {name:ship.name, silhouette:ship.silhouette, hexes:cells.length, direction:status.direction, heading:format(status.compass), speed:status.speed??"?"})));
  const defs = element("defs"), clip = element("clipPath",{id:plotId+"-clip-"+ship.id,clipPathUnits:"userSpaceOnUse"});
  const footprint = element("g",{class:"sc-ship-footprint"});
  for (const cell of cells) {
    const points = hexPoints((cell.x-center.x)*frame.scale,-(cell.y-center.y)*frame.scale,frame.scale*0.97);
    clip.append(element("polygon",{points:hexPoints((cell.x-center.x)*frame.scale,-(cell.y-center.y)*frame.scale,frame.scale*(cells.length===1 ? 0.97 : 1))}));
    footprint.append(element("polygon",{
      points,class:"sc-ship-ring",fill:color,"fill-opacity":active ? 0.13 : 0.045,
      stroke:color,"stroke-width":active ? 1.5 : 1,"stroke-opacity":active || targeted ? 0.85 : 0.3
    }));
  }
  const tokenClipId=plotId+"-token-"+ship.id;
  const tokenClip=element("clipPath",{id:tokenClipId,clipPathUnits:"userSpaceOnUse"});
  tokenClip.append(element("circle",{r:radius*0.93}));
  defs.append(clip,tokenClip);group.append(defs,footprint);
  const artwork = element("g",{"clip-path":"url(#"+plotId+"-clip-"+ship.id+")"});
  artwork.append(element("circle",{
    class:"sc-token-frame",r:radius,fill:"#13242d",stroke:color,
    "stroke-width":active?2:1.5,"pointer-events":"none"
  }));
  const facing = element("g", { transform: "rotate(" + (90 - ship.heading) + ")" });
  if (ship.image) {
    const src = /^[^/:]+\//.test(ship.image) ? (globalThis.foundry?.utils?.getRoute?.(ship.image) ?? ship.image) : ship.image;
    const subject=element("g",{"clip-path":"url(#"+tokenClipId+")"});
    subject.append(element("image", { class: "sc-ship-image", href: src, x: -radius*0.93, y: -radius*0.93,
      width: diameter*0.93, height: diameter*0.93, preserveAspectRatio: "xMidYMid slice", "pointer-events": "none" }));
    facing.append(subject);
  }
  artwork.append(facing);
  const bottom = Math.max(...cells.map(cell=>(center.y-cell.y+1/Math.sqrt(3))*frame.scale));
  group.append(artwork, label(0, bottom + 15, ship.name, "sc-ship-name", color));
  if(minions.enabled){const text=minions.alive+' / '+minions.count,width=Math.max(34,text.length*7+10),badge=element('g',{class:'sc-token-minion-count','data-group-alive':minions.alive,'data-group-count':minions.count,transform:'translate('+(-radius+10)+' '+(-radius+10)+')','pointer-events':'none'});badge.append(element('title',{},localizeSystem("SWFFG.UI.SpaceCombat.AliveCraft", {alive:minions.alive, count:minions.count})),element('rect',{x:-width/2,y:-9,width,height:18,rx:5,fill:'#182c3b',stroke:'#bdcad8','stroke-width':1}),element('text',{x:0,y:4,fill:'#fff5d7','text-anchor':'middle','font-size':11,'font-weight':700},text));group.append(badge);}
  if(range)paintRangeTarget(group,range,radius,hasWeapons);
  paintStatus(group,status,radius,bottom,color);
  root.append(group);
}

export function drawPlot(svg, options={}) {
  const existing=plots.get(svg);
  if(existing){existing.update(options);return existing.dispose;}
  let {ships=[],selected,targetId,camera={},canReposition=false,canNavigate=true,canSelect=()=>true,choosingDirection=false,rangeShipId=null,onToggleRanges,
    onDirection,onCancelDirection,onBringToFront,onSelect,onMove,onCamera,onDropActor}=options;
  const id = "swffg-plot-" + ++nextId;
  const events = new AbortController();
  let selectedId = selected?.id ?? selected;
  let view = { x: camera.x ?? 0, y: camera.y ?? 0, width: camera.width > 0 ? camera.width : 24 };
  let gesture = null;
  let hoverDestination=null;
  let frontShipId=null;
  let renderFrame=null;
  const frame = () => {
    const rect = svg.getBoundingClientRect();
    const width = rect.width || 800, height = rect.height || 500;
    const scale = width / view.width;
    const ox = width / 2 - view.x * scale, oy = height / 2 + view.y * scale;
    return { rect, width, height, ox, oy, scale, x: x => ox + x * scale, y: y => oy - y * scale };
  };
  const pointAt = (clientX, clientY) => {
    const f = frame();
    return { x: (clientX - f.rect.left - f.ox) / f.scale, y: (f.oy - clientY + f.rect.top) / f.scale };
  };
  function scheduleRender() {
    if(renderFrame===null)renderFrame=requestAnimationFrame(()=>{renderFrame=null;render();});
  }
  const gridLayer=element('g',{class:'sc-grid-layer'}),worldLayer=element('g',{class:'sc-world-layer'}),legendLayer=element('g',{class:'sc-legend-layer'});
  const rangeLayer=element('g',{class:'sc-range-layer'}),movementLayer=element('g',{class:'sc-movement-layer'}),courseLayer=element('g',{class:'sc-course-layer'}),shipLayer=element('g',{class:'sc-ships-layer'}),buttonLayer=element('g',{class:'sc-buttons-layer'}),frontLayer=element('g',{class:'sc-front-layer'});
  worldLayer.append(rangeLayer,movementLayer,courseLayer,shipLayer,buttonLayer,frontLayer);
  svg.replaceChildren(element('title',{},localizeSystem("SWFFG.UI.SpaceCombat.TacticalMap")),gridLayer,worldLayer,legendLayer);
  const retainedShips=new Map();
  let modelsChanged=true,lastScale,lastPreview,lastHover,lastFront,lastLegendWidth,prepared=[],ranges,rangeSource,targetRanges=new Map();
  function updateMovement(from,f){
    const layer=element('g');
    if(from&&choosingDirection){
      const radius=movementRadius(from),zone=element('g',{class:'sc-movement-zone','data-movement-radius':radius,'pointer-events':'none'});
      zone.append(element('circle',{cx:f.x(from.x),cy:f.y(from.y),r:radius*f.scale,fill:'#72ebe0','fill-opacity':.08,stroke:'#72ebe0','stroke-width':2,'stroke-dasharray':'7 4'}),
        label(f.x(from.x),f.y(from.y)-radius*f.scale-10,localizeSystem("SWFFG.UI.SpaceCombat.MovementRadius", {radius:format(radius)}),'sc-movement-label','#affff1'));
      if(hoverDestination)zone.append(element('polygon',{class:'sc-movement-hover',points:hexPoints(f.x(hoverDestination.x),f.y(hoverDestination.y),f.scale*.96),fill:'#72ebe0','fill-opacity':.3,stroke:'#d7fff6','stroke-width':2}));
      layer.append(zone);
    }
    reconcileSvgChildren(movementLayer,layer);
  }
  function render() {
    if(renderFrame!==null){cancelAnimationFrame(renderFrame);renderFrame=null;}
    const screen=frame(),f={...screen,x:x=>x*screen.scale,y:y=>-y*screen.scale};
    const changedScale=lastScale!==f.scale,preview=gesture?.preview,key=preview?gesture.ship.id+':'+preview.x+':'+preview.y:null;
    const changedModels=modelsChanged||key!==lastPreview;
    svg.setAttribute('viewBox',`0 0 ${screen.width} ${screen.height}`);
    worldLayer.setAttribute('transform',`translate(${screen.ox} ${screen.oy})`);
    if(changedScale){const grid=element('g');paintGrid(grid,screen,id);reconcileSvgChildren(gridLayer,grid);}
    else {
      const pattern=gridLayer.querySelector('pattern');
      pattern.setAttribute('x',(screen.ox-screen.scale/4)%screen.scale);
      pattern.setAttribute('y',screen.oy%(Math.sqrt(3)*screen.scale));
    }
    const focus=svg.contains(document.activeElement)?document.activeElement:null;
    if(changedModels){
      const fleet=preview?ships.map(ship=>ship.id===gesture.ship.id?{...ship,...preview}:ship):ships;
      rangeSource=fleet.find(ship=>ship.id===rangeShipId&&canSelect(ship));
      ranges=rangeSource?shipRanges(rangeSource,fleet):null;
      targetRanges=new Map((ranges?.targets??[]).map(range=>[range.shipId,range]));
      prepared=orderedShips(fleet).map(ship=>{
        const status=tokenStatus(ship),minions=vehicleMinionGroup(game.actors.get(ship.actorId)),selectable=canSelect(ship),range=targetRanges.get(ship.id);
        return {ship,status,minions,selectable,range,key:JSON.stringify([ship.name,ship.image,ship.x,ship.y,ship.heading,ship.silhouette,ship.id===selectedId,ship.id===targetId,status,minions.enabled,minions.alive,minions.count,selectable,range,ranges?.maximum>=0])};
      });
    }
    const from=prepared.find(entry=>entry.ship.id===selectedId)?.ship,target=prepared.find(entry=>entry.ship.id===targetId)?.ship;
    const hover=hoverDestination?hoverDestination.x+':'+hoverDestination.y:null;
    if(changedModels||changedScale){
      const overlay=element('g');if(ranges)paintRanges(overlay,rangeSource,ranges,f);reconcileSvgChildren(rangeLayer,overlay);
      const course=element('g');if(from)paintCourse(course,from,f);if(from&&target&&from.id!==target.id)paintRuler(course,from,target,f);reconcileSvgChildren(courseLayer,course);
      const present=new Set();
      for(const [index,entry]of prepared.entries()){
        const {ship,status,minions,selectable,range}=entry;present.add(ship.id);
        let retained=retainedShips.get(ship.id);
        if(!retained||retained.key!==entry.key||changedScale){
          const holder=element('g');paintShip(holder,ship,f,selectedId,ship.id===targetId,id,selectable,range,ranges?.maximum>=0,status,minions);
          const next=holder.children[0];
          if(retained)reconcileSvg(retained.node,next);else retained={node:next};
          retained.key=entry.key;retainedShips.set(ship.id,retained);
        }
        if(shipLayer.children[index]!==retained.node)shipLayer.insertBefore(retained.node,shipLayer.children[index]??null);
      }
      for(const [shipId,entry]of retainedShips)if(!present.has(shipId)){entry.node.remove();retainedShips.delete(shipId);}
      const buttons=element('g');for(const {ship,selectable}of prepared)if(selectable&&onToggleRanges)paintRangeButton(buttons,ship,f,ship.id===rangeShipId);reconcileSvgChildren(buttonLayer,buttons);
    }
    if(changedModels||changedScale||hover!==lastHover)updateMovement(from,f);
    if(changedModels||changedScale||frontShipId!==lastFront){
      const front=element('g'),ship=prepared.find(entry=>entry.ship.id===frontShipId&&entry.selectable)?.ship;
      if(ship&&onBringToFront)paintFrontButton(front,ship,f);reconcileSvgChildren(frontLayer,front);
    }
    if(changedModels||screen.width!==lastLegendWidth){const legend=element('g');if(ranges)paintRangeKey(legend,rangeSource,ranges,screen);reconcileSvgChildren(legendLayer,legend);}
    modelsChanged=false;lastScale=f.scale;lastPreview=key;lastHover=hover;lastFront=frontShipId;lastLegendWidth=screen.width;
    if(focus?.isConnected&&document.activeElement!==focus)focus.focus({preventScroll:true});
  }
  const listen = (type, listener, options) => svg.addEventListener(type, listener, { ...options, signal: events.signal });
  const finishCamera = () => onCamera?.({ ...view });
  function zoom(factor, point) {
    const width = Math.min(160, Math.max(4, view.width * factor));
    const ratio = width / view.width;
    view = { x: point.x + (view.x - point.x) * ratio, y: point.y + (view.y - point.y) * ratio, width };
    scheduleRender();
    finishCamera();
  }
  listen("wheel", event => {
    if (!canNavigate) return;
    event.preventDefault();
    const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? frame().height : 1;
    zoom(Math.exp(Math.max(-2, Math.min(2, event.deltaY * units * 0.0015))), pointAt(event.clientX, event.clientY));
  }, { passive: false });
  const hideFrontButton=()=>{
    frontShipId=null;lastFront=null;
    svg.querySelector("[data-front-ship]")?.remove();
  };
  listen("contextmenu",event=>{
    const shipId=event.target.closest?.("[data-ship],[data-front-ship]")?.dataset;
    const ship=ships.find(ship=>ship.id===(shipId?.ship??shipId?.frontShip));
    hideFrontButton();
    if(!ship||!canSelect(ship)||!onBringToFront)return;
    event.preventDefault();event.stopPropagation();
    frontShipId=ship.id;
    render();
    svg.querySelector("[data-front-ship]")?.focus({preventScroll:true});
  });
  document.addEventListener("pointerdown",event=>{
    if(!svg.contains(event.target))hideFrontButton();
  },{signal:events.signal});
  listen("pointerdown", event => {
    if (gesture || (event.button !== 0 && event.button !== 1)) return;
    const frontButton=event.target.closest?.("[data-front-ship]");
    hideFrontButton();
    if(frontButton&&event.button===0){event.preventDefault();event.stopPropagation();onBringToFront?.(frontButton.dataset.frontShip);return;}
    const rangeButton=event.target.closest?.("[data-range-ship]");
    if(rangeButton&&event.button===0) {
      event.preventDefault();event.stopPropagation();onToggleRanges?.(rangeButton.dataset.rangeShip);return;
    }
    if(choosingDirection&&event.button===0&&!event.altKey) {
      event.preventDefault();event.stopPropagation();
      onDirection?.(pointAt(event.clientX,event.clientY));return;
    }
    const shipId = event.target.closest?.("[data-ship]")?.dataset.ship;
    const ship = ships.find(s => s.id === shipId);
    const panOnly = event.button === 1 || event.altKey;
    if (panOnly && !canNavigate) return;
    gesture = { pointer: event.pointerId, sx: event.clientX, sy: event.clientY, view: { ...view }, ship,
      mode: panOnly ? "pan" : ship && canReposition ? "ship" : "pan", moved: false, panOnly };
    svg.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  listen("pointermove", event => {
    if(choosingDirection&&!gesture) {
      if(event.target.closest?.("[data-front-ship],[data-range-ship]"))return;
      const ship=ships.find(ship=>ship.id===selectedId);
      let destination=null;
      try{destination=movementDestination(ship,pointAt(event.clientX,event.clientY));}catch{ /* An unreachable destination has no movement highlight. */ }
      if((hoverDestination?.x??null)===(destination?.x??null)&&(hoverDestination?.y??null)===(destination?.y??null))return;
      hoverDestination=destination;
      scheduleRender();return;
    }
    if (gesture?.pointer !== event.pointerId) return;
    const dx = event.clientX - gesture.sx, dy = event.clientY - gesture.sy;
    if (!gesture.moved && Math.hypot(dx, dy) < 4) return;
    gesture.moved = true;
    const scale = frame().scale;
    if (gesture.mode === "ship") {
      gesture.preview = nearestHex({ x: gesture.ship.x + dx / scale, y: gesture.ship.y - dy / scale });
    } else if (canNavigate) {
      view = { ...gesture.view, x: gesture.view.x - dx / scale, y: gesture.view.y + dy / scale };
    } else return;
    scheduleRender();
  });
  function release() {
    const current = gesture;
    gesture = null;
    if (current && svg.hasPointerCapture(current.pointer)) svg.releasePointerCapture(current.pointer);
    return current;
  }
  listen("pointerup", event => {
    if (gesture?.pointer !== event.pointerId) return;
    const finished = release();
    if (finished.preview) {
      render();
      onMove?.(finished.ship.id, finished.preview);
    }
    else if (finished.moved && canNavigate) finishCamera();
    else if (!finished.moved && !finished.panOnly) {
      if (finished.ship&&canSelect(finished.ship)) onSelect?.(finished.ship.id);
    }
  });
  function cancel(event) {
    if (gesture?.pointer !== event.pointerId) return;
    view = release().view;
    render();
  }
  listen("pointercancel", cancel);
  listen("lostpointercapture", cancel);
  listen("keydown", event => {
    if(frontShipId&&event.key==="Escape"){
      hideFrontButton();svg.focus({preventScroll:true});
      event.preventDefault();event.stopPropagation();return;
    }
    if(choosingDirection&&event.key==="Escape") {
      event.preventDefault();event.stopPropagation();onCancelDirection?.();return;
    }
    const frontId=event.target.closest?.("[data-front-ship]")?.dataset.frontShip;
    if(frontId&&(event.key==="Enter"||event.key===" ")){event.preventDefault();event.stopPropagation();hideFrontButton();svg.focus({preventScroll:true});onBringToFront?.(frontId);return;}
    const rangeId=event.target.closest?.("[data-range-ship]")?.dataset.rangeShip;
    if(rangeId&&(event.key==="Enter"||event.key===" ")) {
      event.preventDefault();event.stopPropagation();onToggleRanges?.(rangeId);return;
    }
    const shipId = event.target.closest?.("[data-ship]")?.dataset.ship;
    if (event.key === "Enter" || event.key === " ") {
      if (shipId&&canSelect(ships.find(ship=>ship.id===shipId))) onSelect?.(shipId);
      else return;
    } else if (!canNavigate) return;
    else if (["+", "=", "-"].includes(event.key)) zoom(event.key === "-" ? 1.25 : 0.8, view);
    else {
      const shift = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[event.key];
      if (!shift) return;
      const step = view.width / 12;
      view = { ...view, x: view.x + shift[0] * step, y: view.y + shift[1] * step };
      render();
      finishCamera();
    }
    event.preventDefault();
    event.stopPropagation();
  });
  listen("dragover", event => {
    if (!canReposition || !onDropActor) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  });
  listen("drop", event => {
    if (!canReposition || !onDropActor) return;
    event.preventDefault();
    event.stopPropagation();
    const payload = event.dataTransfer.getData("text/plain") || event.dataTransfer.getData("application/json");
    let data;
    try { data = JSON.parse(payload); } catch { return; }
    if (data?.type === "Actor") onDropActor(data, nearestHex(pointAt(event.clientX, event.clientY)));
  });

  svg.setAttribute("tabindex", "0");
  svg.setAttribute("role", "group");
  svg.setAttribute("aria-label", localizeSystem("SWFFG.UI.SpaceCombat.Map"));
  svg.style.touchAction = "none";
  svg.classList.toggle("sc-choosing-direction",choosingDirection);
  const dispose = () => {
    if (events.signal.aborted) return;
    events.abort();
    if(renderFrame!==null){cancelAnimationFrame(renderFrame);renderFrame=null;}
    release();
    resizer?.unobserve(svg);
    plots.delete(svg);
  };
  dispose.view=camera=>{view={...view,...camera};scheduleRender();};
  const update=options=>{
    ({ships=[],selected,targetId,camera={},canReposition=false,canNavigate=true,canSelect=()=>true,choosingDirection=false,rangeShipId=null,onToggleRanges,onDirection,onCancelDirection,onBringToFront,onSelect,onMove,onCamera,onDropActor}=options);
    selectedId=selected?.id??selected;view={x:camera.x??view.x,y:camera.y??view.y,width:camera.width>0?camera.width:view.width};
    modelsChanged=true;svg.classList.toggle('sc-choosing-direction',choosingDirection);render();
  };
  plots.set(svg, { render:scheduleRender, dispose,update });
  if (typeof ResizeObserver !== "undefined") {
    resizer ??= new ResizeObserver(entries => {
      for (const { target } of entries) {
        const plot = plots.get(target);
        if (!target.isConnected) plot?.dispose();
        else plot?.render();
      }
    });
    resizer.observe(svg);
  }
  render();
  return dispose;
}
