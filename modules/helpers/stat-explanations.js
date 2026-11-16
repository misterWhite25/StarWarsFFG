import {calculateStats,calculationText} from './automatic-stats.js';

const read = (object, path) => path.split('.').reduce((value, key) => value?.[key], object);
const numeric = value => value !== '' && value != null && Number.isFinite(Number(value)) ? Number(value) : null;
const fields = [
  ['stats.wounds.max','SWFFG.UI.Calculation.Data.Wounds','wounds'], ['stats.strain.max','SWFFG.UI.Calculation.Data.Strain','strain'],
  ['stats.soak.value','SWFFG.UI.Calculation.Data.Soak','soak'], ['stats.defence.melee','SWFFG.UI.Calculation.Data.Melee','melee'],
  ['stats.defence.ranged','SWFFG.UI.Calculation.Data.Ranged','ranged'], ['stats.encumbrance.max','SWFFG.UI.Calculation.Data.Encumbrance','encumbrance'],
  ...Object.entries({Brawn:'SWFFG.UI.Calculation.Data.Brawn',Agility:'SWFFG.UI.Calculation.Data.Agility',Intellect:'SWFFG.UI.Calculation.Data.Intellect',Cunning:'SWFFG.UI.Calculation.Data.Cunning',Willpower:'SWFFG.UI.Calculation.Data.Willpower',Presence:'SWFFG.UI.Calculation.Data.Presence'})
    .map(([key,label])=>[`characteristics.${key}.value`,label]),
];
const operations = {add:'Ajouter',multiply:'Multiplier par',upgrade:'Minimum',downgrade:'Maximum',override:'Remplacer par',base:'Base','+':'Ajouter','=':'Total limité à'};

/** Explain persisted bases and actual active effects; never infer a character's history. */
export function explainStats(actor, i18n=globalThis.game?.i18n) {
  const text=(id,values)=>calculationText(id,values,i18n);
  const operationLabels={add:text("OperationAdd"),multiply:text("OperationMultiply"),upgrade:text("OperationUpgrade"),downgrade:text("OperationDowngrade"),override:text("OperationOverride"),base:text("Base"),"+":text("OperationAdd"),"=":text("OperationLimit")};
  const rows = fields.map(([path,label,id])=>({path,label:text(label),id,total:read(actor.system,path),
    base:read(actor._source?.system,path),sources:[],notes:[]}));
  const changes=[];
  for (const effect of actor.allApplicableEffects()) {
    if (!effect.active) continue;
    const parent = effect.parent?.documentName === 'Item' ? effect.parent : null;
    for (const change of effect.system?.changes ?? effect._source?.system?.changes ?? []) {
      const row=rows.find(r=>`system.${r.path}`===change.key);
      if (!row) continue;
      const type=change.type ?? ({1:'multiply',2:'add',3:'downgrade',4:'upgrade',5:'override'})[change.mode];
      const value=numeric(change.value);
      const name=parent ? parent.name : effect.name;
      changes.push({row,type,value,raw:change.value,name,phase:change.phase==='final'?1:0,
        priority:numeric(change.priority)??({multiply:10,add:20,downgrade:30,upgrade:40,override:50})[type]??0});
    }
  }
  const auto=actor.flags?.starwarsffg?.automaticStats?.enabled ? calculateStats(actor,undefined,i18n) : null;
  for (const row of rows) {
    const calculated=auto?.errors.length===0 ? auto.rows.find(r=>r.id===row.id) : null;
    if (calculated) {
      row.sources=calculated.sources.map(s=>({...s,operation:operations[s.operation]??s.operation,operationLabel:operationLabels[s.operation]??s.operation}));
      row.notes.push(...auto.warnings);
      continue;
    }
    let value=numeric(row.base), explained=value!==null;
    row.sources.push({name:text('RecordedBase'),operation:'Base',operationLabel:text('Base'),value:row.base??text('Unspecified')});
    const relevant=changes.filter(c=>c.row===row).sort((a,b)=>a.phase-b.phase||a.priority-b.priority);
    for (const change of relevant) {
      row.sources.push({name:change.name,operation:operations[change.type]??'Effet personnalisé',operationLabel:operationLabels[change.type]??text('OperationCustom'),value:change.value??change.raw});
      if (change.value===null || !explained) {explained=false;continue;}
      switch(change.type) {
        case 'add': value+=change.value;break;
        case 'multiply': value*=change.value;break;
        case 'upgrade': value=Math.max(value,change.value);break;
        case 'downgrade': value=Math.min(value,change.value);break;
        case 'override': value=change.value;break;
        default: explained=false;
      }
    }
    if (!relevant.length) row.notes.push(text("NoActiveModifier"));
    if (!explained || value!==numeric(row.total)) row.notes.push(text("UnexplainedTotal"));
    row.notes.push(text("SWFFG.UI.Calculation.RecordedBaseNote"));
  }
  return rows;
}
