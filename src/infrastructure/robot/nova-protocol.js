import { md5Hex } from "./md5.js";
import { isServeBall } from "../../domain/drills/schema.js";

export const NOVA_PROTOCOL_SOURCE = Object.freeze({
  repository: "olanga/nova",
  commit: "913f044d664b81dcb77c9e9d6e9ae5b33103f3ca",
  files: Object.freeze(["js/constants.js", "js/bluetooth.js", "js/runner.js"]),
  communityReference: "olanga/nova Wiki: General information",
  trainerRepository: "shimuranmonk/nova-advance",
  trainerCommit: "1877ea6ca37944313758d6744b817719298dc9c7",
  trainerFiles: Object.freeze(["js/model/ball.js", "js/core/protocol.js", "js/run/session.js", "js/ui/editor.js"]),
});

export const NOVA_BLE_PROFILE = Object.freeze({
  advertisedService: 0xfeff,
  serviceUuid: "02f00000-0000-0000-0000-00000000fe00",
  notifyUuid: "02f00000-0000-0000-0000-00000000ff02",
  writeUuid: "02f00000-0000-0000-0000-00000000ff01",
});

export const NOVA_PACKETS = Object.freeze({
  handshakeStart: Object.freeze([0x07, 0x00, 0x00, 0x00]),
  authOne: Object.freeze([0x01, 0x00, 0x00]),
  authTwo: Object.freeze([0x02, 0x00, 0x00]),
  ready: Object.freeze([0x80, 0x01, 0x00, 0x00]),
  stop: Object.freeze([0x80, 0x01, 0x00, 0x01]),
  doneHex: "00020300050100",
});

const HANDSHAKE_SALT = "Mjgx1jAwXDBaMFcxCz3JBgNVBAYT4kJF7Rkw";
const MODE_BYTES = Object.freeze({ time: 0x00, combos: 0x01, endless: 0x03, calibration: 0x03 });

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, Number(value)));

export function bytesToHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function containsDoneSignal(bytes) {
  return bytesToHex(bytes).includes(NOVA_PACKETS.doneHex);
}

export function createAuthResponse(challengeBytes, digest = md5Hex) {
  const challenge = new TextDecoder().decode(challengeBytes);
  if (challenge.length <= 18) throw new Error("NOVA_HANDSHAKE_CHALLENGE_INVALID");
  const serial = challenge.slice(6, 18);
  const code = challenge.slice(18);
  let material = serial;
  for (const character of serial) material += HANDSHAKE_SALT[character.charCodeAt(0) % 0x24];
  const hash = digest(material + code);
  if (!/^[0-9a-f]{32}$/i.test(hash)) throw new Error("NOVA_HANDSHAKE_DIGEST_INVALID");
  const response = new Uint8Array(3 + hash.length);
  response.set([0x08, 0x20, 0x00]);
  response.set(new TextEncoder().encode(hash.toLowerCase()), 3);
  return response;
}

export function encodeBall(ball) {
  const speed = clamp(ball.speed, 0, 10);
  const signedSpin = clamp(ball.spin, 0, 10) * (ball.type === "back" ? -1 : 1);
  const topRpm = clamp(Math.round(970 + 630.5 * speed + 342 * signedSpin), 400, 7500);
  const bottomRpm = clamp(Math.round(970 + 630.5 * speed - 342 * signedSpin), 400, 7500);
  const height = (clamp(ball.height, -50, 100) + 50) / 150 * 50 - 20;
  const drop = (clamp(ball.drop, -10, 10) + 10) / 20 * 44 - 22;
  const frequency = clamp(ball.bpm, 30, 90) / 60;
  const repetitions = Math.max(1, Math.floor(clamp(ball.repetitions, 1, 100)));
  const buffer = new ArrayBuffer(24);
  const view = new DataView(buffer);
  view.setUint32(0, topRpm, true);
  view.setUint32(4, bottomRpm, true);
  view.setFloat32(8, height, true);
  view.setFloat32(12, drop, true);
  view.setFloat32(16, frequency, true);
  view.setUint32(20, repetitions, true);
  return new Uint8Array(buffer);
}

export function selectProgramBalls(program, { random = Math.random, randomOrder = false } = {}) {
  if (!program?.steps?.length) throw new Error("NOVA_PROGRAM_EMPTY");
  const balls = program.steps.filter((step) => step.enabled).map((step) => {
    if (!step.variants?.length) throw new Error("NOVA_STEP_VARIANTS_EMPTY");
    const index = Math.min(step.variants.length - 1, Math.floor(random() * step.variants.length));
    const selected = { ...step.variants[index] };
    if (step.scatter > 0) {
      const slots = Math.floor((step.scatter * 2) / 0.5);
      selected.drop = clamp(selected.drop - step.scatter + Math.floor(random() * (slots + 1)) * 0.5, -10, 10);
    }
    return selected;
  });
  if (!randomOrder) return balls;
  const movableIndexes = balls.map((ball, index) => isServeBall(ball) ? -1 : index).filter((index) => index >= 0);
  const shuffled = movableIndexes.map((index) => balls[index]);
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  const ordered = [...balls];
  movableIndexes.forEach((position, index) => { ordered[position] = shuffled[index]; });
  return ordered;
}

export function encodeDrillPacket(program, { mode = "combos", amount = 1, mirror = false, randomOrder = false, random = Math.random } = {}) {
  if (!(mode in MODE_BYTES)) throw new Error("NOVA_MODE_INVALID");
  const selected = selectProgramBalls(program, { random, randomOrder });
  const balls = selected.map(encodeBall);
  if (!balls.length || balls.length > 20) throw new Error("NOVA_BALL_COUNT_INVALID");
  const packet = new Uint8Array(7 + balls.length * 24);
  const view = new DataView(packet.buffer);
  view.setUint8(0, 0x81);
  view.setUint16(1, 4 + balls.length * 24, true);
  view.setUint8(3, MODE_BYTES[mode]);
  view.setUint8(4, Math.floor(clamp(amount, 0, 255)));
  view.setUint8(5, mirror ? 1 : 0);
  view.setUint8(6, randomOrder && !selected.some(isServeBall) ? 1 : 0);
  balls.forEach((ball, index) => packet.set(ball, 7 + index * 24));
  return packet;
}
