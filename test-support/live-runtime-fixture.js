import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const root=new URL('../', import.meta.url);
const moduleAt=p=>import(new URL(p, root));
const {mountLiveRobotControls}=await moduleAt('src/app/live-robot-runtime.js');
const {LocalSessionController}=await moduleAt('src/application/sessions/session-controller.js');
const {createSessionSpec}=await moduleAt('src/domain/sessions/schema.js');
const {AudioPlayer}=await moduleAt('src/application/music/audio-player.js');
const {MsyncSimulator}=await moduleAt('src/application/msync/msync-simulator.js');
const {NOVA_PACKETS}=await moduleAt('src/infrastructure/robot/nova-protocol.js');
const {RobotExecutor}=await moduleAt('src/application/robot/robot-executor.js');
const {RobotSafetyMonitor}=await moduleAt('src/application/robot/robot-safety-monitor.js');
const {WebBluetoothTransport}=await moduleAt('src/infrastructure/robot/web-bluetooth-transport.js');
const flush=async()=>{for(let i=0;i<100;i++)await Promise.resolve();};
class Target{
 constructor(){this.handlers=new Map();this.textContent='';this.dataset={};this.children=[];this.checked=true;this.disabled=false;this.visibilityState='visible';}
 addEventListener(t,fn){if(!this.handlers.has(t))this.handlers.set(t,[]);this.handlers.get(t).push(fn);}
 removeEventListener(t,fn){this.handlers.set(t,(this.handlers.get(t)||[]).filter(f=>f!==fn));}
 async emit(t,e={}){for(const f of [...(this.handlers.get(t)||[])])await f(e);await flush();}
 async click(){if(!this.disabled)return this.emit('click');}
 setAttribute(){} removeAttribute(){} before(){} observe(){} load(){} pause(){}
 append(e){this.children.push(e);e.parentElement=this;}
 prepend(e){this.children.unshift(e);}
 querySelector(s){return this.fields?.[s]??null;} querySelectorAll(){return[];}
}
function clock(){let now=0,id=0;const jobs=new Map();return{jobs,get now(){return now;},set(fn,ms=0){const i=++id;jobs.set(i,{at:now+ms,fn});return i;},clear(i){jobs.delete(i);},async advance(ms){const end=now+ms;let n=0;for(;;){await flush();const next=[...jobs].filter(([,j])=>j.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;if(++n>100000)throw Error('TIMER_LOOP');jobs.delete(next[0]);now=next[1].at;next[1].fn();}now=end;await flush();}};}
function fixture(mode='reps', {random} = {}){
 const c=clock();globalThis.setTimeout=(f,ms)=>c.set(f,ms);globalThis.clearTimeout=i=>c.clear(i);
 const doc=new Target(),win=new Target(),panel=new Target(),header=new Target(),route=new Target(),form=new Target();
 panel.fields=Object.fromEntries(['area','power','connect','disconnect','stop','status','connection','diagnostics'].map(k=>['#full-test-'+k,k==='diagnostics'?null:new Target()]));
 const host=new Target(),menu=new Target();doc.createElement=()=>{const index=doc.created++;return index===0?panel:index===1?header:new Target();};doc.created=0;
 doc.fields={'#route-view':route,'#menu-toggle':menu,'#robot-control-root':host,'#session-form':form};
 Object.assign(globalThis,{document:doc,window:win,MutationObserver:class{observe(){}},isSecureContext:true,FormData:class{get(k){return k==='amount'?'2':k==='pause'?'0':k==='musicSource'?'quick':null;}}});
 let connectionWriteCount=0;
 const writes=[];const write=new Target(),notify=new Target();let failStops=false,failPrograms=false,holdProgram=null;
 const device=new Target();device.gatt={connected:false,async connect(){this.connected=true;return{getPrimaryService:async()=>({getCharacteristic:async u=>u.endsWith('ff01')?write:notify})};},disconnect(){this.connected=false;}};
 const notification=async bytes=>notify.emit('characteristicvaluechanged',{target:{value:new DataView(Uint8Array.from(bytes).buffer)}});
 write.writeValue=async bytes=>{const p=[...bytes];writes.push({t:c.now,p});if(p[0]===7)queueMicrotask(()=>void notification(new TextEncoder().encode('HEADERABCDEF123456CODE')));else if([8,1,2].includes(p[0]))queueMicrotask(()=>void notification([0]));if(p[0]===128&&p[3]===1&&failStops)throw Error('STOP_WRITE_FAILED');if(p[0]===129&&failPrograms)throw Error('PROGRAM_WRITE_FAILED');if(p[0]===129&&holdProgram)await holdProgram;};
 notify.startNotifications=async()=>notify;
 Object.defineProperty(globalThis,'navigator',{value:{bluetooth:{requestDevice:async()=>device}},configurable:true});
 const rawAudio=new Target();rawAudio.currentTime=0;rawAudio.duration=10;rawAudio.play=async()=>{};
 const audio=new AudioPlayer({audio:rawAudio,now:()=>c.now,setTimer:(fn,ms)=>c.set(fn,ms),clearTimer:i=>c.clear(i),urlObject:{createObjectURL:()=> 'blob:fake',revokeObjectURL(){}}});
 const controller=new LocalSessionController(),projection=new MsyncSimulator();
 const program={steps:[{enabled:true,scatter:0,variants:[{speed:2,spin:1,type:'top',height:40,drop:0,bpm:60,repetitions:1}]}]};
 const parsed={session:{countdown:0,robotLead:0,cyclePause:1},audio:{durationMs:10000},drills:{},flavors:{},inline:{ONE:{random:false,balls:[{ball:1,speed:2,spin:1,type:'top',height:40,drop:0,bpm:60,reps:1}]}},cues:[{timeMs:0,type:'INLINE',name:'ONE'}]};
 const track={id:'track',audioBlob:new Blob(['test']),durationMs:10000,msyncAttachmentId:'attachment'};
 const uiState={mode,drillId:'drill',level:1,quickTrackIds:['track'],msyncTrackId:'track',robotLeadSeconds:0,amount:2};
 const bridge={controller,audioPlayer:audio,msyncSimulator:projection,uiState,resolveDrill:()=>({id:'drill'}),programForDrill:()=>program,randomOrderFor:()=>false,createSessionSpec,render:async()=>{},recordCompletedBalls:async()=>{},getTrackCache:()=>[track],musicLibrary:{resolve:async()=>({tracks:[track]})},msyncService:{revalidate:async()=>({valid:true,newWarnings:[],attachment:{id:'attachment'},validation:{parsed},track})}};
 // Same canonical audio state reactions as production bootstrap (no synthetic robot Stop).
 let prior='idle';audio.subscribe(s=>{const prev=prior;prior=s.state;const m=controller.snapshot().spec?.mode;if(m==='music'&&s.state==='completed'&&prev!=='completed')controller.complete({completedCycles:s.completedTracks});if(m==='music'&&s.state==='error'&&prev!=='error')controller.fail('AUDIO_PLAYBACK_FAILED');if(m==='msync'&&s.state==='error'&&prev!=='error'){projection.stop();controller.fail('MSYNC_AUDIO_PLAYBACK_FAILED');}});
 let oldProjection='idle';projection.subscribe(s=>{const prev=oldProjection;oldProjection=s.state;if(controller.snapshot().spec?.mode==='msync'&&s.state==='completed'&&prev!=='completed'){audio.stop();controller.complete({completedCycles:s.activations});}});
 mountLiveRobotControls(bridge,{testOnly:false,now:()=>c.now,random});
 return{c,doc,win,panel,header,writes,rawAudio,audio,controller,parsed,track,projection,bridge,device,
  async connect(){await panel.fields['#full-test-connect'].click();assert.equal(header.dataset.connected,'true');connectionWriteCount=writes.length;},
  async start(){await doc.emit('submit',{target:{matches:s=>s==='#session-form'},preventDefault(){},stopImmediatePropagation(){}});if(controller.state==='COUNTDOWN')controller.tick(3);await flush();},
  done:()=>notification([0,2,3,0,5,1,0]),
  programs:()=>writes.filter(w=>w.p[0]===129),stops:()=>writes.slice(connectionWriteCount).filter(w=>w.p[0]===128&&w.p[3]===1),
  failStops(){failStops=true;},failPrograms(){failPrograms=true;},holdProgram(p){holdProgram=p;},
  command:cmd=>globalThis.NOVA_PRIME_LIVE_COMMAND(cmd)};
}

export {fixture, clock, flush, Target};
