import test from 'node:test';
import assert from 'node:assert/strict';
import {MINECRAFT_QUESTIONS,getMinecraftQuestion} from './questions.mjs';
test('all 200 original challenge pairs are valid',()=>{
 assert.equal(MINECRAFT_QUESTIONS.length,200);
 assert.deepEqual(MINECRAFT_QUESTIONS.map(q=>q.id),Array.from({length:200},(_,i)=>i+1));
 for(const q of MINECRAFT_QUESTIONS){assert.ok(q.optionA.trim());assert.ok(q.optionB.trim())}
 assert.equal(getMinecraftQuestion(201),null);
 assert.equal(getMinecraftQuestion(1)?.id,1);
});
