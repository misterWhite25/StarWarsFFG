import {registerGMHotbar} from "./gm-hotbar-page.mjs";
import {showCombatReference} from "./combat-quick-reference.mjs";

const SYSTEM = "starwarsffg";
const t = key => game.i18n.localize("SWFFG.GMToolbar." + key);
const defaults = {activePage:"native"};
const references = {
  injury: {id: "1b76a8e54ab5851a", type: "RollTable"},
  vehicle: {id: "45bfabdb015c952b", type: "RollTable"},
  combat: {id: "2fd7883cc7e91bc7", type: "JournalEntry"}
};
let pendingWrite = Promise.resolve();

function preferences() {
  return {activePage:game.settings.get(SYSTEM,"gmToolbar")?.activePage==="mj"?"mj":"native"};
}

function savePreferences(patch) {
  const write = pendingWrite.catch(() => {}).then(() =>
    game.settings.set(SYSTEM, "gmToolbar", {...game.settings.get(SYSTEM,"gmToolbar"),activePage:patch.activePage==="mj"?"mj":"native"}));
  pendingWrite = write;
  return write;
}

function report(error) {
  console.error("Star Wars FFG | GM toolbar", error);
  ui.notifications.warn(error.message || t("Unavailable"));
}

async function referenceDocument(key) {
  const ref = references[key];
  const collection = ref.type === "RollTable" ? game.tables : game.journal;
  const imported = collection.find(doc => doc.visible && (
    doc._stats?.compendiumSource?.endsWith("." + ref.id) ||
    (doc.getFlag(SYSTEM, "criticalTable") && ref.type === "RollTable" &&
      doc.getFlag(SYSTEM, "criticalKind") === (key === "vehicle" ? "vehicle" : "character"))));
  if (imported) return imported;
  const packs = [
    "swffg-compendium-bilingual-steelers-core_rule.en-" +
      (ref.type === "RollTable" ? "tables-steelers" : "references-steelers"),
    "swffg-reference-tables-fr." + (ref.type === "RollTable" ? "tables" : "references")
  ];
  for (const packId of packs) {
    if (!game.packs.has(packId)) continue;
    const doc = await game.packs.get(packId).getDocument(ref.id);
    if (doc?.visible !== false && doc) return doc;
  }
  return null;
}

async function openDocument(doc, {pagePrefix} = {}) {
  if (!game.user.isGM || !doc || doc.visible === false) throw Error(t("Unavailable"));
  if (doc.documentName === "RollTable") {
    // Open the native table; its Draw button retains the critical-roll workflow.
    return doc.sheet.render({force: true});
  }
  if (doc.documentName === "Macro") return doc.execute();
  if (doc.documentName === "JournalEntryPage") {
    return doc.parent.sheet.render({force: true, pageId: doc.id, mode: 1});
  }
  const page = pagePrefix && doc.pages?.find(p => new RegExp("^" + pagePrefix + "(?![0-9])").test(p.name));
  return doc.sheet.render({force: true, ...(page ? {pageId: page.id, mode: 1} : {})});
}

async function openReference(key) {
  const doc = await referenceDocument(key);
  if (!doc) throw Error(t("MissingReference"));
  return openDocument(doc, {pagePrefix: references[key].page});
}

const fixedSlots=Object.freeze(['injury','vehicle','combat','personal-turn','space-turn','','','','','']);
export function gmToolbarSlots(){return [...fixedSlots];}
const builtins={
  'personal-turn':{label:"SWFFG.UI.Interface.PersonalCombatTurn",img:'systems/starwarsffg/images/table-icons/combat-turn.svg'},
  'space-turn':{label:"SWFFG.UI.Interface.VehicleCombatTurn",img:'systems/starwarsffg/images/table-icons/space-turn.svg'},
  injury:{key:'injury',img:'systems/starwarsffg/images/table-icons/critical-injuries.svg'},
  vehicle:{key:'vehicle',img:'systems/starwarsffg/images/table-icons/critical-ship.svg'},
  combat:{key:'CombatAndCare',img:'systems/starwarsffg/images/table-icons/rules-book.svg'}
};
async function describeShortcut(value){
  const entry=builtins[value];
  if(!entry)return null;
  let img=entry.img;
  if(references[value]?.type==='RollTable'){
    const pack=game.packs.get('swffg-compendium-bilingual-steelers-core_rule.en-tables-steelers');
    if(pack){await pack.getIndex();img=pack.index.get(references[value].id)?.img||img;}
  }
  return {name:entry.label?game.i18n.localize(entry.label):t(entry.key),img};
}
async function executeShortcut(value){
  if(game.user.isGM&&['personal-turn','space-turn'].includes(value))return showCombatReference(value==='personal-turn'?'personal':'space');
  if(game.user.isGM&&Object.hasOwn(references,value))return openReference(value);
}
export async function renderGMToolbar(){
  document.getElementById('ffg-gm-toolbar')?.remove();
  if(game.ready)await ui.hotbar?.refreshGMPage?.();
}
Hooks.once('init',()=>{
  game.settings.register(SYSTEM,'enableGMHotbar',{name:'SWFFG.GMToolbar.EnablePage',hint:'SWFFG.GMToolbar.EnablePageHint',scope:'world',config:true,type:Boolean,default:true,onChange:()=>renderGMToolbar().catch(report)});
  game.settings.register(SYSTEM,'gmToolbar',{scope:'user',config:false,type:Object,default:defaults,onChange:()=>renderGMToolbar().catch(report)});
  registerGMHotbar({preferences,save:savePreferences,slots:gmToolbarSlots,describe:describeShortcut,execute:executeShortcut,
    report,text:t});
  const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('../../styles/gm-toolbar.css',import.meta.url).href;document.head.append(link);
});
Hooks.once('ready',()=>renderGMToolbar().catch(report));
Hooks.on('updateUser',(user,changes)=>{if(user.id===game.user.id&&'role' in changes)renderGMToolbar().catch(report);});
