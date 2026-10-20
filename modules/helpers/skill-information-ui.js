import {suggestTables} from './skill-reference-mapping.js';
import {adjacentPlacement} from './pilotage-core.js';
import {skillDescriptor,skillDescription} from './skill-information.js';

const escapeText=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function openNeighbour(builder,title,html){
  await builder._skillInformationWindow?.close();
  const placement=adjacentPlacement(builder.element.getBoundingClientRect(),{width:window.innerWidth,height:window.innerHeight},{preferredWidth:640});
  if(placement.jetLeft!==undefined)builder.setPosition({left:placement.jetLeft});
  const content=document.createElement('div');
  content.innerHTML='<div class="ffg-skill-information-content"><style>.ffg-skill-information-window{max-height:calc(100dvh - 24px)}.ffg-skill-information-window .window-content{overflow:hidden;min-height:0;padding-top:8px}.ffg-skill-information-window .dialog-form{display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden}.ffg-skill-information-window .dialog-content{padding-top:0;flex:1;min-height:0;overflow-y:auto;scrollbar-gutter:stable}.ffg-skill-information-window .form-footer{flex-shrink:0}.ffg-skill-information-content>h2:first-of-type{margin-top:0;margin-bottom:12px}.ffg-skill-information-content table{width:100%;table-layout:auto;margin:6px 0 12px}.ffg-skill-information-content section[data-reference-id]{margin-top:12px;display:block}.ffg-skill-information-content section[data-reference-id] h4{margin:0 0 6px}.ffg-skill-information-content section[data-reference-id] p{margin:0 0 6px}.ffg-skill-information-content section[data-reference-id]>p:empty{display:none}.ffg-skill-information-content td,.ffg-skill-information-content th{white-space:normal;overflow-wrap:anywhere}.ffg-skill-information-content img{max-width:100%}.ffg-skill-information-content{font-family:inherit;color:inherit}.ffg-skill-information-content .skill-description-text p,.ffg-skill-information-content .skill-description-text li{text-align:justify}.ffg-skill-information-content h1,.ffg-skill-information-content h2,.ffg-skill-information-content h3,.ffg-skill-information-content h4{font-family:inherit;color:inherit;line-height:1.3}.ffg-skill-information-content h1{font-size:20px}.ffg-skill-information-content h2{font-size:18px}.ffg-skill-information-content h3{font-size:16px}.ffg-skill-information-content h4{font-size:14px}.ffg-skill-information-content section{margin-top:18px}.ffg-skill-information-content .skill-description-source{font-size:12px;opacity:.85}</style>'+html+'</div>';
  const app=new foundry.applications.api.DialogV2({classes:['starwarsffg','themed','ffg-skill-information-window'],window:{title,resizable:true},position:{left:placement.left,top:placement.top,width:placement.width},content,buttons:[{action:'close',label:'Fermer les informations'}]});
  builder._skillInformationWindow=app;
  await app.render({force:true});
  const bounds=app.element.getBoundingClientRect();
  app.setPosition({left:placement.left,top:Math.max(12,Math.min(placement.top,window.innerHeight-Math.min(bounds.height,window.innerHeight-24)-12)),height:Math.min(bounds.height,window.innerHeight-24)});
  const showDescription=()=>{for(const element of app.element.querySelectorAll('.window-content,.dialog-content,.dialog-form'))element.scrollTop=0;};
  showDescription();requestAnimationFrame(showDescription);
}

export function skillCompendiumRequirement(modules=game.modules){
  const module=modules?.get('swffg-compendium-bilingual');
  if(!module)return 'Pour afficher les informations de la compétence, il faut installer le compendium « Star Wars FFG — Compendium FR / EN », puis l’activer dans ce monde. Demandez au MJ de l’installer.';
  if(module.active!==true)return 'Le compendium « Star Wars FFG — Compendium FR / EN » est installé mais désactivé. Le MJ doit l’activer dans la gestion des modules de ce monde pour afficher les informations de la compétence.';
  return null;
}

export async function openSkillInformation(builder){
  const skill=skillDescriptor(builder);if(!skill)return;
  const requirement=skillCompendiumRequirement();
  if(requirement)return openNeighbour(builder,`Informations — ${skill.label}`,`<h2>${escapeText(skill.label)}</h2><h3>Compendium requis</h3><p role="status">${escapeText(requirement)}</p>`);
  const description=await skillDescription(skill);
  let html=`<h2>${escapeText(skill.label)}</h2><div class="skill-description-text">${await foundry.applications.ux.TextEditor.enrichHTML(description.html,{secrets:description.secrets===true})}</div>${description.source?`<p class="skill-description-source">${escapeText(description.source)}</p>`:''}`;
  return openNeighbour(builder,`Informations — ${skill.label}`,html);
}

function skillTableIds(builder,skill){
  return new Set(suggestTables(skill.key,{scale:builder.roll.combatMode,criticalTreatment:skill.key==='Medicine',concealment:builder.roll.combatMode==='personal'}).map(row=>row.id));
}

export function hasSkillReferenceTables(builder){
  const skill=skillDescriptor(builder);if(!skill)return false;
  if(skillTableIds(builder,skill).size)return true;
  return Array.from(game.journal??[]).some(journal=>journal.testUserPermission(game.user,'OBSERVER')&&Array.from(journal.pages).some(page=>{
    if(page.type!=='text'||!page.testUserPermission(game.user,'OBSERVER'))return false;
    const linked=page.getFlag('starwarsffg','skillKeys')??[];
    return (Array.isArray(linked)?linked:[linked]).some(key=>key===skill.key||key===skill.label);
  }));
}

export async function openSkillReferences(builder){
  const skill=skillDescriptor(builder);if(!skill)return;
  const requirement=skillCompendiumRequirement();
  if(requirement)return openNeighbour(builder,`Tables de références — ${skill.label}`,`<h2>${escapeText(skill.label)}</h2><h3>Compendium requis</h3><p role="status">${escapeText(requirement)}</p>`);
  const ids=skillTableIds(builder,skill),pages=await referencePages(skill,ids);
  const order=[...ids];pages.sort((a,b)=>order.indexOf(a.name.split(' · ')[0])-order.indexOf(b.name.split(' · ')[0]));
  let html=`<h2>${escapeText(skill.label)}</h2>`;
  if(!pages.length)html+='<p>Aucun tableau de référence accessible pour cette compétence.</p>';
  for(const page of pages)html+=`<section data-reference-id="${escapeText(page.name.split(' · ')[0])}"><h4>${escapeText(page.name)}</h4>${await foundry.applications.ux.TextEditor.enrichHTML(page.text.content,{secrets:page.isOwner})}</section>`;
  return openNeighbour(builder,`Tables de références — ${skill.label}`,html);
}

export function renderSkillInformation(builder, html) {
  const root=html[0];if(!root?.ownerDocument)return; root.querySelector('.ffg-skill-information-control')?.remove();
  if(!skillDescriptor(builder))return;
  const section=document.createElement('div');section.className='ffg-skill-information-control';
  const hasTables=hasSkillReferenceTables(builder);
  section.style.cssText='display:flex;align-items:center;gap:4px;flex:0 0 auto;margin-right:4px';
  const addButton=(label,className,icon,open)=>{
    const button=document.createElement('button');button.type='button';button.className=className;
    button.classList.add('header-control','icon', 'fa-solid',icon);button.style.cssText='width:24px;height:24px;min-height:0;padding:0;background:transparent;border:0;color:inherit';button.setAttribute('aria-label',label);button.setAttribute('data-tooltip',label);
    button.addEventListener('click',async event=>{event.preventDefault();event.stopPropagation();button.disabled=true;try{await open(builder);}catch(error){ui.notifications.error(error.message);}finally{button.disabled=false;}});
    section.append(button);
  };
  addButton('Informations de la compétence','ffg-skill-information-button','fa-circle-info',openSkillInformation);
  if(hasTables)addButton('Tables de références','ffg-skill-references-button','fa-table',openSkillReferences);
  root.querySelector('.window-title')?.after(section);
}


let bundledReferences;
async function referencePages(skill,ids){
  const pages=[],seen=new Set();
  const addJournal=journal=>{
    if(!journal?.testUserPermission(game.user,'OBSERVER'))return;
    for(const page of journal.pages){
      if(page.type!=='text'||!page.testUserPermission(game.user,'OBSERVER'))continue;
      const linked=page.getFlag('starwarsffg','skillKeys')??[];
      const explicit=(Array.isArray(linked)?linked:[linked]).some(key=>key===skill.key||key===skill.label);
      const number=page.name.split(' · ')[0];
      const knownBook=journal.flags?.['swffg-reference-tables-fr']||journal.getFlag('starwarsffg','referenceTables')||/tables? de combat et soins|combat and healing tables/i.test(journal.name);
      if(explicit||(knownBook&&ids.has(number))){
        const identity=explicit?page.uuid:number;
        if(!seen.has(identity)){pages.push(page);seen.add(identity);}
      }
    }
  };
  for(const journal of game.journal)addJournal(journal);
  for(const collection of ['swffg-compendium-bilingual.en-references-steelers','swffg-reference-tables-fr.references']){
  const pack=game.packs.get(collection);
  if(pack?.visible&&[...ids].some(id=>!seen.has(id))){
    const index=await pack.getIndex();
    const entry=index.find(entry=>/tables? de combat et soins|combat and healing tables/i.test(entry.name));
    if(entry)addJournal(await pack.getDocument(entry._id));
  }
  }
  if([...ids].some(id=>!seen.has(id))){
    bundledReferences??=fetch('/systems/starwarsffg/data/skill-references-fr.json').then(response=>{if(!response.ok)throw Error('Références de compétence indisponibles.');return response.json()}).catch(error=>{bundledReferences=null;throw error;});
    const journal=await bundledReferences;
    for(const page of journal.pages){const number=page.name.split(' · ')[0];if(ids.has(number)&&!seen.has(number)){pages.push({...page,isOwner:false});seen.add(number);}}
  }
  return pages;
}
