import test from 'node:test';
import assert from 'node:assert/strict';
import {npcAdversaryRank} from '../../modules/helpers/npc-command-data.mjs';
const talent=(name,rank,id=name)=>({id,name,type:'talent',system:{ranks:{current:rank,ranked:true}}});
test('Adversary badge reads French and English ranks and sums acquisitions without derived duplicates',()=>{
  const actor={items:[talent('Adversary',2,'a'),talent('Adversité',1,'b')],talentList:[{name:'Adversary',itemId:'a',rank:2},{name:'Adversité',itemId:'b',rank:1}]};
  assert.equal(npcAdversaryRank(actor),3);
  assert.equal(npcAdversaryRank({items:[talent('Adversaire',7)]}),7);
});
test('absence, zero, inactive and invalid ranks do not produce a badge',()=>{
  assert.equal(npcAdversaryRank({items:[]}),0);
  assert.equal(npcAdversaryRank({items:[talent('Nobody’s Fool',2),talent('Adversary',0)]}),0);
  assert.equal(npcAdversaryRank({items:[{...talent('Adversary',2),system:{active:false,ranks:{current:2}}}]}),0);
  assert.equal(npcAdversaryRank({items:[talent('Adversary',Infinity)]}),0);
});
test('custom configured names, learned specialization nodes and derived-only NPC talents are supported',()=>{
  assert.equal(npcAdversaryRank({items:[talent('Opposition',3)]},'Opposition'),3);
  assert.equal(npcAdversaryRank({items:[{id:'s',name:'Specialization',type:'specialization',system:{talents:{a:{name:'Adversary',islearned:true,rank:2},b:{name:'Adversary',islearned:false,rank:4}}}}],talentList:[{name:'Adversary',rank:2}]}),2);
  assert.equal(npcAdversaryRank({items:[],talentList:[{name:'Adversité',rank:4}]}),4);
});
