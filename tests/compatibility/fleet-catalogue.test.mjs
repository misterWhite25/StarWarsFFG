import test from 'node:test';
import assert from 'node:assert/strict';
import {getFleetCatalogue} from '../../modules/helpers/fleet-catalogue.mjs';
test('world models exclude generated fleet copies unless explicitly requested',async()=>{
  const previous=globalThis.game;
  try{
    const vehicle=(id,flags={})=>({uuid:'Actor.'+id,name:id,type:'vehicle',system:{spaceShip:true},flags});
    globalThis.game={actors:[vehicle('Imported'),vehicle('FleetCopy',{starwarsffg:{fleet:{version:1}}})],i18n:{lang:'fr'},settings:{get:()=>({})}};
    assert.deepEqual((await getFleetCatalogue({includeCompendiums:false})).map(row=>row.uuid),['Actor.Imported']);
    assert.equal((await getFleetCatalogue({includeCompendiums:false,includeFleetCopies:true})).length,2);
  }finally{globalThis.game=previous;}
});
test('modern, legacy and UUID-less actor indices become valid modern vehicle references',async()=>{
  const previous=globalThis.game;
  try{
    globalThis.game={actors:[],modules:new Map(),i18n:{lang:'fr'},settings:{get:()=>({})},packs:[{
      collection:'test.vehicles',metadata:{type:'Actor',label:'Test'},visible:true,
      getIndex:async()=>[
        {_id:'modern',uuid:'Compendium.test.vehicles.Actor.modern',type:'vehicle',name:'Moderne',system:{spaceShip:true}},
        {_id:'legacy',uuid:'Compendium.test.vehicles.legacy',type:'vehicle',name:'Ancien',system:{spaceShip:true}},
        {_id:'plain',type:'vehicle',name:'Sans UUID',system:{spaceShip:true}},
        {_id:'ground',type:'vehicle',name:'Char',system:{spaceShip:false}}
      ]
    }]};
    const entries=await getFleetCatalogue({refresh:true,includeWorld:false});
    assert.deepEqual(entries.map(row=>row.uuid).sort(),['Compendium.test.vehicles.Actor.legacy','Compendium.test.vehicles.Actor.modern','Compendium.test.vehicles.Actor.plain']);
  }finally{globalThis.game=previous;}
});
