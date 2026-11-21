import test from 'node:test';
import assert from 'node:assert/strict';
import {createMsyncInlineBlock,createMsyncReference,makeInlineAlias} from '../src/domain/msync/inline-export.js';
const ball={speed:5,spin:2,type:'top',height:50,drop:0,bpm:60,repetitions:1};
const drill={id:'drill_test',source:'custom',name:'test',random:false,programs:{1:{steps:[{enabled:false,variants:[ball]},{enabled:true,scatter:2,variants:[ball,{...ball,type:'back'}]}]},2:{steps:[{enabled:true,variants:[{...ball,speed:3}]}]}}};
test('MSYNC inline preserves active steps, variants, scatter and chosen level',()=>{
 assert.equal(createMsyncInlineBlock(drill), '[INLINE:INL_TEST]\nNAME=test\nRANDOM=false\nBALL=1;SPEED=5;SPIN=2;TYPE=top;HEIGHT=50;DROP=0;BPM=60;REPS=1;SCATTER=2\nBALL=1;SPEED=5;SPIN=2;TYPE=back;HEIGHT=50;DROP=0;BPM=60;REPS=1;SCATTER=2');
 assert.match(createMsyncInlineBlock(drill,2),/SPEED=3/);
 assert.throws(()=>createMsyncInlineBlock(drill,3),/no active balls/);
 assert.equal(makeInlineAlias('123 Café'),'INL_DRILL_123_CAFE');
 assert.equal(createMsyncReference(drill),'CUSTOM:drill_test');
 assert.throws(()=>createMsyncReference({...drill,source:'builtin'}));
});
