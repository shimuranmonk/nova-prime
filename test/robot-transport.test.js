import assert from "node:assert/strict";
import test from "node:test";
import { NovaRobotConnection } from "../src/application/robot/nova-robot-connection.js";
import { RobotExecutor } from "../src/application/robot/robot-executor.js";
import { NOVA_BLE_PROFILE, NOVA_PACKETS } from "../src/infrastructure/robot/nova-protocol.js";
import { WebBluetoothTransport } from "../src/infrastructure/robot/web-bluetooth-transport.js";

const waitTurn = () => new Promise((resolve) => setTimeout(resolve, 0));

class FakeCharacteristic {
  constructor() { this.writes = []; this.listeners = new Map(); }
  async writeValue(bytes) { this.writes.push(Uint8Array.from(bytes)); }
  async startNotifications() { this.notificationsStarted = true; return this; }
  addEventListener(name, listener) { this.listeners.set(name, listener); }
  notify(bytes) {
    const value = new DataView(Uint8Array.from(bytes).buffer);
    this.listeners.get("characteristicvaluechanged")?.({ target: { value } });
  }
}

test("Web Bluetooth transport requests the verified profile and serializes writes", async () => {
  const write = new FakeCharacteristic();
  const notify = new FakeCharacteristic();
  const service = { getCharacteristic: async (uuid) => uuid === NOVA_BLE_PROFILE.writeUuid ? write : notify };
  const deviceListeners = new Map();
  const device = {
    gatt: { connected: true, connect: async () => ({ getPrimaryService: async (uuid) => { assert.equal(uuid, NOVA_BLE_PROFILE.serviceUuid); return service; } }), disconnect() { this.connected = false; } },
    addEventListener: (name, listener) => deviceListeners.set(name, listener),
    removeEventListener: (name) => deviceListeners.delete(name),
  };
  let requestOptions;
  const transport = new WebBluetoothTransport({ bluetooth: { requestDevice: async (options) => { requestOptions = options; return device; } } });
  const notifications = [];
  await transport.connect({ onNotification: (bytes) => notifications.push([...bytes]) });
  assert.deepEqual(requestOptions.filters, [{ services: [NOVA_BLE_PROFILE.advertisedService] }]);
  assert.equal(notify.notificationsStarted, true);
  await Promise.all([transport.write([1]), transport.write([2])]);
  assert.deepEqual(write.writes.map((bytes) => [...bytes]), [[1], [2]]);
  notify.notify([3, 4]);
  assert.deepEqual(notifications, [[3, 4]]);
  transport.disconnect();
  assert.equal(transport.connected, false);
});

class FakeTransport {
  constructor() { this.supported = true; this.writes = []; this.disconnected = false; }
  async connect(callbacks) { this.callbacks = callbacks; }
  async write(bytes) { this.writes.push(Uint8Array.from(bytes)); }
  disconnect() { this.disconnected = true; }
  notify(value) { this.callbacks.onNotification(Uint8Array.from(value)); }
}

test("robot connection completes the four-stage authenticated handshake", async () => {
  const transport = new FakeTransport();
  const connection = new NovaRobotConnection({ transport, digest: () => "b".repeat(32), handshakeTimeoutMs: 100 });
  const connected = connection.connect();
  await waitTurn();
  transport.notify(new TextEncoder().encode("HEADERABCDEF123456CODE"));
  await waitTurn();
  transport.notify([0]);
  await waitTurn();
  transport.notify([0]);
  await waitTurn();
  transport.notify([0]);
  await connected;
  assert.equal(connection.ready, true);
  assert.deepEqual([...transport.writes[0]], NOVA_PACKETS.handshakeStart);
  assert.deepEqual([...transport.writes.at(-3)], NOVA_PACKETS.authOne);
  assert.deepEqual([...transport.writes.at(-2)], NOVA_PACKETS.authTwo);
  assert.deepEqual([...transport.writes.at(-1)], NOVA_PACKETS.ready);
});

test("canceling the browser device chooser returns to disconnected and allows retry", async () => {
  const transport = new FakeTransport();
  let attempts = 0;
  transport.connect = async () => {
    attempts += 1;
    throw new DOMException("User canceled device selection", "NotFoundError");
  };
  const connection = new NovaRobotConnection({ transport });

  await assert.rejects(() => connection.connect(), { name: "NotFoundError" });
  assert.equal(connection.state, "disconnected");
  assert.equal(transport.disconnected, true);
  await assert.rejects(() => connection.connect(), { name: "NotFoundError" });
  assert.equal(attempts, 2);
  assert.equal(connection.state, "disconnected");
});

test("robot connection times out safely and disconnects", async () => {
  const transport = new FakeTransport();
  const connection = new NovaRobotConnection({ transport, handshakeTimeoutMs: 5 });
  await assert.rejects(() => connection.connect(), /HANDSHAKE_TIMEOUT/);
  assert.equal(connection.state, "error");
  assert.equal(transport.disconnected, true);
});

test("robot connection rejects an invalid challenge and disconnects", async () => {
  const transport = new FakeTransport();
  const connection = new NovaRobotConnection({ transport, handshakeTimeoutMs: 100 });
  const connected = connection.connect();
  await waitTurn();
  transport.notify([1, 2, 3]);
  await assert.rejects(() => connected, /CHALLENGE_INVALID/);
  assert.equal(connection.state, "error");
  assert.equal(transport.disconnected, true);
});

test("executor cancels stale queued work and makes Stop the next write", async () => {
  let release;
  const firstWrite = new Promise((resolve) => { release = resolve; });
  const writes = [];
  let call = 0;
  const connection = {
    ready: true,
    write: async (bytes) => { writes.push([...bytes]); call += 1; if (call === 1) await firstWrite; },
  };
  const executor = new RobotExecutor({ connection });
  const first = executor.start([0x81, 1]);
  await waitTurn();
  const stale = executor.enqueue([0x81, 2]);
  const stopped = executor.stop();
  release();
  assert.equal((await first).status, "CANCELLED");
  assert.equal((await stale).status, "CANCELLED");
  assert.equal((await stopped).status, "SENT");
  assert.deepEqual(writes, [[0x81, 1], NOVA_PACKETS.stop]);
  assert.equal(executor.state, "stopped");
});

test("executor retries only the idempotent Stop packet", async () => {
  let attempts = 0;
  const connection = { ready: true, write: async (bytes) => { if (bytes[0] === 0x80 && attempts++ === 0) throw new Error("temporary"); } };
  const executor = new RobotExecutor({ connection, stopAttempts: 2 });
  await executor.start([0x81]);
  const result = await executor.stop();
  assert.equal(result.attempts, 2);
  assert.equal(executor.state, "stopped");
});

test("executor can send an explicit priority Stop while connected but idle", async () => {
  const writes = [];
  const executor = new RobotExecutor({ connection: { ready: true, async write(bytes) { writes.push([...bytes]); } } });
  const result = await executor.stop({ force: true });
  assert.equal(result.status, "SENT");
  assert.deepEqual(writes, [NOVA_PACKETS.stop]);
  assert.equal(executor.state, "stopped");
});

test('queued transport writes cannot cross a disconnect/reconnect boundary',async()=>{
  let release; const hold=new Promise(r=>{release=r;}); const sent=[];let serial=0;
  const transport=new WebBluetoothTransport({bluetooth:{requestDevice:async()=>{
    const id=++serial;
    const characteristic={addEventListener(){},startNotifications:async()=>{},async writeValue(bytes){sent.push({id,bytes:[...bytes]});if(id===1)await hold;}};
    return {gatt:{connected:false,async connect(){this.connected=true;return{getPrimaryService:async()=>({getCharacteristic:async()=>characteristic})};},disconnect(){this.connected=false;}},addEventListener(){},removeEventListener(){}};
  }}});
  await transport.connect();const first=transport.write([129,1]);await waitTurn();
  const queued=transport.write([129,2]);
  const rejectedFirst=assert.rejects(first,/STALE_WRITE/), rejectedQueued=assert.rejects(queued,/STALE_WRITE/);
  transport.disconnect();await transport.connect();release();await Promise.all([rejectedFirst,rejectedQueued]);
  assert.deepEqual(sent,[{id:1,bytes:[129,1]}]);
  await transport.write([128,1,0,1]);assert.equal(sent.at(-1).id,2);
});

test('executor refuses Start while priority Stop is unfinished',async()=>{
  let release;const hold=new Promise(r=>{release=r;});const sent=[];
  const executor=new RobotExecutor({connection:{ready:true,async write(packet){sent.push([...packet]);if(packet[0]===128)await hold;}}});
  const stopping=executor.stop({force:true});await waitTurn();
  await assert.rejects(()=>executor.start([129,1]),/EXECUTOR_BUSY/);
  release();await stopping;assert.equal(executor.state,'stopped');
  assert.deepEqual(sent,[NOVA_PACKETS.stop]);
  await executor.start([129,2]);assert.equal(executor.state,'running');
});

test('failed Stop retries disconnect and do not claim the robot stopped',async()=>{
  let disconnected=false;let attempts=0;
  const executor=new RobotExecutor({connection:{ready:true,async write(){attempts++;throw Error('write failed');},disconnect(){disconnected=true;}}});
  await assert.rejects(()=>executor.stop({force:true}),/write failed/);
  assert.equal(attempts,2);assert.equal(disconnected,true);assert.equal(executor.state,'error');
});
