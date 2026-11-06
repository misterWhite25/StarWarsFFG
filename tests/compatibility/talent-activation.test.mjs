import test from 'node:test';
import assert from 'node:assert/strict';
import {talentActivationKey} from '../../modules/helpers/talent-activation.js';
import {talent_activations} from '../../modules/config/ffg-talents.js';
test('talent rows resolve stored activations and tree activations to existing translation keys',()=>{
 for(const entry of Object.values(talent_activations)){
  assert.equal(talentActivationKey(entry.value),entry.label);
  assert.equal(talentActivationKey(entry),entry.label);
  assert.equal(talentActivationKey(entry.label),entry.label);
 }
 assert.equal(talentActivationKey('Active (Incidental)','stale-label'),'SWFFG.TalentActivationsActiveIncidental');
 assert.equal(talentActivationKey(null,'SWFFG.TalentActivationsPassive'),'SWFFG.TalentActivationsPassive');
 assert.equal(talentActivationKey('Custom activation'),'Custom activation');
 assert.equal(talentActivationKey(null),'');
});
