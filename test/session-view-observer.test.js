import test from 'node:test';
import assert from 'node:assert/strict';
import { observeSessionView } from '../src/app/session-view-observer.js';
import { LocalSessionController } from '../src/application/sessions/session-controller.js';
import { createSessionSpec } from '../src/domain/sessions/schema.js';
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};

test('terminal session changes refresh the displayed state without a timer or button click',async()=>{
  for(const ending of ['complete','fail','stop']) {
    const controller=new LocalSessionController();let displayed='IDLE';
    const unsubscribe=observeSessionView(controller,{render:()=>{displayed=controller.state;}});
    controller.start(createSessionSpec({drillId:'drill',repetitions:3}),{countdownSeconds:0,liveRun:true});await flush();
    assert.equal(displayed,'RUNNING');controller[ending]();await flush();
    assert.equal(displayed,controller.state);assert.notEqual(displayed,'RUNNING');unsubscribe();
  }
});
test('state observation does not navigate away from another route',async()=>{
  const controller=new LocalSessionController();let count=0;
  const unsubscribe=observeSessionView(controller,{render:()=>count++,isVisible:()=>false});
  controller.start(createSessionSpec({drillId:'drill'}));controller.stop();await flush();assert.equal(count,0);unsubscribe();
});
test('history save rejection leaves Completed usable and displays a storage warning',async()=>{
  const controller=new LocalSessionController({onRecord:async()=>{throw Error('quota');}});
  let screen;observeSessionView(controller,{render:()=>{screen=controller.snapshot();}});
  controller.start(createSessionSpec({drillId:'drill'}),{countdownSeconds:0,liveRun:true});controller.complete();await flush();
  assert.equal(screen.state,'COMPLETED');assert.match(screen.recordError,/quota/);
  assert.equal(controller.reset().status,'EXECUTED');await flush();assert.equal(screen.state,'IDLE');assert.equal(screen.recordError,null);
});
