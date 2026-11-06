import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const {filterActorTree,createDirectoryClasses,registerVehicleDirectory}=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(new URL('../../modules/helpers/vehicle-directory.js',import.meta.url),'utf8')).toString('base64'));
test('mixed folders are split without modifying documents, references, permissions or the original tree',()=>{
 const pc={id:'pc',type:'character'},ship={id:'ship',type:'vehicle'},hidden={id:'hidden',type:'vehicle'};
 const tree={root:true,visible:true,entries:[pc],children:[{visible:true,folder:{id:'mixed'},entries:[ship,pc],children:[]},{visible:false,entries:[hidden],children:[]},{visible:true,entries:[pc],children:[]}]};
 const before=JSON.stringify(tree),v=filterActorTree(tree,true),a=filterActorTree(tree,false);
 assert.equal(v.entries.length,0);assert.equal(v.children.length,1);assert.deepEqual(v.children[0].entries,[ship]);assert.equal(v.children[0].entries[0],ship);
 assert.equal(a.children.length,2);assert.deepEqual(a.children[0].entries,[pc]);assert.equal(JSON.stringify(tree),before);
});
class Base {
 async _prepareDirectoryContext(context){context.tree=this.tree;}
 async _prepareHeaderContext(context){context.searchMode={};}
 async _getDroppedEntryFromData(data){return data;}
}
test('native directories share Actor collection and constrain vehicle creation and drops',async()=>{
 globalThis.game={i18n:{localize:key=>key}};globalThis.ui={notifications:{warn:()=>{}}};
 const {VehicleDirectory,CharacterDirectory}=createDirectoryClasses(Base),v=new VehicleDirectory();
 let args;v.documentClass={createDialog:(...data)=>args=data};v._onCreateEntry({stopPropagation(){}},{closest:()=>({dataset:{folderId:'folder'}})});
 assert.deepEqual(args,[{type:'vehicle',folder:'folder'},{},{types:['vehicle'],classes:['ffg-actor-create-dialog']}]);
 assert.equal(await v._getDroppedEntryFromData({type:'character'}),null);assert.deepEqual(await v._getDroppedEntryFromData({type:'vehicle'}),{type:'vehicle'});
 assert.equal(VehicleDirectory.tabName,'vehicles');assert(CharacterDirectory.prototype instanceof Base);
});
test('the GM-only NPC tab and vehicle tab follow actors through native sidebar configuration',()=>{
 class Sidebar {static TABS={chat:{},actors:{},items:{}};}
 globalThis.CONFIG={Actor:{sidebarIcon:'fa-solid fa-user'},ui:{actors:Base,sidebar:Sidebar}};registerVehicleDirectory();
 assert.deepEqual(Object.keys(Sidebar.TABS),['chat','actors','npcs','vehicles','items']);assert.equal(Sidebar.TABS.npcs.gmOnly,true);assert.equal(CONFIG.ui.npcs.tabName,'npcs');assert.equal(CONFIG.ui.vehicles.tabName,'vehicles');assert(CONFIG.ui.actors.prototype instanceof Base);
});
