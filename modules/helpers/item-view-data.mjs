/** Small display-only records. Never change the owned Item or its source. */
export function summarizeItemQualities(system={}){
  const qualities=[],byName=new Map();
  const add=(mod,source,direct)=>{
    if(!mod?.system||(!direct&&!mod.system.active))return;
    const {name,img,_id:modId}=mod,{rank,description}=mod.system;
    let entry=byName.get(name);
    if(!entry){
      entry={name,description,itemIndex:qualities.length,totalRanks:0,includeControls:direct,summarizedRanks:direct?{mods:0}:{[source]:0}};
      if(direct)Object.assign(entry,{img,modId});
      byName.set(name,entry);qualities.push(entry);
    }
    if(!Object.hasOwn(entry.summarizedRanks,source))Object.defineProperty(entry.summarizedRanks,source,{value:0,writable:true,enumerable:true,configurable:true});
    entry.totalRanks+=rank;entry.summarizedRanks[source]+=rank;
  };
  for(const mod of system.itemmodifier??[])add(mod,'mods',true);
  for(const attachment of system.itemattachment??[])for(const mod of attachment?.system?.itemmodifier??[])add(mod,attachment.name,false);
  return qualities;
}

export function careerSkillChoices(skills={}){
  return Object.fromEntries([['(none)',{value:'(none)',label:'SWFFG.CareerSkills.None'}],...Object.entries(skills).map(([key,skill])=>[key,{value:skill.value,label:skill.label}])]);
}

const descriptionTypes=new Set(['duty','obligation','morality','motivation','background']);
export async function actorItemDescriptions(items,actor,render){
  const descriptions=Object.create(null);
  await Promise.all(Array.from(items).filter(item=>descriptionTypes.has(item.type)).map(async item=>{
    const description=item.system?.description;
    descriptions[item.id??item._id]=description?await render(description,actor):'';
  }));
  return descriptions;
}
