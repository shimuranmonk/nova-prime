import test from "node:test";
import assert from "node:assert/strict";
import { LiveMsync } from "../src/application/msync/live-msync.js";
import { RobotExecutor } from "../src/application/robot/robot-executor.js";
import { LocalSessionController } from "../src/application/sessions/session-controller.js";
import { createSessionSpec } from "../src/domain/sessions/schema.js";
import { MsyncSimulator } from "../src/application/msync/msync-simulator.js";
import { createMsyncValidationContext } from "../src/application/msync/context.js";
import { resolveMsyncExecution } from "../src/application/msync/nova-plus/robot.js";
const flush = async () => { for(let i=0;i<30;i++) await Promise.resolve(); };
function fixture(cues) {
 const listeners=new Set(), sent=[], timers=[];
 const connection={ready:true,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},async write(packet){sent.push([...packet]); if(packet[0]===0x80) for(const fn of listeners) fn({type:"done"});}};
 const audioListeners=new Set();
 const audio={state:"idle",position:0,snapshot(){return{state:this.state,currentTime:this.position/1000};},subscribe(fn){audioListeners.add(fn);fn(this.snapshot());return()=>audioListeners.delete(fn);},currentTimeMs(){return this.position;},async start(){this.state="playing";this.emit();},pause(){this.state="paused";this.emit();},async resume(){this.state="playing";this.emit();return true;},stop(){this.state="idle";this.emit();},emit(){for(const fn of audioListeners)fn(this.snapshot());}};
 const controller=new LocalSessionController(); controller.start(createSessionSpec({mode:"msync",msyncAttachmentId:"msync_test"}),{countdownSeconds:0,liveRun:true});
 const projection=new MsyncSimulator();
 const runtime=new LiveMsync({audioPlayer:audio,connection,executor:new RobotExecutor({connection}),projection,controller,setTimer:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimer:()=>{}});
 const parsed={session:{countdown:0,robotLead:0,cyclePause:1},audio:{durationMs:100000},drills:{},flavors:{},inline:{INL_ONE:{random:false,balls:[{ball:1,speed:3,spin:1,type:"top",height:40,drop:0,bpm:60,reps:1}]}},cues:cues??[{timeMs:0,type:"INLINE",name:"INL_ONE"},{timeMs:1000,type:"REST",durationMs:1000},{timeMs:4000,type:"STOP"}]};
 return{runtime,parsed,audio,connection,sent,timers,projection,controller};
}
test("Prime executes Nova Plus repeat batches, REST resume and priority Stop through one executor",async()=>{
 const f=fixture();await f.runtime.start(f.parsed,{audioBlob:new Blob(["audio"])},0);await flush();
 assert.deepEqual(f.sent.map(p=>p[0]),[0x80,0x81]);assert.equal(new DataView(Uint8Array.from(f.sent[1]).buffer).getUint16(4,true),100);
 f.runtime.session.processPosition(1000);await flush();assert.equal(f.sent.at(-1)[0],0x80);
 f.runtime.session.processPosition(2000);await flush();assert.equal(f.sent.at(-1)[0],0x81);
 await f.runtime.pause();assert.equal(f.audio.state,"paused");assert.equal(f.sent.at(-1)[0],0x80);
 await f.runtime.resume();await flush();assert.equal(f.audio.state,"playing");assert.equal(f.sent.at(-1)[0],0x81);
 await f.runtime.stop();assert.equal(f.projection.snapshot().state,"stopped");const count=f.sent.length;f.runtime.session.processPosition(3000);await flush();assert.equal(f.sent.length,count);assert.equal(f.sent.at(-1)[0],0x80);
 await f.runtime.destroy();
});
test("more than 100 events cannot stall robot cue execution",async()=>{
 const cues=Array.from({length:140},(_,i)=>({timeMs:i*100,type:"INLINE",name:"INL_ONE",once:true}));
 const f=fixture(cues);await f.runtime.start(f.parsed,{audioBlob:new Blob(["audio"])},0);await flush();
 for(let i=1;i<140;i++){f.audio.position=i*100;f.runtime.session.processPosition(i*100);await flush();}
 assert.equal(f.sent.filter(p=>p[0]===0x81).length,140);assert.equal(f.projection.snapshot().events.length,100);
 await f.runtime.destroy();
});
test("audio failure stops robot and cannot deliver later cues",async()=>{
 const f=fixture();await f.runtime.start(f.parsed,{audioBlob:new Blob(["audio"])},0);await flush();
 f.audio.state="error";f.audio.emit();await flush();assert.equal(f.controller.state,"ERROR");assert.equal(f.sent.at(-1)[0],0x80);
 const before=f.sent.length;f.runtime.session.processPosition(2000);await flush();assert.equal(f.sent.length,before);
 await f.runtime.destroy();
});
test("Prime reference context preserves direct spin type, speed, BPM and scatter for Nova Plus",()=>{
 const drill={id:"drill_sample",group:"A",random:true,programs:{1:{steps:[{enabled:true,scatter:2,variants:[{speed:4,spin:2,type:"back",height:40,drop:-2,bpm:60,repetitions:3}]}]}}};
 const context=createMsyncValidationContext(null,[drill]);
 const resolved=resolveMsyncExecution({drills:{DRL_ONE:{data:context.drillData[drill.id][1],random:true}}},{type:"DRILL",name:"DRL_ONE"});
 const ball=resolved.steps[0][0];assert.equal(ball[7],4);assert.equal(ball[8],2);assert.equal(ball[9],"back");assert.equal(ball[4],50);assert.equal(ball[10],2);assert.equal(resolved.random,true);
});

test("stopping during countdown cancels pre-roll and delayed audio start",async()=>{
 const f=fixture();f.parsed.session.countdown=4;f.parsed.session.robotLead=1.3;
 await f.runtime.start(f.parsed,{audioBlob:new Blob(["audio"])},1.3);
 assert.equal(f.audio.state,"idle");assert.equal(f.projection.snapshot().state,"countdown");
 await f.runtime.stop();
 // Even a stale pre-roll callback cannot launch after session termination.
 for(const timer of [...f.timers]) if(timer.ms===2700) timer.fn();
 await flush();assert.equal(f.sent.filter(p=>p[0]===0x81).length,0);
 await f.runtime.destroy();
});
