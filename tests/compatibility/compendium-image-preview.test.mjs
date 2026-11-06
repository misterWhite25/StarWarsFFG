import test from 'node:test';
import assert from 'node:assert/strict';
import {renderCompendiumImagePreviews} from '../../modules/helpers/sheet-portrait.js';

class Node {
 constructor(){this.children=[];this.events={};this.attrs={};this.dataset={};}
 append(child){this.children.push(child);}
 setAttribute(name,value){this.attrs[name]=value;}
 addEventListener(name,fn){this.events[name]=fn;}
 querySelector(){return this.children.find(child=>child.className==='ffg-compendium-image-preview');}
}
function setup({visible=true,documentName='Actor',img='droid.webp'}={}) {
 const row=new Node();row.dataset.entryId='npc';
 const root={querySelectorAll:()=>[row]},entry={name:'Droïde <test>',img};
 const pack={visible,documentName,locked:true,index:new Map([['npc',entry]])};
 const opened=[];
 globalThis.document={createElement:()=>new Node()};
 globalThis.game={i18n:{localize:()=>"Voir l’image en grand"}};
 globalThis.foundry={applications:{apps:{ImagePopout:class {constructor(options){opened.push(options);}render(options){opened.at(-1).render=options;}}}}};
 return {app:{collection:pack},root,row,pack,entry,opened};
}

test('a locked NPC compendium opens current artwork without opening or importing the document',()=>{
 const f=setup();renderCompendiumImagePreviews(f.app,f.root);
 const button=f.row.children[0];assert.equal(button.type,'button');assert.equal(button.children[0].className,'fa-solid fa-magnifying-glass-plus');
 assert.equal(button.attrs['aria-label'],'Voir l’image en grand : Droïde <test>');
 f.entry.img='updated.webp';let prevented=0,stopped=0;
 button.events.click({preventDefault(){prevented++;},stopPropagation(){stopped++;}});
 assert.deepEqual(f.opened,[{src:'updated.webp',window:{title:'Droïde <test>'},render:{force:true}}]);
 button.events.dblclick({preventDefault(){prevented++;},stopPropagation(){stopped++;}});
 assert.equal(prevented,2);assert.equal(stopped,2);assert.equal(f.opened.length,1);
});
test('item compendium previews remain single across repeated renders and accept legacy HTML wrappers',()=>{
 const f=setup({documentName:'Item'});renderCompendiumImagePreviews(f.app,[f.root]);renderCompendiumImagePreviews(f.app,f.root);
 assert.equal(f.row.children.length,1);f.pack.visible=false;
 f.row.children[0].events.click({preventDefault(){},stopPropagation(){}});assert.equal(f.opened.length,0);
});
test('hidden compendiums, unsupported documents, missing artwork and deleted entries produce no preview',()=>{
 for(const options of [{visible:false},{documentName:'JournalEntry'},{img:''}]){const f=setup(options);renderCompendiumImagePreviews(f.app,f.root);assert.equal(f.row.children.length,0);}
 const f=setup();renderCompendiumImagePreviews(f.app,f.root);f.pack.index.delete('npc');
 f.row.children[0].events.click({preventDefault(){},stopPropagation(){}});assert.equal(f.opened.length,0);
});
