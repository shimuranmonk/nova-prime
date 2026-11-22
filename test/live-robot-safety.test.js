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

for (const mode of ['reps']) {
  test(`${mode} lost completion notification triggers deadline Stop`,async()=>{
    const f=fixture(mode);await f.connect();await f.start();await f.c.advance(7000);
    assert.equal(f.controller.state,'ERROR');assert.ok(f.stops().length);
    assert.match(f.panel.fields['#full-test-status'].textContent,/COMPLETION_TIMEOUT/);
  });
  test(`${mode} valid completion stops the robot without timeout`,async()=>{
    const f=fixture(mode);await f.connect();await f.start();await f.c.advance(2000);await f.done();
    assert.equal(f.controller.state,'COMPLETED');const n=f.stops().length;await f.c.advance(10000);assert.equal(f.stops().length,n);
  });
}
test('connected unused robot receives Stop then disconnect at two minutes',async()=>{
  const f=fixture();await f.connect();await f.c.advance(119999);assert.equal(f.header.dataset.connected,'true');
  await f.c.advance(1);assert.equal(f.header.dataset.connected,'false');assert.equal(f.programs().length,0);assert.equal(f.stops().length,1);
});
test('Stop followed by inactivity disconnects without later firing',async()=>{
  const f=fixture();await f.connect();await f.start();await f.command('stop');await f.c.advance(120000);
  assert.equal(f.header.dataset.connected,'false');assert.equal(f.programs().length,1);
});
test('paused robot disconnects after inactivity; Resume cannot launch',async()=>{
  const f=fixture('music');await f.connect();await f.start();await f.command('pause');await f.c.advance(120000);
  assert.equal(f.header.dataset.connected,'false');assert.equal((await f.command('resume')).status,'REJECTED');assert.equal(f.programs().length,1);
});
test('active progressing Music is not disconnected by the idle timer',async()=>{
  const f=fixture('music');await f.connect();await f.start();
  for(let i=0;i<130;i++){f.rawAudio.currentTime+=1;await f.c.advance(1000);}
  assert.equal(f.header.dataset.connected,'true');assert.equal(f.stops().length,0);await f.command('stop');
});
test('ONCE completion explicitly stops without firing again',async()=>{
  const f=fixture('msync');f.parsed.cues[0].once=true;await f.connect();await f.start();
  const n=f.stops().length;await f.done();assert.equal(f.stops().length,n+1);assert.equal(f.programs().length,1);await f.command('stop');
});
test('failed Stop returns visible failure and disconnects instead of claiming success',async()=>{
  const f=fixture();await f.connect();await f.start();f.failStops();const result=await f.command('stop');
  assert.equal(result.status,'FAILED');assert.equal(result.motorPower,'unknown');assert.equal(f.header.dataset.connected,'false');
  assert.match(f.panel.fields['#full-test-status'].textContent,/physical power/);assert.equal(f.stops().length,2);
});
test('backgrounding connected idle robot stops and disconnects immediately',async()=>{
  const f=fixture();await f.connect();f.doc.visibilityState='hidden';await f.doc.emit('visibilitychange');
  assert.equal(f.header.dataset.connected,'false');assert.equal(f.stops().length,1);
});
test('DONE during an unfinished Resume is ignored; DONE after acceptance completes without a time filter',async()=>{
  const f=fixture();await f.connect();await f.start();await f.command('pause');
  let release;f.holdProgram(new Promise(resolve=>{release=resolve;}));
  const resuming=f.command('resume');await flush();await f.done();assert.equal(f.controller.state,'PAUSED');
  release();await resuming;await f.done();assert.equal(f.controller.state,'COMPLETED');
});

test('stalled Music resume requests Stop instead of allowing endless robot activity',async()=>{
  const f=fixture('music');await f.connect();await f.start();await f.command('pause');
  let release;f.rawAudio.play=()=>new Promise(r=>{release=r;});const resuming=f.command('resume');await flush();
  const n=f.stops().length;await f.c.advance(5000);assert.ok(f.stops().length>n);assert.equal(f.controller.state,'ERROR');
  release();await resuming;assert.notEqual(f.audio.snapshot().state,'playing');
});
test('Stop during delayed Music resume prevents late session revival',async()=>{
  const f=fixture('music');await f.connect();await f.start();await f.command('pause');
  let release;f.rawAudio.play=()=>new Promise(r=>{release=r;});const resuming=f.command('resume');await flush();
  await f.command('stop');const n=f.programs().length;release();await resuming;
  assert.equal(f.controller.state,'IDLE');assert.equal(f.audio.snapshot().state,'idle');assert.equal(f.programs().length,n);
});
test('ongoing playback progress avoids false watchdog trips',async()=>{
  const f=fixture('msync');await f.connect();await f.start();
  for(let i=0;i<8;i++){f.rawAudio.currentTime+=1;await f.c.advance(1000);}
  assert.equal(f.controller.state,'RUNNING');await f.command('stop');
});

test('disconnected Start is blocked with visible connection guidance',async()=>{
  const f=fixture();await f.start();assert.equal(f.programs().length,0);assert.equal(f.controller.state,'IDLE');
  assert.match(f.panel.fields['#full-test-status'].textContent,/Connect and authenticate/);
});
test('Stop while disconnected cannot report a successful hardware Stop',async()=>{
  const f=fixture();const result=await f.command('stop');assert.equal(result.status,'FAILED');assert.equal(result.motorPower,'unknown');
});

test('three Push FH balls can complete sooner than the duration estimate',async()=>{
  const {BUILTIN_DRILLS}=await import('../src/domain/drills/builtin-catalog.js');
  const drill=BUILTIN_DRILLS.find(d=>d.name==='Push FH');const f=fixture();
  globalThis.FormData=class{get(k){return k==='amount'?'3':k==='pause'?'0':null;}};
  f.bridge.resolveDrill=()=>drill;f.bridge.programForDrill=()=>drill.programs[1];
  await f.connect();await f.start();await f.c.advance(3334);await f.done();
  assert.equal(f.controller.state,'COMPLETED');assert.equal(f.stops().length,1);
  assert.equal((await f.command('reset')).status,'EXECUTED');assert.equal(f.controller.state,'IDLE');
});
for(const outcome of ['pending','rejected']) {
  test(`statistics ${outcome} cannot block completion or Done`,async()=>{
    const f=fixture();let release;
    f.bridge.recordCompletedBalls=outcome==='pending'?()=>new Promise(resolve=>{release=resolve;}):async()=>{throw Error('quota');};
    await f.connect();await f.start();await f.c.advance(2000);await f.done();
    assert.equal(f.controller.state,'COMPLETED');assert.equal(f.stops().length,1);
    if(outcome==='rejected'){
      assert.match(f.panel.fields['#full-test-status'].textContent,/statistics could not be saved/);
      assert.doesNotMatch(f.panel.fields['#full-test-status'].textContent,/Stop failed/);
    }
    assert.equal((await f.command('reset')).status,'EXECUTED');assert.equal(f.controller.state,'IDLE');
    release?.();await flush();assert.equal(f.controller.state,'IDLE');
  });
}
for(const mode of ['music','msync']) {
  test(`${mode} pending preparation is canceled on background/disconnect`,async()=>{
    const f=fixture(mode);await f.connect();let release;
    const service=mode==='music'?f.bridge.musicLibrary:f.bridge.msyncService;
    const method=mode==='music'?'resolve':'revalidate';const original=service[method];service[method]=()=>new Promise(r=>{release=r;});
    const starting=f.start();await flush();f.doc.visibilityState='hidden';await f.doc.emit('visibilitychange');
    release(await original());await starting;assert.equal(f.programs().length,0);assert.equal(f.header.dataset.connected,'false');
  });
}

test('Time stops at the configured duration without waiting for DONE', async () => {
  const f = fixture('time');
  globalThis.FormData = class { get(key) { return key === 'amount' ? '10' : '0'; } };
  await f.connect();
  await f.start();
  await f.c.advance(9999);
  assert.equal(f.controller.state, 'RUNNING');
  assert.equal(f.stops().length, 0);
  await f.c.advance(1);
  assert.equal(f.controller.state, 'COMPLETED');
  assert.equal(f.stops().length, 1);
  await f.done();
  await f.c.advance(5000);
  assert.equal(f.stops().length, 1);
});

test('Music plays during countdown and dispatches only after it expires', async () => {
  const f = fixture('music');
  await f.connect();
  await f.doc.emit('submit', {
    target: { matches: selector => selector === '#session-form' },
    preventDefault() {},
    stopImmediatePropagation() {},
  });
  assert.equal(f.audio.snapshot().state, 'playing');
  assert.equal(f.controller.state, 'COUNTDOWN');
  assert.equal(f.programs().length, 0);
  f.controller.tick(2);
  await flush();
  assert.equal(f.programs().length, 0);
  f.controller.tick(1);
  await flush();
  assert.equal(f.programs().length, 1);
});
