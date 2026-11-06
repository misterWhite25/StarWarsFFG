import test from 'node:test';
import assert from 'node:assert/strict';
import {renderReviewedTalentControls} from '../../modules/helpers/reviewed-talent-ui.js';
test('jury rigging adds one state icon per equipment row, never to nested item-id controls, and reflects rank loss',()=>{
 class Node{
  constructor(classes=''){this.className=classes;this.children=[];this.dataset={};this.attrs={};this.events={};this.style={};}
  append(...nodes){for(const n of nodes){n.parentElement=this;this.children.push(n);}}prepend(n){n.parentElement=this;this.children.unshift(n);}
  remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(n=>n!==this);}
  setAttribute(k,v){this.attrs[k]=v;}addEventListener(k,fn){this.events[k]=fn;}
  all(){return this.children.flatMap(n=>[n,...n.all()]);}
  querySelector(selector){if(selector==='.sheet-body')return this.area;return this.all().find(n=>n.className.split(' ').includes(selector.slice(1)))??null;}
  querySelectorAll(selector){
   if(selector==='.items-list > .item[data-item-id]')return this.rows;
   if(selector==='[data-item-id]')return this.all().filter(n=>n.dataset.itemId);
   return this.all().filter(n=>n.className.split(' ').includes(selector.slice(1)));
  }
 }
 const root=new Node();root.area=new Node('sheet-body');root.append(root.area);root.rows=[];
 for(const id of ['a','b']){const row=new Node('item');row.dataset.itemId=id;const cell=new Node(),toggle=new Node('toggle-equipped');toggle.dataset.itemId=id;cell.append(toggle);row.append(cell,new Node('item-controls'));root.rows.push(row);root.append(row);}
 const talent={id:'talent',name:'Bidouillage',type:'talent',system:{ranks:{ranked:true,current:2}}},a={id:'a',name:'Arme A',type:'weapon',flags:{starwarsffg:{juryRigged:{effect:'damage',createdAt:'1'}}}},b={id:'b',name:'Arme B',type:'weapon'};
 const items=[talent,a,b];items.get=id=>items.find(i=>i.id===id);const actor={items,isOwner:true,_reviewedTalentPaths:[]};
 const old=globalThis.document;globalThis.document={createElement:()=>new Node()};
 try{
  renderReviewedTalentControls({element:root,actor});let icons=root.querySelectorAll('.ffg-jury-control');assert.equal(icons.length,2);
  assert.equal(icons[0].attrs['aria-pressed'],'true');assert.equal(icons[0].dataset.juryState,'applied');assert.match(icons[0].title,/\+1 dégât/);
  assert.equal(icons[1].attrs['aria-pressed'],'false');assert.equal(icons[1].dataset.juryState,'none');
  for(const row of root.rows){assert.equal(row.querySelectorAll('.ffg-jury-control').length,1);assert.equal(row.querySelector('.item-controls').children.length,0);assert.equal(row.querySelector('.toggle-equipped').children.length,0);}
  renderReviewedTalentControls({element:root,actor});assert.equal(root.querySelectorAll('.ffg-jury-control').length,2);
  talent.system.ranks.current=0;renderReviewedTalentControls({element:root,actor});icons=root.querySelectorAll('.ffg-jury-control');assert.equal(icons.length,1);assert.equal(icons[0].dataset.juryState,'inactive');assert.equal(icons[0].attrs['aria-pressed'],'false');
 }finally{if(old===undefined)delete globalThis.document;else globalThis.document=old;}
});
