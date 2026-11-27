import {localizedSystemError} from "../helpers/system-localization.mjs";
import {command} from "./board.mjs";
import {combatScene} from "./scene-document.mjs";

const storageKey=()=>"starwarsffg.spaceCombatReturn."+game.world.id+"."+game.user.id;
let current=null;
let switching=false;

function savedReturn() {
  try {
    const saved=JSON.parse(sessionStorage.getItem(storageKey()));
    return saved&&typeof saved.combatId==="string"?saved:null;
  } catch {return null;}
}
async function canvasReady() {
  if(!canvas.loading)return;
  await new Promise((resolve,reject)=>{
    let timer;
    const hook=Hooks.on("canvasReady",()=>{
      clearTimeout(timer);Hooks.off("canvasReady",hook);resolve();
    });
    timer=setTimeout(()=>{
      Hooks.off("canvasReady",hook);
      reject(localizedSystemError("SWFFG.UI.SpaceCombat.CombatSceneLoading"));
    },20000);
  });
}
function viewPosition() {
  const stage=canvas.stage;
  if(!stage?.pivot||!stage.scale)return null;
  return {x:stage.pivot.x,y:stage.pivot.y,scale:stage.scale.x};
}
export async function enterCombatScene() {
  switching=true;
  try {
    await canvasReady();
    let scene=combatScene();
    if(!scene)scene=game.scenes.get(await command("scene"));
    if(!scene)throw localizedSystemError("SWFFG.UI.SpaceCombat.MissingCombatScene");
    if(!current) {
      const prior=savedReturn();
      current=prior?.combatId===scene.id?prior:{
        combatId:scene.id,sceneId:canvas.scene?.id??null,position:viewPosition()
      };
      sessionStorage.setItem(storageKey(),JSON.stringify(current));
    }
    await scene.view();
    if(canvas.scene?.id!==scene.id)throw localizedSystemError("SWFFG.UI.SpaceCombat.OpenCombatSceneFailed");
  } finally {switching=false;}
}
export async function leaveCombatScene() {
  switching=true;
  try {
    const previous=current??savedReturn();
    if(!previous)return;
    await canvasReady();
    if(canvas.scene?.id!==previous.combatId) {
      current=null;sessionStorage.removeItem(storageKey());return;
    }
    let scene=game.scenes.get(previous.sceneId);
    if(!scene||scene.id===previous.combatId)scene=game.scenes.active?.id!==previous.combatId?game.scenes.active:null;
    if(!scene)scene=game.scenes.find(item=>item.id!==previous.combatId&&(game.user.isGM||item.navigation));
    if(scene) {
      await scene.view();
      if(canvas.scene?.id!==scene.id)throw localizedSystemError("SWFFG.UI.SpaceCombat.RestoreSceneFailed");
      if(scene.id===previous.sceneId&&previous.position)canvas.pan(previous.position);
    } else if(canvas.scene)await canvas.scene.unview();
    current=null;
    sessionStorage.removeItem(storageKey());
  } finally {switching=false;}
}
export function hasCombatSceneReturn() {
  const saved=savedReturn();
  return !!saved&&!switching;
}
