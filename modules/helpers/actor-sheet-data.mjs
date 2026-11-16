/** Display records share read-only item data instead of serializing entire embedded trees. */
export function actorSheetContext(sheet){
  const editable=sheet.isEditable;
  return {cssClass:editable?'editable':'locked',editable,document:sheet.actor,limited:sheet.actor.limited,options:sheet.options,owner:sheet.actor.isOwner,title:sheet.title};
}
export function actorSheetData(actor){
  const copy=value=>foundry.utils.deepClone(value);
  const data={};
  for(const key of ['name','type','img','flags','ownership','folder','sort','prototypeToken','_stats'])if(actor[key]!==undefined)data[key]=copy(actor[key]);
  data._id=actor.id??actor._id;
  data.system=actor.system.toObject?actor.system.toObject(false):copy(actor.system);
  data.items=Array.from(actor.items,item=>({_id:item.id??item._id,id:item.id??item._id,name:item.name,type:item.type,img:item.img,system:item.system,flags:item.flags}));
  return data;
}
