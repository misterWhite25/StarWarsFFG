import test from 'node:test';
import assert from 'node:assert/strict';
import {moveInventoryEquipment,activateInventoryPossessions} from '../../modules/helpers/inventory-possessions.js';
function setup(type='gear'){
 const updates=[],renders=[];
 const item={id:'scanner',type,name:'Scanner de cargaison',flags:{custom:{preserve:true}},system:{quantity:{value:5},encumbrance:{value:2},equippable:{equipped:true}},async update(data){updates.push(data);for(const [path,value]of Object.entries(data)){const keys=path.split('.');let object=this;for(const k of keys.slice(0,-1))object=object[k]??={};object[keys.at(-1)]=value;}await sheet.render({force:false,renderContext:'updateitems'});return this;}};
 const items=[item];items.get=id=>items.find(i=>i.id===id);
 const sheet={isEditable:true,actor:{type:'character',isOwner:true,items,verifyEditModeIsNotEnabled:()=>true},render:async options=>renders.push(options)};
 return {sheet,item,updates,renders};
}
test('storing and retrieving equipment refreshes the V2 sheet and preserves id, quantity and custom data',async()=>{
 for(const type of ['gear','weapon','armour']){
  const {sheet,item,updates,renders}=setup(type);
  assert(await moveInventoryEquipment(sheet,item.id,true));assert.equal(item.flags.starwarsffg.inventoryLocation,'possession');assert.equal(item.system.equippable.equipped,false);
  assert.deepEqual(renders,[{force:false,renderContext:'updateitems'}]);
  assert(await moveInventoryEquipment(sheet,item.id,false));assert.equal(item.flags.starwarsffg.inventoryLocation,'carried');
  assert.equal(item.system.equippable.equipped,false);assert.equal(item.system.quantity.value,5);assert.equal(item.id,'scanner');assert(item.flags.custom.preserve);assert.equal(updates.length,2);assert.equal(renders.length,2);
 }
});
test('read-only sheets and edit mode cannot move equipment',async()=>{
 for(const guard of ['editable','owner','edit-mode']){
  const {sheet,item,updates,renders}=setup();if(guard==='editable')sheet.isEditable=false;if(guard==='owner')sheet.actor.isOwner=false;if(guard==='edit-mode')sheet.actor.verifyEditModeIsNotEnabled=()=>false;
  assert.equal(await moveInventoryEquipment(sheet,item.id,true),false);assert.equal(updates.length,0);assert.equal(renders.length,0);
 }
});
test('a blocked update is reported instead of pretending the item was stored',async()=>{
 const {sheet,item,renders}=setup();item.update=async()=>false;
 await assert.rejects(moveInventoryEquipment(sheet,item.id,true),/n’a pas été enregistré/);assert.equal(renders.length,0);
 await assert.rejects(moveInventoryEquipment(sheet,'deleted',true),/n’est plus présent/);
});
test('the actual inventory button changes location on each click and requests a fresh render',async()=>{
 const {sheet,item,renders}=setup();let button;
 const controls={prepend:b=>button=b};
 const row={dataset:{itemId:item.id},querySelector:s=>s==='.item-controls'?controls:null};
 sheet.element={querySelectorAll:()=>[row],querySelector:()=>null};
 const previous=globalThis.document;
 globalThis.document={createElement:()=>({events:{},setAttribute(){},append(){},addEventListener(name,fn){this.events[name]=fn;}})};
 try{
  activateInventoryPossessions(sheet);assert(button);
  const event={preventDefault(){},stopPropagation(){}};
  await button.events.click(event);assert.equal(item.flags.starwarsffg.inventoryLocation,'possession');assert.equal(renders.length,1);assert.equal(button.disabled,false);
  await button.events.click(event);assert.equal(item.flags.starwarsffg.inventoryLocation,'carried');assert.equal(renders.length,2);
 }finally{globalThis.document=previous;}
});
