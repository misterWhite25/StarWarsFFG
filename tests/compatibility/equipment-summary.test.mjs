import test from 'node:test';
import assert from 'node:assert/strict';
import {equippedItems,equipmentStats,equipmentDescription} from '../../modules/helpers/equipment-summary.js';
test('equipment summary includes only explicitly equipped items and responds to unequipping',()=>{
 const weapon={name:'Blaster',type:'weapon',system:{equippable:{equipped:true}}};
 const armour={name:'Armure',type:'armour',system:{equippable:{equipped:true}}};
 const actor={items:[armour,weapon,{name:'Sac',system:{equippable:{equipped:false}}},{name:'Talent',system:{}},{name:'Invalid',system:{equippable:{equipped:'true'}}}]};
 assert.deepEqual(equippedItems(actor),[weapon,armour]);
 weapon.system.equippable.equipped=false;assert.deepEqual(equippedItems(actor),[armour]);
 armour.system.equippable.equipped=false;assert.deepEqual(equippedItems(actor),[]);
});
test('equipment stats preserve adjusted zero and fall back to base values',()=>{
 assert.deepEqual(equipmentStats({type:'armour',system:{soak:{value:2,adjusted:0},defence:{value:1}}}),[['Encaissement',0],['Défense',1]]);
 assert.deepEqual(equipmentStats({type:'weapon',system:{damage:{value:7,adjusted:8},crit:{value:3},range:{label:'Short'},quantity:{value:1}}}),[['Dégâts',8],['Critique',3],['Portée','Short'],['Quantité',1]]);
});

test('summary hides imported bibliography and retains the real description',()=>{
 const text='<p>Armure légère.</p><p><h3>Sources:</h3>Page 42 - Livre<br></p>';
 assert.equal(equipmentDescription(text),'<p>Armure légère.</p>');
 assert.equal(equipmentDescription('<p><em>Source : Livre, p. 42.</em></p><p>Protection.</p>'),'<p>Protection.</p>');
 assert.equal(equipmentDescription('<p>Une source de lumière portable.</p>'),'<p>Une source de lumière portable.</p>');
 assert.equal(equipmentDescription("<p>Encaissement 2 ; défense 1.</p><p>Références de l’import : Livre</p><p>Profil normalisé depuis le compendium. Les effets conditionnels sont à gérer en jeu.</p>"),'<p>Encaissement 2 ; défense 1.</p>');
 assert.equal(equipmentDescription("<p>Portée courte.</p><p>Références bibliographiques de l'import : Livre</p><p><em>Profil repris du compendium et normalisé.</em></p>"),'<p>Portée courte.</p>');
 assert.equal(equipmentDescription('<p>Profil bas : ajoutez [SE] aux tests adverses.</p>'),'<p>Profil bas : ajoutez [SE] aux tests adverses.</p>');
 assert.equal(equipmentDescription('<p><h3>Sources:</h3>Livre<br></p>'),'');
});

test('summary reads quality names, ranks and descriptions from the current item sheet context',async()=>{
 const vm=await import('node:vm'),{readFile}=await import('node:fs/promises');
 class Element {constructor(tag){this.tag=tag;this.children=[];this.style={};}append(child){this.children.push(child);}}
 let reads=0;
 const weapon={name:'Blaster',type:'weapon',system:{equippable:{equipped:true}},sheet:{getData:async()=>{reads++;return {data:{doNotSubmit:{qualities:[{name:'Précision',totalRanks:2,description:'<p>Bonus de Précision.</p>'}]}}};}}};
 const context=vm.createContext({document:{createElement:tag=>new Element(tag)},window:{innerWidth:1280,innerHeight:900},game:{i18n:{localize:value=>value}},foundry:{applications:{ux:{TextEditor:{enrichHTML:async html=>html}},api:{DialogV2:class{constructor(options){this.options=options;}async render(){this.rendered=true;}}}}}});
 const module=new vm.SourceTextModule(await readFile(new URL('../../modules/helpers/equipment-summary.js',import.meta.url),'utf8'),{context});await module.link(()=>{});await module.evaluate();
 const sheet={actor:{name:'Pilote',isOwner:true,items:[weapon],system:{}},element:{getBoundingClientRect:()=>({right:600,left:100,top:20})}};
 await module.namespace.showEquipmentSummary(sheet);
 const descendants=element=>[element,...element.children.flatMap(descendants)];
 assert.equal(reads,1);let nodes=descendants(sheet._equipmentSummary.options.content);
 assert(nodes.some(node=>node.textContent==='Précision - 2'));assert(nodes.some(node=>node.innerHTML==='<p>Bonus de Précision.</p>'));
 const quality=nodes.find(node=>node.tag==='details');
 assert(quality);assert(!quality.open);
 assert.equal(quality.children[0].tag,'summary');
 assert.equal(quality.children[0].children[0].textContent,'Précision - 2');
 assert.equal(quality.children[1].innerHTML,'<p>Bonus de Précision.</p>');
 assert.equal(quality.children[1].className,'ffg-equipment-description');
 weapon.sheet.getData=async()=>{reads++;return {data:{doNotSubmit:{qualities:[{name:'Précision',totalRanks:3,description:'<p>Bonus changé.</p>'}]}}};};
 await module.namespace.showEquipmentSummary(sheet,true);nodes=descendants(sheet._equipmentSummary.options.content);
 assert.equal(reads,2);assert(nodes.some(node=>node.textContent==='Précision - 3'));assert(nodes.some(node=>node.innerHTML==='<p>Bonus changé.</p>'));
 assert.equal(weapon.system.doNotSubmit,undefined);
});
