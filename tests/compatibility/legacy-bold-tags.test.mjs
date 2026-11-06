import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeBoldTags} from '../../modules/helpers/legacy-text-format.js';
test('legacy bold accepts a difficulty code and multiline text inside the emphasis',()=>{
 assert.equal(normalizeBoldTags('Effectuez [B]test de Commandement\nMoyen ([DI][DI])[b].'), 'Effectuez <strong>test de Commandement\nMoyen ([DI][DI])</strong>.');
});
test('standard BBCode bold is accepted without changing dice codes or existing HTML',()=>{
 assert.equal(normalizeBoldTags('[b]Test [BO][/b] puis <strong>texte</strong> [DI]'), '<strong>Test [BO]</strong> puis <strong>texte</strong> [DI]');
});
test('multiple legacy emphasis spans stay separate',()=>{
 assert.equal(normalizeBoldTags('[B]un[b] et [B]deux[b]'), '<strong>un</strong> et <strong>deux</strong>');
});
