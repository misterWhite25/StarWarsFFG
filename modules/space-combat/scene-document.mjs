import {localizeSystem} from "../helpers/system-localization.mjs";
const scope="starwarsffg";
const setting="spaceCombatSceneId";

export function registerCombatScene() {
  game.settings.register(scope,setting,{scope:"world",config:false,restricted:true,type:String,default:""});
}
export function combatScene() {
  const saved=game.scenes.get(game.settings.get(scope,setting));
  if(saved?.getFlag(scope,"spaceCombatScene"))return saved;
  return game.scenes.find(scene=>scene.getFlag(scope,"spaceCombatScene"));
}
export async function ensureCombatScene() {
  let scene=combatScene();
  if(!scene) {
    scene=await Scene.create({
      name:localizeSystem("SWFFG.UI.SpaceCombat.Title"),active:false,navigation:false,
      width:4000,height:3000,padding:0,tokenVision:false,
      background:{src:"systems/starwarsffg/assets/space-combat/deep-space.webp"},
      grid:{type:CONST.GRID_TYPES.GRIDLESS},
      flags:{starwarsffg:{spaceCombatScene:true}}
    },{renderSheet:false});
  }
  if(game.settings.get(scope,setting)!==scene.id)await game.settings.set(scope,setting,scene.id);
  return scene.id;
}
