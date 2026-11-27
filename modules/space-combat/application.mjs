import {localizeSystem, localizedSystemError} from "../helpers/system-localization.mjs";
import {renderScheduler} from '../helpers/render-scheduler.mjs';
import {actorAffectsSpaceCombat,combatAffectsSpaceCombat} from './refresh-policy.mjs';
import { board, command, registerBoard, shipAppearance } from "./board.mjs";
import { previewFlight, tokenDiameter,movementRadius } from "./flight.mjs";
import { drawPlot } from "./plot.mjs";
import {combatCard} from "./combat-card.mjs";
import { registerSharing } from "./sharing.mjs";
import {enterCombatScene,leaveCombatScene,hasCombatSceneReturn} from "./scene-view.mjs";
import {nearestHex} from "./hex.mjs";
import {fitBehindInterface} from "./interface-layer.mjs";
import {movementDestination} from "./movement.mjs";
import {canSelectShip,crewRoster,isNavigationRole,controlsCrewMember} from "./crew-access.mjs";
import {maneuverCost,maneuverCostLabel} from "./combat-rules.mjs";
import {initiativeContext,initiativeStamp,initiativeReason} from "./initiative.mjs";

const title = "SWFFG.UI.SpaceCombat.Title";
const initialCamera = () => ({ x: 0, y: 0, width: 24 });
const fmt = value => Number(value).toLocaleString(globalThis.game?.i18n?.lang, { maximumFractionDigits: 2 });
function escape(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
const icon = name => `<i class="fa-solid fa-${name}" aria-hidden="true"></i>`;
const action = (cmd, label, glyph, css = "", disabled = false) =>
  `<button type="button" class="${css}" data-cmd="${cmd}" ${disabled ? "disabled" : ""}>${glyph ? icon(glyph) : ""}${label}</button>`;
const report = error => {
  console.warn("Star Wars FFG | Combat spatial", error);
  ui.notifications.warn(error?.message || String(error));
};
let app;

function courseText(ship,draft,choosingDirection=false) {
  const planned={...ship,destination:draft.destination},plan=previewFlight(planned),hex=nearestHex(plan.end);
  const ready=draft.destinationChosen&&!choosingDirection;
  return {arrival:draft.destinationChosen?localizeSystem("SWFFG.UI.SpaceCombat.DestinationReadout", {q:hex.q, r:hex.r, distance:fmt(plan.distance), limit:fmt(movementRadius(ship))}):localizeSystem("SWFFG.UI.SpaceCombat.NoDestination"),
    flightStatus:ready?localizeSystem("SWFFG.UI.SpaceCombat.AwaitingConfirmation"):localizeSystem("SWFFG.UI.SpaceCombat.YourMove"),
    instruction:ready?localizeSystem("SWFFG.UI.SpaceCombat.FlightConfirmStep"):localizeSystem("SWFFG.UI.SpaceCombat.FlightSelectStep")};
}

class SpaceCombat extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "ffg-space-combat", classes: ["sc-window","sc-scene-view"],
    window: { frame:false,positioned:false,title, icon: "fa-solid fa-satellite", resizable: false }
  };

  camera = initialCamera();
  selected = null;
  targetId = null;
  rangeShipId = null;
  draft = null;
  disposePlot = null;
  disposeInterface = null;
  busy = false;
  choosingDirection = false;

  get ship() { return board().ships.find(ship => ship.id === this.selected); }
  get flightMember() {
    if(this.draft?.version!==this.ship?.version)return null;
    return crewRoster(game.actors.get(this.ship?.actorId)).find(member=>member.actor_id===this.draft?.crewId&&isNavigationRole(member)&&controlsCrewMember(member)&&!initiativeReason(member))??null;
  }
  get widgets() { return this.element?.querySelector(".sc-console"); }
  selectShip(id) {
    const ship=board().ships.find(ship=>ship.id===id);
    if(!ship||!canSelectShip(ship))return Promise.resolve();
    this.selected = id;
    if (this.targetId === id) this.targetId = null;
    this.draft = null;
    this.choosingDirection=false;
    return this.render();
  }

  formDraft(ship) {
    if (this.draft?.id !== ship.id || this.draft.version !== ship.version) {
      this.draft = {id:ship.id,version:ship.version,destination:ship.destination??{x:ship.x,y:ship.y},initiative:initiativeStamp()};
    }
    return this.draft;
  }

  pilotPanel(ship) {
    const draft=this.formDraft(ship),text=courseText(ship,draft,this.choosingDirection);
    const member=this.flightMember,cost=member&&maneuverCost(ship,member.actor_id,board().round,true),disabled=!cost?.available;
    return `<section class="sc-movement-form" data-flight-form>
      <p class="sc-flight-instruction" data-readout="instruction" role="status" aria-live="polite">${text.instruction}</p>
      <div class="sc-movement-actions">${action("pickDirection",localizeSystem("SWFFG.UI.SpaceCombat.ChooseDestination"),"crosshairs","sc-direction-picker",disabled)}
      ${action("plan",localizeSystem("SWFFG.UI.SpaceCombat.Confirm"),"check","sc-primary",disabled||!draft.destinationChosen||this.choosingDirection)}${action("cancelFlight",localizeSystem("SWFFG.Cancel"),"xmark")}</div>
      <p class="sc-hint" data-readout="arrival">${text.arrival}</p>
      <p class="sc-flight-cost">${localizeSystem("SWFFG.UI.SpaceCombat.OneManeuver")} · ${cost?escape(maneuverCostLabel(cost)):localizeSystem("SWFFG.UI.SpaceCombat.StationUnavailable")}</p>
      <p class="sc-hint sc-movement-note">${localizeSystem("SWFFG.UI.SpaceCombat.AbstractFlight")}</p>
    </section>`;
  }

  async _renderHTML() {
    if (!this.ship||!canSelectShip(this.ship)) { this.selected = null; this.draft = null;this.choosingDirection=false; }
    if(this.draft?.crewId&&!this.flightMember){this.draft=null;this.choosingDirection=false;}
    const nativeInitiative=initiativeContext().started;
    const root = document.createElement("div");
    root.className = "sc-console";
    root.innerHTML = `<div class="sc-workspace"><div class="sc-field">
      <svg class="sc-plot" tabindex="0" aria-label="${localizeSystem("SWFFG.UI.SpaceCombat.Map")}"></svg>
      <div class="sc-scene-return">${action("close",localizeSystem("SWFFG.UI.SpaceCombat.BackToScene"),"arrow-left")}</div>
      <nav class="sc-map-overlay" aria-label="${localizeSystem("SWFFG.UI.SpaceCombat.MapCommands")}">
        <div class="sc-map-tools">${[["zoomOut","minus",localizeSystem("SWFFG.UI.SpaceCombat.ZoomOut")],["zoomIn","plus",localizeSystem("SWFFG.UI.SpaceCombat.ZoomIn")],["fit","expand",localizeSystem("SWFFG.UI.SpaceCombat.FitFleet")],["combatHelp","book-open",localizeSystem("SWFFG.UI.SpaceCombat.Help")]].map(([cmd,glyph,label])=>`<button type="button" data-cmd="${cmd}" aria-label="${label}" title="${label}" >${icon(glyph)}</button>`).join("")}</div>
        <details class="sc-battle-menu"><summary>${localizeSystem("SWFFG.UI.SpaceCombat.Round")} ${board().round}
          <label class="sc-share"><input type="checkbox" name="shared" ${sharing.shared ? "checked" : ""} ${game.user.isGM ? "" : "disabled"}>${localizeSystem("SWFFG.UI.SpaceCombat.SharedView")}</label>
          </summary>
          ${game.user.isGM ? board().round===0?action("startCombat",localizeSystem("SWFFG.UI.SpaceCombat.StartCombat"),"play","",!board().ships.length):(nativeInitiative?`<p class="sc-initiative-note">${localizeSystem("SWFFG.UI.SpaceCombat.TrackerRounds")}</p>`:action("advance",localizeSystem("SWFFG.UI.SpaceCombat.AdvanceRound"),"forward-step","",!board().ships.length))+action("endCombat",localizeSystem("SWFFG.UI.SpaceCombat.EndCombat"),"flag-checkered") : ""}
        </details>
      </nav>
    </div><aside class="sc-side" aria-label="${localizeSystem("SWFFG.UI.SpaceCombat.SelectedShip")}"></aside></div>`;
    const side = root.querySelector(".sc-side");
    if (this.ship) {
      const card = combatCard(shipAppearance(this.ship),report,{targetId:this.targetId,onFly:member=>this.beginFlight(member),onTarget:id=>{
        this.targetId=id;this.render().catch(report);
      }});
      if (this.flightMember) {
        const navigation = document.createElement("section");
        navigation.className = "sc-flight-controls";
        navigation.setAttribute("aria-label",localizeSystem("SWFFG.UI.SpaceCombat.ConfirmFlight"));
        const text=courseText(this.ship,this.formDraft(this.ship),this.choosingDirection);
        navigation.dataset.stage=this.draft.destinationChosen&&!this.choosingDirection?"confirm":"destination";
        navigation.innerHTML = `<div class="sc-flight-heading"><h4>${icon("crosshairs")} ${localizeSystem("SWFFG.UI.SpaceCombat.Fly")}</h4><span class="sc-flight-status" data-readout="flightStatus">${text.flightStatus}</span></div>` + this.pilotPanel(this.ship);
        card.querySelector(".sc-maneuver-buttons").after(navigation);
      }
      side.append(card);
    } else {
      const empty = document.createElement("p");
      empty.className = "sc-selection-empty";
      empty.textContent = board().ships.length ? (game.user.isGM?localizeSystem("SWFFG.UI.SpaceCombat.ChooseOnMap"):localizeSystem("SWFFG.UI.SpaceCombat.ChooseCrewShip")) : localizeSystem("SWFFG.UI.SpaceCombat.DropShip");
      side.append(empty);
    }
    root.addEventListener("click", event => {
      const button = event.target.closest("[data-cmd]");
      if (button) this.handle(button.dataset.cmd).catch(report);
    });
    root.addEventListener("change", event => this.change(event.target).catch(report));
    root.addEventListener("keydown", event => {
      if(event.key==="Escape"&&this.choosingDirection) {
        event.preventDefault();event.stopImmediatePropagation();this.cancelFlight().catch(report);return;
      }
      if (event.key !== "Delete" || event.ctrlKey || event.altKey || event.metaKey ||
          event.target.closest("input,textarea,select,[contenteditable]")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat && game.user.isGM && this.ship) this.handle("remove").catch(report);
    },true);
    return root;
  }

  _replaceHTML(root, content) {
    const oldCard = this.widgets?.querySelector(".sc-combat-card");
    const newCard = root.querySelector(".sc-combat-card");
    const sameShip = oldCard?.dataset.shipId === newCard?.dataset.shipId;
    const cardScroll = sameShip ? oldCard?.scrollTop ?? 0 : 0;
    const oldPlot=this.widgets?.querySelector('.sc-plot'),newPlot=root.querySelector('.sc-plot');
    if(oldPlot&&newPlot)newPlot.replaceWith(oldPlot);
    else {this.disposePlot?.();this.disposePlot=null;}
    content.replaceChildren(root);
    if (newCard) {
      newCard.scrollTop = cardScroll;
    }
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.disposeInterface??=fitBehindInterface(this.element);
    this.paint();
    syncControl();
  }

  async _insertElement(element,options={}) {
    const host=document.getElementById("interface");
    if(!host)return super._insertElement(element,options);
    const existing=document.getElementById(element.id);
    if(existing&&existing!==element)existing.remove();
    host.prepend(element);
  }

  paint() {
    const svg = this.widgets?.querySelector(".sc-plot");
    if (!svg) return;
    const fleet = board().ships;
    if(this.rangeShipId&&!fleet.some(ship=>ship.id===this.rangeShipId&&canSelectShip(ship)))this.rangeShipId=null;
    const selected = this.ship;
    const draft = selected && this.draft?.id === selected.id && this.draft.version === selected.version ? this.draft : null;
    const ships = fleet.map(item => {
      const ship = shipAppearance(item);
      return draft && ship.id === selected.id ? {...ship,currentSpeed:ship.speed,destination:draft.destination} : ship;
    });
    this.disposePlot = drawPlot(svg, {
      ships, selected: this.selected, targetId: this.targetId, camera: this.camera,rangeShipId:this.rangeShipId,
      canReposition: game.user.isGM, canNavigate: true, canSelect:canSelectShip,
      choosingDirection:this.choosingDirection&&!!selected&&!!this.flightMember,
      onDirection:point=>{try{this.chooseDestination(point);}catch(error){report(error);}},
      onCancelDirection:()=>this.cancelFlight().catch(report),
      onBringToFront:id=>this.raiseShip(id).catch(report),
      onToggleRanges:id=>{
        const ship=board().ships.find(entry=>entry.id===id);
        if(!ship||!canSelectShip(ship))return;
        this.rangeShipId=this.rangeShipId===id?null:id;this.paint();
        this.widgets?.querySelector('[data-range-ship="'+id+'"]')?.focus({preventScroll:true});
      },
      onSelect: async id => {
        try {
          await this.selectShip(id);
          this.widgets?.querySelector('.sc-ship[data-ship="'+id+'"]')?.focus({preventScroll:true});
        } catch (error) { report(error); }
      },
      onCamera: camera => { this.camera = camera; },
      onMove: (id,point) => {
        const ship = fleet.find(item => item.id === id);
        if (ship) command("move",{shipId:id,version:ship.version,...point}).catch(report);
      },
      onDropActor: (data,point) => this.dropActor(data,point).catch(report)
    });
  }

  async dropActor(data,point) {
    if (!game.user.isGM) throw localizedSystemError("SWFFG.UI.SpaceCombat.GMDeploy");
    if (data.type !== "Actor") throw localizedSystemError("SWFFG.UI.SpaceCombat.DropWorldShip");
    const actor = data.uuid ? await fromUuid(data.uuid) : game.actors.get(data.id);
    if (actor?.type !== "vehicle" || game.actors.get(actor.id) !== actor) throw localizedSystemError("SWFFG.UI.SpaceCombat.DropWorldShip");
    const id = await command("add",{actorId:actor.id,...point});
    await this.selectShip(id);
  }

  async beginFlight(member) {
    if(!this.ship||!isNavigationRole(member)||!controlsCrewMember(member))return;
    Object.assign(this.formDraft(this.ship),{crewId:member.actor_id,destinationChosen:false,initiative:initiativeStamp()});
    await this.render();this.beginDirection();
  }
  async raiseShip(id) {
    const ship=board().ships.find(entry=>entry.id===id);
    if(!ship||!canSelectShip(ship))return;
    await command("front",{shipId:id});await this.render();
    this.widgets?.querySelector('[data-front-ship="'+id+'"]')?.focus({preventScroll:true});
  }
  async cancelFlight() {
    this.draft=null;this.choosingDirection=false;await this.render();
  }
  beginDirection() {
    if(!this.ship||!this.flightMember)return;
    this.formDraft(this.ship);this.choosingDirection=true;
    const navigation=this.widgets?.querySelector(".sc-flight-controls");
    if(navigation)navigation.scrollIntoView({block:"nearest"});
    this.updateCourse();
  }
  chooseDestination(point) {
    if(!this.ship||!this.flightMember)return;
    const draft=this.formDraft(this.ship);
    draft.destination=movementDestination(this.ship,point);
    draft.destinationChosen=true;
    this.choosingDirection=false;this.updateCourse();
    this.widgets?.querySelector('[data-cmd="plan"]')?.focus({preventScroll:true});
  }
  updateCourse() {
    const ship=this.ship;if(!ship||!this.flightMember)return;
    const draft=this.formDraft(ship),text=courseText(ship,draft,this.choosingDirection);
    for(const [key,value] of Object.entries(text)) {
      const output=this.widgets?.querySelector('[data-readout="'+key+'"]');if(output)output.textContent=value;
    }
    const picker=this.widgets?.querySelector('[data-cmd="pickDirection"]');
    if(picker)picker.setAttribute("aria-pressed",String(this.choosingDirection));
    const confirm=this.widgets?.querySelector('[data-cmd="plan"]'),ready=draft.destinationChosen&&!this.choosingDirection;
    if(confirm)confirm.disabled=!ready||!maneuverCost(ship,this.flightMember.actor_id,board().round,true).available;
    const navigation=this.widgets?.querySelector(".sc-flight-controls");
    if(navigation)navigation.dataset.stage=ready?"confirm":"destination";
    this.paint();
  }

  async change(field) {
    switch (field.name) {
      case "shared": field.disabled = true; try { await sharing.setShared(field.checked); } finally { await this.render(); } break;
      case "target": this.targetId = field.value; await this.render(); break;
    }
  }

  view(camera) {
    this.camera = camera;
    if(this.disposePlot?.view)this.disposePlot.view(camera);else this.paint();
  }

  fit() {
    const ships = board().ships;
    if (!ships.length) return this.view(initialCamera());
    const svg = this.widgets.querySelector(".sc-plot");
    const bounds = axis => [Math.min(...ships.map(s => s[axis]-tokenDiameter(s.silhouette)/2)), Math.max(...ships.map(s => s[axis]+tokenDiameter(s.silhouette)/2))];
    const [left,right] = bounds("x"), [bottom,top] = bounds("y");
    this.view({ x:(left+right)/2, y:(top+bottom)/2, width:Math.max(8,(right-left+2)*1.2,(top-bottom+2)*1.2*svg.clientWidth/Math.max(1,svg.clientHeight)) });
  }

  valid(section) {
    for (const field of section.querySelectorAll("input:enabled")) if (!field.reportValidity()) return false;
    return true;
  }

  async handle(cmd) {
    if(cmd==="close"&&!sharing.shared)return this.close();
    if(cmd==="combatHelp"){const {showCombatReference}=await import("../helpers/combat-quick-reference.mjs");return showCombatReference("space",{silhouette:this.ship?.silhouette});}
    if (this.busy) return;
    const ship = this.ship;
    const ref = ship && { shipId:ship.id, version:ship.version };
    const root = this.widgets;
    this.busy = true;
    try {
      switch (cmd) {
        case "advance": await command("advance"); break;
        case "endCombat":
          {
            const combat=initiativeContext().started?initiativeContext().combat:null;
            if(combat) {
              await combat.endCombat();
              if(game.combats.has(combat.id))break;
            } else if(board().round!==0)await command("endCombat");
          }
          this.draft=null;this.choosingDirection=false;break;
        case "startCombat":await command("startCombat");break;
        case "close": await this.close(); break;
        case "pickDirection":
          this.beginDirection();
          break;
        case "cancelFlight":await this.cancelFlight();break;
        case "plan":
          if(!this.draft?.destinationChosen||this.choosingDirection)throw localizedSystemError("SWFFG.UI.SpaceCombat.DestinationBeforeConfirm");
          if (this.valid(root.querySelector('[data-flight-form]'))) {
            if(!this.flightMember)throw localizedSystemError("SWFFG.UI.SpaceCombat.ChooseFly");
            await command("combat",{...ref,combatAction:"fly",crewId:this.flightMember.actor_id,destination:this.draft.destination,secondCost:"strain"});
            this.draft=null;
            this.choosingDirection=false;this.updateCourse();
          }
          break;
        case "remove":
          if (!game.user.isGM || !ship) return;
          if (await foundry.applications.api.DialogV2.confirm({window:{title:localizeSystem("SWFFG.UI.SpaceCombat.RemoveToken")},content:`<p>${escape(localizeSystem("SWFFG.UI.SpaceCombat.RemoveConfirm", {name:ship.name}))}</p>`})) await command("remove",ref);
          break;
        case "fit": this.fit(); break;
        case "zoomIn": case "zoomOut": this.view({...this.camera,width:Math.max(4,Math.min(160,this.camera.width*(cmd === "zoomIn" ? 0.75 : 1/0.75)))}); break;
      }
    } finally { this.busy = false; }
  }

  async close(options = {}) {
    if (!options.fromSession) return sharing.close();
    this._refreshClosing=true;
    try {
    refresh.cancel();
    await leaveCombatScene();
    this.choosingDirection=false;
    this.rangeShipId=null;
    this.disposeInterface?.();this.disposeInterface=null;
    this.disposePlot?.();
    this.disposePlot = null;
    const result = await super.close({...options,animate:false});
    syncControl();
    return result;
    } finally {this._refreshClosing=false;}
  }
}

function syncControl() {
  const button = document.querySelector("#scene-controls [data-open-space-combat]");
  if (!button) return;
  const open = !!app?.rendered;
  button.setAttribute("aria-expanded",String(open));
  button.classList.toggle("ffg-system-control-open",open);
}

async function show() {
  try {
    await enterCombatScene();
    if(game.user.isGM&&board().round>0&&board().ships.length)await command("participants");
    const encounter=board().round>0&&game.combats.get(board().encounterId);
    if(encounter&&ui.combat?.viewed?.id!==encounter.id){ui.combat.viewed=encounter;await ui.combat.render({force:true});}
    app ??= new SpaceCombat();
    if (!app.rendered) await app.render({force:true});
    syncControl();
  } catch(error) {
    await leaveCombatScene().catch(report);
    throw error;
  }
}
const refresh = renderScheduler({isOpen:()=>!!app&&!app._refreshClosing&&(app.rendered||app.state===foundry.applications.api.ApplicationV2.RENDER_STATES.RENDERING),render:()=>app.render(),onError:report});
const sharing = registerSharing({
  show, hide: () => app?.rendered && app.close({fromSession:true}), refresh, report
});
registerBoard(refresh, report);

function controls(html) {
  const host = html?.querySelector ? html : document.getElementById("scene-controls");
  const menu = host?.querySelector('#scene-controls-layers > menu, [data-application-part="layers"] > menu, menu');
  if (!menu || menu.querySelector("[data-open-space-combat]")) return;
  const row = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button"; button.className = "ui-control icon ffg-system-control";
  const shipIcon=document.createElement("span");shipIcon.className="ffg-space-control-icon";shipIcon.setAttribute("aria-hidden","true");button.append(shipIcon);
  button.dataset.openSpaceCombat = ""; button.title = localizeSystem(title); button.dataset.tooltip = button.title;
  button.setAttribute("aria-label",button.title);
  button.addEventListener("click",event => { event.preventDefault(); event.stopPropagation(); sharing.open().catch(report); });
  row.append(button); menu.append(row); syncControl();
}
Hooks.once("init",() => {
  const css = document.createElement("link");
  css.rel = "stylesheet"; css.href = new URL("../../styles/space-combat.css",import.meta.url).href;
  document.head.append(css);
});
Hooks.on("renderSceneControls",(_app,html) => controls(html));
Hooks.once("ready",() => controls());
let recoveringScene=false;
async function recoverSceneView() {
  if(recoveringScene||app?.rendered||!hasCombatSceneReturn())return;
  recoveringScene=true;
  try {
    await sharing.ready();
    if(!sharing.shared||sharing.sharedOpen)await sharing.open();
    else await leaveCombatScene();
  } catch(error){report(error);}
  finally {recoveringScene=false;}
}
Hooks.once("ready",recoverSceneView);
Hooks.on("canvasReady",recoverSceneView);
Hooks.on("canvasReady",()=>{
  if(app?.rendered&&hasCombatSceneReturn()&&!canvas.scene?.getFlag("starwarsffg","spaceCombatScene"))app.close().catch(report);
});
Hooks.on("ffgSpaceCombatControlsReady",refresh);
for(const hook of ["createActor","deleteActor","updateActor"])Hooks.on(hook,actor=>{if(actorAffectsSpaceCombat(board(),actor))refresh();});
for(const hook of ["createCombat","updateCombat","deleteCombat","createCombatant","updateCombatant","deleteCombatant"])Hooks.on(hook,document=>{if(combatAffectsSpaceCombat(board(),document))refresh();});
Hooks.on("updateUser",(_user,changes)=>{if(changes.role!==undefined||changes.character!==undefined)refresh();});
for(const hook of ["createItem","updateItem","deleteItem"])Hooks.on(hook,item=>{
  if(actorAffectsSpaceCombat(board(),item.parent))refresh();
});
