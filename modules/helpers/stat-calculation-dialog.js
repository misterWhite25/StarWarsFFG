import {explainStats} from './stat-explanations.js';

const el = (tag,text,parent) => {const node=document.createElement(tag);if(text!=null)node.textContent=text;parent?.append(node);return node;};

export async function showCalculationDetails(actor) {
  // Foundry requires a bare DIV and serializes it before rendering.
  const content=el('div'), body=el('div',null,content);
  body.style.cssText='max-height:65vh;overflow:auto;padding-right:6px;font-size:12px;line-height:1.35';
  el('p','Origine des valeurs actuellement affichées sur la fiche. Cette fenêtre ne modifie aucune donnée.',body);
  const rows=explainStats(actor);
  for (const [section, prefix] of [['Statistiques','stats.'],['Caractéristiques','characteristics.']]) {
    el('h2',section,body).style.cssText='font-size:15px;line-height:1.3;margin:10px 0 6px';
    for (const row of rows.filter(r=>r.path.startsWith(prefix))) {
      const block=el('section',null,body);block.style.cssText='border-bottom:1px solid #8886;padding:5px 0';
      el('h3',`${row.label} : ${row.total??'—'}`,block).style.cssText='font-size:13px;line-height:1.3;margin:0 0 4px';
      const list=el('ul',null,block);list.style.cssText='font-size:12px;margin:4px 0;padding-left:20px';
      for (const source of row.sources) {
        const isBase = source.operation === 'Base';
        if (!isBase && Number(source.value) === 0) continue;
        const label = isBase ? source.name : `${source.name} — ${source.operation.toLowerCase()}`;
        el('li',`${label} : ${source.value}`,list);
      }
      // Explain missing history once below, rather than repeating it for every number.
      for (const note of row.notes.filter(n=>!n.startsWith('La base est'))) el('p',note,block).style.fontSize='12px';

    }
  }
  if (rows.some(r=>r.notes.some(n=>n.startsWith('La base est'))))
    el('p','« Base enregistrée » désigne la valeur sauvegardée avant les effets. Si elle a été saisie manuellement, le système ne connaît pas sa répartition historique entre espèce, création, talents et ajustements. Aucun bonus n’est inventé pour justifier le total.',body);
  return foundry.applications.api.DialogV2.wait({classes:["starwarsffg", "themed", "theme-light", "ffg-calculation-dialog"],window:{title:`Détail des calculs — ${actor.name}`},position:{width:580},content,
    buttons:[{action:'close',type:'button',label:'Fermer'}]});
}
