import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture, flush} from '../test-support/live-runtime-fixture.js';

for (const mode of ['music', 'msync']) {
  test(`${mode} playback failure stops the robot and cancels repeats`, async () => {
    const f=fixture(mode); await f.connect(); await f.start();
    f.rawAudio.error={message:'Decoder failed'}; await f.rawAudio.emit('error');
    assert.ok(f.stops().length); const n=f.programs().length;
    await f.c.advance(600000); assert.equal(f.programs().length,n);
    assert.equal(f.controller.state,'ERROR');
  });
  test(`${mode} frozen playback stops within five seconds without further batches`, async () => {
    const f=fixture(mode); await f.connect(); await f.start();
    const n=f.programs().length; await f.c.advance(5000);
    assert.ok(f.stops().length); assert.equal(f.controller.state,'ERROR');
    await f.c.advance(600000); assert.equal(f.programs().length,n);
  });
  test(`${mode} pending preparation cannot launch after Stop`, async () => {
    const f=fixture(mode); await f.connect(); let release;
    const service=mode==='music'?f.bridge.musicLibrary:f.bridge.msyncService;
    const method=mode==='music'?'resolve':'revalidate'; const original=service[method];
    service[method]=()=>new Promise(r=>{release=r;});
    const starting=f.start(); await flush(); await f.command('stop');
    release(await original()); await starting;
    assert.equal(f.programs().length,0); assert.equal(f.controller.state,'IDLE');
  });
  test(`${mode} normal end stops and never repeats after completion`,async()=>{
    const f=fixture(mode);await f.connect();await f.start();await f.rawAudio.emit('ended');
    assert.ok(f.stops().length);const n=f.programs().length;await f.c.advance(600000);assert.equal(f.programs().length,n);
  });
}
test('playlist next-track failure stops an already running endless command',async()=>{
  const f=fixture('music');f.bridge.musicLibrary.resolve=async()=>({tracks:[f.track,{...f.track,id:'second'}]});
  await f.connect();await f.start();f.rawAudio.play=async()=>{throw Error('Track failed');};await f.rawAudio.emit('ended');
  assert.ok(f.stops().length);assert.equal(f.controller.state,'ERROR');
});
test('late Stop acknowledgement does not complete a paused Reps session',async()=>{
  const f=fixture();await f.connect();await f.start();await f.command('pause');await f.done();
  assert.equal(f.controller.state,'PAUSED');
});
test('successful Stop cancels future firing for thirty virtual minutes',async()=>{
  const f=fixture();await f.connect();await f.start();await f.command('stop');
  const n=f.programs().length;await f.c.advance(1800000);assert.equal(f.programs().length,n);assert.equal(f.controller.state,'IDLE');
});
