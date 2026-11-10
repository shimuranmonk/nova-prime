import assert from "node:assert/strict";
import test from "node:test";
import { md5Hex } from "../src/infrastructure/robot/md5.js";
import { bytesToHex, containsDoneSignal, createAuthResponse, encodeBall, encodeDrillPacket, NOVA_PACKETS } from "../src/infrastructure/robot/nova-protocol.js";

test("MD5 matches RFC vectors required by the robot handshake", () => {
  assert.equal(md5Hex(""), "d41d8cd98f00b204e9800998ecf8427e");
  assert.equal(md5Hex("abc"), "900150983cd24fb0d6963f7d28e17f72");
  assert.equal(md5Hex("message digest"), "f96b697d7cb7938d525a2f31aaf161d0");
});

test("auth response extracts the robot serial and emits the verified wire shape", () => {
  let material = "";
  const response = createAuthResponse(new TextEncoder().encode("HEADERABCDEF123456CODE"), (value) => {
    material = value;
    return "a".repeat(32);
  });
  assert.equal(material.startsWith("ABCDEF123456"), true);
  assert.equal(material.endsWith("CODE"), true);
  assert.deepEqual([...response.slice(0, 3)], [0x08, 0x20, 0x00]);
  assert.equal(new TextDecoder().decode(response.slice(3)), "a".repeat(32));
  assert.throws(() => createAuthResponse(new Uint8Array([1, 2, 3])), /CHALLENGE_INVALID/);
});

test("canonical backspin ball converts to verified motor and payload values", () => {
  const packet = encodeBall({ speed: 2, spin: 2, type: "back", height: 50, drop: -5, bpm: 36, repetitions: 1 });
  const view = new DataView(packet.buffer);
  assert.equal(view.getUint32(0, true), 1547);
  assert.equal(view.getUint32(4, true), 2915);
  assert.equal(view.getUint32(20, true), 1);
  assert.equal(packet.length, 24);
});

test("drill packet has the seven-byte header and bounded ball payload", () => {
  const program = { steps: [{ enabled: true, scatter: 0, variants: [{ speed: 3, spin: 2, type: "top", height: 50, drop: 5, bpm: 54, repetitions: 2 }] }] };
  const packet = encodeDrillPacket(program, { mode: "combos", amount: 10, mirror: true, randomOrder: true, random: () => 0 });
  const view = new DataView(packet.buffer);
  assert.equal(packet.length, 31);
  assert.equal(packet[0], 0x81);
  assert.equal(view.getUint16(1, true), 28);
  assert.deepEqual([...packet.slice(3, 7)], [0x01, 10, 1, 1]);
});

test("done notification detection tolerates framed bytes", () => {
  const framed = Uint8Array.from([9, 9, ...NOVA_PACKETS.doneHex.match(/../g).map((value) => Number.parseInt(value, 16)), 8]);
  assert.equal(containsDoneSignal(framed), true);
  assert.equal(bytesToHex(Uint8Array.from([0, 15, 255])), "000fff");
});
