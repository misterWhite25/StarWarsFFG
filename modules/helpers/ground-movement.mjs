import './ground-automatic-movement.mjs';
import './ground-range-settings.mjs';
import {metricUnit,toMetric,fromMetric,metricRulerContext,feetDistance,hasDualUnits} from './metric-distances.mjs';
import {modes,calibration,validateCalibration} from './ground-movement-model.mjs';
import {battlemapMovementLimited,enabledMovementModes,migrateMovementModes,stateFor,isGroundToken,recordNativeMovement} from './ground-movement-state.mjs';
const scope='starwarsffg',el=(tag,css,text)=>{const node=document.createElement(tag);if(css)node.className=css;if(text!==undefined)node.textContent=text;return node;};
import {refreshGroundSheets,loadGroundMovementStyles as loadStyles} from './ground-movement-sheet.mjs';
function refreshControls(){refreshGroundSheets();}
function sceneFields(app){
 const root=app.element;if(!game.user.isGM||!root?.querySelector||root.querySelector('.ffg-ground-scene'))return;
 const host=root.querySelector('.tab[data-tab="grid"]')??root.querySelector('.tab[data-tab="basic"]');if(!host)return;
 const scene=app.document??app.object,config=calibration(scene),group=el('fieldset','ffg-ground-scene');
 group.append(el('legend','',game.i18n.localize("SWFFG.UI.Ground.SceneSettingsTitle")));
 const row=(title,input,equivalent)=>{const line=el('div','form-group'),label=el('label','',title),fields=el('div','form-fields');fields.append(input);if(equivalent)fields.append(equivalent);line.append(label,fields);group.append(line);};
 group.append(el('p','hint',game.i18n.localize("SWFFG.UI.Ground.ChooseModeInPilotage")));
 group.append(el('p','hint',game.i18n.format(hasDualUnits(scene)?'SWFFG.UI.Ground.ConventionWithFeet':'SWFFG.UI.Ground.ConventionWithoutFeet',{unit:metricUnit(scene)})));
 for(const [key,title]of [['movement',game.i18n.localize("SWFFG.UI.Ground.DistancePerManeuver")]]){
  const input=el('input');input.type='number';input.step='any';input.min='0.001';input.value=String(Math.round(toMetric(config[key],scene)*1e9)/1e9);input.style.textAlign='center';
  const stored=el('input');stored.type='hidden';stored.value=String(config[key]);
  const fieldName='flags.starwarsffg.groundMovement.'+key;
  // Opening and saving SceneConfig must not turn inherited defaults into overrides.
  if(Object.hasOwn(scene.getFlag('starwarsffg','groundMovement')??{},key))stored.name=fieldName;
  const equivalent=el('span','hint ffg-distance-equivalent',feetDistance(config[key],scene));equivalent.hidden=!hasDualUnits(scene);equivalent.style.whiteSpace='nowrap';equivalent.setAttribute('aria-live','polite');
  input.addEventListener('input',()=>{stored.name=fieldName;stored.value=input.value===''?'':String(fromMetric(Number(input.value),scene));equivalent.textContent=input.value===''?'':feetDistance(Number(stored.value),scene);});
  row(title+' ('+metricUnit(scene)+')',input,equivalent);group.append(stored);
 }host.append(group);
}
Hooks.once('init',()=>{
 game.settings.register(scope,'groundMovementMode',{scope:'world',config:false,type:String,choices:modes,default:'none',onChange:refreshControls});
 game.settings.register(scope,'groundMovementModesMigrated',{scope:'world',config:false,type:Boolean,default:false,onChange:refreshControls});
 game.settings.register(scope,'enableNarrativeMovement',{name:"SWFFG.UI.Ground.EnableNarrative",hint:"SWFFG.UI.Ground.NarrativeSettingHint",scope:'world',config:false,type:Boolean,default:false,onChange:refreshControls});
 game.settings.register(scope,'enableBattlemapMovement',{name:"SWFFG.UI.Ground.EnableBattlemap",hint:"SWFFG.UI.Ground.BattlemapSettingHint",scope:'world',config:false,type:Boolean,default:false,onChange:refreshControls});
 void loadStyles();
 const Base=CONFIG.Token.rulerClass;
 CONFIG.Token.rulerClass=class SteelersGroundRuler extends Base{
  _getWaypointLabelContext(waypoint,state){
   const token=this.token.document,previousElevation=state.previousElevation;
   const context=metricRulerContext(super._getWaypointLabelContext(waypoint,state),waypoint,token.parent,{previousElevation,elevationBase:canvas.level?.elevation.base??0});
   if(context&&battlemapMovementLimited(token.parent)&&isGroundToken(token)&&context.cost&&waypoint.stage!=='passed'){
    let planned=0;for(let point=waypoint;point&&point.stage!=='passed';point=point.previous)planned+=point.measurement.backward?.cost??0;
    const current=stateFor(token),count=Math.max(0,Math.ceil(Math.max(0,current.distance+planned-1e-7)/calibration(token.parent).movement)-current.movePaid);
    const over=Number.isFinite(count)&&current.used+count>2;
    context.cost.units=(context.cost.units??'')+' · '+(over?game.i18n.localize("SWFFG.UI.Ground.OverBudget"):Number.isFinite(count)?game.i18n.format(count>1?'SWFFG.UI.Ground.ManeuverMany':'SWFFG.UI.Ground.ManeuverOne',{count}):game.i18n.localize("SWFFG.UI.Ground.Impassable"));
    if(over)context.cssClass=(context.cssClass??'')+' unreachable';
   }return context;
  }
 };
});
Hooks.once('ready',()=>{void migrateMovementModes().catch(error=>ui.notifications.error(error.message));});
Hooks.on('renderSceneConfig',sceneFields);
Hooks.on('preUpdateScene',(scene,changes)=>{
 const changed=changes.flags?.[scope]?.groundMovement;if(!changed)return;
 try{const config={...calibration(scene),...changed};validateCalibration(config);if(config.mode&&!['inherit',...Object.keys(modes)].includes(config.mode))throw Error(game.i18n.localize("SWFFG.UI.Ground.InvalidMode"));if(changed.mode&&changed.mode!==scene.getFlag(scope,'groundMovement')?.mode&&!['inherit','none',...enabledMovementModes()].includes(changed.mode))throw Error(game.i18n.localize("SWFFG.UI.Ground.EnableModeFirst"));}
 catch(error){ui.notifications.warn(error.message);return false;}
});
Hooks.on('moveToken',recordNativeMovement);
Hooks.on('updateScene',(scene,changes)=>{if(scene.id===canvas.scene?.id&&changes.flags?.[scope]?.groundMovement)refreshControls();});
Hooks.on('canvasReady',refreshControls);
