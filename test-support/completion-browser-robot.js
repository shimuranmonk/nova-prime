// Local browser-test entry only. It replaces Bluetooth before importing the real app.
import { BallStatistics } from '../src/application/ball-statistics.js';

const panel=document.createElement('aside');
panel.style.cssText='position:fixed;bottom:0;left:0;z-index:100;background:#fff8cf;color:#172b3a;border:2px solid #8a6200;padding:8px;font:12px sans-serif';
panel.innerHTML='<strong>SIMULATED ROBOT — no hardware connection</strong> <label>Statistics test <select id="mock-statistics"><option value="normal">Normal</option><option value="error">Write error</option><option value="pending">Pending write</option></select></label> <output id="mock-packets">No drill packets</output>';
document.body.append(panel);
const audioLabel=document.createElement('label');
audioLabel.innerHTML=' Audio test <select id="mock-audio"><option value="normal">Normal audio</option><option value="rejected">Playback rejected</option><option value="pending">Playback pending</option></select>';
panel.append(audioLabel);
const nativePlay=HTMLMediaElement.prototype.play;
HTMLMediaElement.prototype.play=function(...args){
  const mode=document.querySelector('#mock-audio').value;
  if(mode==='rejected')return Promise.reject(new DOMException('SIMULATED_AUDIO_BLOCKED','NotAllowedError'));
  if(mode==='pending')return new Promise(()=>{});
  return nativePlay.apply(this,args);
};
const completed=BallStatistics.prototype.completed;
BallStatistics.prototype.completed=function(...args){
  const mode=document.querySelector('#mock-statistics').value;
  if(mode==='error')return Promise.reject(new Error('SIMULATED_STATISTICS_WRITE_ERROR'));
  if(mode==='pending')return new Promise(()=>{});
  return completed.apply(this,args);
};
const notify=new EventTarget();notify.startNotifications=async()=>notify;
const sendNotification=bytes=>{notify.value=new DataView(Uint8Array.from(bytes).buffer);notify.dispatchEvent(new Event('characteristicvaluechanged'));};
const done=()=>sendNotification([0,2,3,0,5,1,0]);
let completionTimer=null;
const write={async writeValue(value){
  const p=Uint8Array.from(value);
  if(p[0]===7)queueMicrotask(()=>sendNotification(new TextEncoder().encode('HEADERABCDEF123456CODE')));
  else if([8,1,2].includes(p[0]))queueMicrotask(()=>sendNotification([0]));
  else if(p[0]===128&&p[3]===1){clearTimeout(completionTimer);completionTimer=null;setTimeout(done,0);}
  else if(p[0]===129){
    const view=new DataView(p.buffer);let duration=0,balls=0,interval=1000;
    for(let offset=7;offset+24<=p.length;offset+=24){interval=1000/view.getFloat32(offset+16,true);const reps=view.getUint32(offset+20,true);duration+=interval*reps;balls+=reps;}
    duration*=p[4];balls*=p[4];
    document.querySelector('#mock-packets').textContent=`Program requested ${balls} balls`;
    // DONE may legitimately precede N full intervals: the first ball can fire at t=0.
    completionTimer=setTimeout(()=>{completionTimer=null;done();},Math.max(100,duration-interval+100));
  }
}};
const device=new EventTarget();
device.gatt={connected:false,async connect(){this.connected=true;return{getPrimaryService:async()=>({getCharacteristic:async uuid=>uuid.endsWith('ff01')?write:notify})};},disconnect(){this.connected=false;clearTimeout(completionTimer);device.dispatchEvent(new Event('gattserverdisconnected'));}};
Object.defineProperty(navigator,'bluetooth',{configurable:true,value:{requestDevice:async()=>device}});
await import('../src/app/bootstrap.js');
