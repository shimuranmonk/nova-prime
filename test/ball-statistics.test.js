import test from 'node:test';
import assert from 'node:assert/strict';
import {BallStatistics} from '../src/application/ball-statistics.js';
import {MemoryStore} from '../src/infrastructure/storage/memory-store.js';
test('ball totals carry forward, serialize completions, and reset balls only',async()=>{
 const service=new BallStatistics(new MemoryStore());
 await service.set(100,20);
 await Promise.all([service.completed(3),service.completed(4)]);
 assert.deepEqual(await service.totals(),{id:'ball-statistics',balls:107,drills:22});
 await service.resetBalls();
 assert.deepEqual(await service.totals(),{id:'ball-statistics',balls:0,drills:22});
 await assert.rejects(service.set(-1,2));
 await assert.rejects(service.set(1.5,2));
 assert.equal((await service.totals()).drills,22);
});
