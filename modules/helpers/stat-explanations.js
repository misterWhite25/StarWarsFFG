import {calculateStats} from './automatic-stats.js';

const read = (object, path) => path.split('.').reduce((value, key) => value?.[key], object);
const numeric = value => value !== '' && value != null && Number.isFinite(Number(value)) ? Number(value) : null;
const fields = [
  ['stats.wounds.max','Seuil de blessures','wounds'], ['stats.strain.max','Seuil de stress','strain'],
  ['stats.soak.value','Encaissement','soak'], ['stats.defence.melee','Défense au corps à corps','melee'],
  ['stats.defence.ranged','Défense à distance','ranged'], ['stats.encumbrance.max','Seuil d’encombrement','encumbrance'],
  ...Object.entries({Brawn:'Vigueur',Agility:'Agilité',Intellect:'Intelligence',Cunning:'Ruse',Willpower:'Volonté',Presence:'Présence'})
    .map(([key,label])=>[`characteristics.${key}.value`,label]),
];
const operations = {add:'Ajouter',multiply:'Multiplier par',upgrade:'Minimum',downgrade:'Maximum',override:'Remplacer par',base:'Base','+':'Ajouter','=':'Total limité à'};

/** Explain persisted bases and actual active effects; never infer a character's history. */
export function explainStats(actor) {
  const rows = fields.map(([path,label,id])=>({path,label,id,total:read(actor.system,path),
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
  const auto=actor.flags?.starwarsffg?.automaticStats?.enabled ? calculateStats(actor) : null;
  for (const row of rows) {
    const calculated=auto?.errors.length===0 ? auto.rows.find(r=>r.id===row.id) : null;
    if (calculated) {
      row.sources=calculated.sources.map(s=>({...s,operation:operations[s.operation]??s.operation}));
      row.notes.push(...auto.warnings);
      continue;
    }
    let value=numeric(row.base), explained=value!==null;
    row.sources.push({name:'Base enregistrée sur la fiche',operation:'Base',value:row.base??'Non renseignée'});
    const relevant=changes.filter(c=>c.row===row).sort((a,b)=>a.phase-b.phase||a.priority-b.priority);
    for (const change of relevant) {
      row.sources.push({name:change.name,operation:operations[change.type]??'Effet personnalisé',value:change.value??change.raw});
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
    if (!relevant.length) row.notes.push('Aucun bonus ou malus actif ajouté à cette valeur.');
    if (!explained || value!==numeric(row.total)) row.notes.push('Le total affiché comprend un calcul supplémentaire ou un effet personnalisé dont le détail ne peut pas être reconstitué ici.');
    row.notes.push('La base est une valeur sauvegardée : sa répartition historique entre création, progression et ajustements manuels n’est pas enregistrée.');
  }
  return rows;
}
