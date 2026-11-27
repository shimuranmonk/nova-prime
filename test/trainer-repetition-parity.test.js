import test from "node:test";
import assert from "node:assert/strict";
import { encodeBall } from "../src/infrastructure/robot/nova-protocol.js";
import { fixture, flush } from "../test-support/live-runtime-fixture.js";

const ball = (drop, overrides = {}) => ({
  speed: 2, spin: 1, type: "top", height: 35, drop, bpm: 60, repetitions: 1, ...overrides,
});
const step = (variants, scatter = 0) => ({ enabled: true, variants, scatter });
const bytes = (...balls) => balls.flatMap(value => [...encodeBall(value)]);

function setup(mode, { randomOrder = false, amount = 2, pause = 0, draws = [] } = {}) {
  const f = fixture(mode, {
    random: () => {
      assert.ok(draws.length, "unexpected random draw");
      return draws.shift();
    },
  });
  globalThis.FormData = class {
    get(key) { return String(key === "amount" ? amount : pause); }
  };
  f.bridge.randomOrderFor = () => randomOrder;
  return f;
}

for (const mode of ["reps", "time"]) {
  test(`${mode} draws order, variants and Scatter anew with fixed Serve positions`, async () => {
    const draws = [0, 0, 0, 0, 0, 0, 0.99, 0.99, 0.99, 0.99, 0, 0];
    const f = setup(mode, { randomOrder: true, amount: mode === "reps" ? 2 : 8, pause: 1, draws });
    const serve = ball(0, { height: -30 });
    f.bridge.programForDrill = () => ({
      steps: [step([ball(-5), ball(-3, { repetitions: 2 })], 1), step([serve]), step([ball(4)], 1)],
    });
    let recordedBalls = 0;
    f.bridge.recordCompletedBalls = async count => { recordedBalls += count; };
    await f.connect();
    await f.start();
    const first = f.programs()[0].p;
    assert.deepEqual(first.slice(3, 7), [1, 1, 0, 0]);
    assert.deepEqual(first.slice(7), bytes(ball(3), serve, ball(-6)));
    f.controller.tick(2);
    assert.equal(f.controller.snapshot().completedCycles, 0);
    await f.c.advance(2000);
    await f.done();
    await f.done();
    assert.equal(f.controller.snapshot().completedCycles, 1);
    await f.c.advance(999);
    assert.equal(f.programs().length, 1);
    await f.c.advance(1);
    const second = f.programs()[1].p;
    assert.deepEqual(second.slice(3, 7), [1, 1, 0, 0]);
    assert.deepEqual(second.slice(7), bytes(ball(-2, { repetitions: 2 }), serve, ball(3)));
    await f.c.advance(4000);
    await f.done();
    assert.equal(f.controller.snapshot().completedCycles, 2);
    if (mode === "time") await f.c.advance(1000);
    assert.equal(f.controller.state, "COMPLETED");
    assert.equal(f.programs().length, 2);
    assert.equal(f.stops().length, 1);
    assert.equal(recordedBalls, 7);
    assert.deepEqual(draws, []);
  });

  test(`${mode} preserves batched deterministic packets and ignores inactive randomness`, async () => {
    const f = setup(mode, { amount: 5 });
    f.bridge.programForDrill = () => ({ steps: [
      step([ball(2)]), { ...step([ball(1), ball(2)], 2), enabled: false },
    ] });
    await f.connect();
    await f.start();
    assert.deepEqual(f.programs()[0].p.slice(3, 7), [mode === "time" ? 0 : 1, 5, 0, 0]);
    await f.done();
    if (mode === "time") await f.c.advance(5000);
    assert.equal(f.controller.state, "COMPLETED");
    assert.equal(f.programs().length, 1);
  });
}

test("Sequential redraws variants and Scatter while retaining order, including across Pause and Resume", async () => {
  const draws = [0, 0, 0, 0.99, 0.99, 0];
  const f = setup("reps", { draws });
  f.bridge.programForDrill = () => ({ steps: [step([ball(-2), ball(2)], 1), step([ball(6)])] });
  await f.connect();
  await f.start();
  const first = f.programs()[0].p;
  assert.deepEqual(first.slice(7), bytes(ball(-3), ball(6)));
  await f.command("pause");
  await f.done();
  await f.c.advance(10000);
  assert.equal(f.controller.state, "PAUSED");
  assert.equal(f.controller.snapshot().completedCycles, 0);
  assert.equal(f.programs().length, 1);
  await f.command("resume");
  assert.deepEqual(f.programs()[1].p, first);
  await f.done();
  await f.c.advance(0);
  assert.deepEqual(f.programs()[2].p.slice(7), bytes(ball(3), ball(6)));
  await f.done();
  assert.equal(f.controller.state, "COMPLETED");
  assert.deepEqual(draws, []);
});

test("Stop cancels an armed inter-repetition delay", async () => {
  const f = setup("reps", { pause: 3, draws: [0, 0] });
  f.bridge.programForDrill = () => ({ steps: [step([ball(0)], 1)] });
  await f.connect();
  await f.start();
  await f.done();
  await f.command("stop");
  await f.c.advance(10000);
  await f.done();
  assert.equal(f.controller.state, "IDLE");
  assert.equal(f.programs().length, 1);
  assert.equal(f.stops().length, 1);
});

test("Time expires during an unfinished repetition after excluding paused time", async () => {
  const f = setup("time", { amount: 3, draws: [0, 0] });
  f.bridge.programForDrill = () => ({ steps: [step([ball(0)], 1)] });
  await f.connect();
  await f.start();
  await f.c.advance(1250);
  await f.command("pause");
  await f.c.advance(10000);
  await f.command("resume");
  await f.c.advance(1749);
  assert.equal(f.controller.state, "RUNNING");
  await f.c.advance(1);
  await f.done();
  assert.equal(f.controller.state, "COMPLETED");
  assert.equal(f.controller.snapshot().completedCycles, 0);
  assert.equal(f.programs().length, 2);
  assert.equal(f.stops().length, 2);
});

test("Missing DONE fails closed without launching a second randomized repetition", async () => {
  const f = setup("reps", { draws: [0, 0] });
  f.bridge.programForDrill = () => ({ steps: [step([ball(0)], 1)] });
  await f.connect();
  await f.start();
  await f.c.advance(6000);
  await f.done();
  assert.equal(f.controller.state, "ERROR");
  assert.match(f.panel.fields["#full-test-status"].textContent, /COMPLETION_TIMEOUT/);
  assert.equal(f.programs().length, 1);
  assert.equal(f.stops().length, 1);
});

test("Stop during a delayed randomized write cancels the repetition chain", async () => {
  const f = setup("reps", { draws: [0, 0, 0, 0] });
  f.bridge.programForDrill = () => ({ steps: [step([ball(0)], 1)] });
  await f.connect();
  await f.start();
  let release;
  f.holdProgram(new Promise(resolve => { release = resolve; }));
  await f.done();
  await f.c.advance(0);
  const stopping = f.command("stop");
  await flush();
  await f.done();
  release();
  await stopping;
  await f.c.advance(10000);
  assert.equal(f.controller.state, "IDLE");
  assert.equal(f.programs().length, 2);
  assert.equal(f.stops().length, 1);
});

test("Random alone redraws order and disables the firmware shuffle even without a Serve", async () => {
  const f = setup("reps", { randomOrder: true, draws: [0, 0, 0, 0.99, 0, 0] });
  f.bridge.programForDrill = () => ({ steps: [step([ball(1)]), step([ball(2)])] });
  await f.connect();
  await f.start();
  await f.done();
  await f.c.advance(0);
  const [first, second] = f.programs().map(write => write.p);
  assert.equal(first[6], 0);
  assert.equal(second[6], 0);
  assert.deepEqual(first.slice(7), bytes(ball(2), ball(1)));
  assert.deepEqual(second.slice(7), bytes(ball(1), ball(2)));
  await f.done();
  assert.equal(f.controller.state, "COMPLETED");
});

test("A randomized continuation write failure requests Stop and fails the session", async () => {
  const f = setup("reps", { draws: [0, 0, 0, 0] });
  f.bridge.programForDrill = () => ({ steps: [step([ball(0)], 1)] });
  await f.connect();
  await f.start();
  f.failPrograms();
  await f.done();
  await f.c.advance(0);
  assert.equal(f.controller.state, "ERROR");
  assert.equal(f.controller.snapshot().completedCycles, 1);
  assert.equal(f.stops().length, 1);
  await f.c.advance(10000);
  assert.equal(f.programs().length, 2);
});

function seededRandom(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

for (const mode of ["reps", "time"]) {
  test(`${mode} ten-ball matrix keeps the Serve in slot 5`, async t => {
    const f = fixture(mode, { random: seededRandom(42) });
    globalThis.FormData = class {
      get(key) { return key === "amount" ? (mode === "reps" ? "5" : "55") : "1"; }
    };
    const ids = ["A", "B", "C", "D", "Serve", "E", "F", "G", "H", "I"];
    const playingSteps = ids.map(id => {
      if (id === "Serve") return step([ball(0, { speed: 2, spin: 0, height: -30 })]);
      const speed = id.charCodeAt(0) - 64;
      const drop = speed - 5;
      const base = ball(drop, { speed, spin: 0 });
      if (["B", "H"].includes(id)) return step([base, { ...base, drop: drop + 2 }]);
      return step([base], ["C", "G"].includes(id) ? 1 : 0);
    });
    f.bridge.programForDrill = () => ({ steps: playingSteps });
    f.bridge.randomOrderFor = () => true;
    await f.connect();
    await f.start();
    const matrix = [];
    for (let repetition = 0; repetition < 5; repetition += 1) {
      assert.equal(f.programs().length, repetition + 1);
      const { t: writeTime, p } = f.programs()[repetition];
      assert.equal(writeTime, repetition * 11000);
      assert.deepEqual(p.slice(3, 7), [1, 1, 0, 0]);
      const view = new DataView(Uint8Array.from(p).buffer);
      const row = [];
      for (let offset = 7; offset < p.length; offset += 24) {
        const height = view.getFloat32(offset + 8, true);
        const speed = Math.round((view.getUint32(offset, true) - 970) / 630.5);
        const drop = Math.round(view.getFloat32(offset + 12, true) / 2.2 * 2) / 2;
        const id = height < 0 ? "Serve" : String.fromCharCode(64 + speed);
        row.push(["B", "C", "G", "H"].includes(id) ? `${id}(${drop})` : id);
      }
      assert.equal(row[4], "Serve");
      assert.deepEqual(row.map(cell => cell.split("(")[0]).sort(), [...ids].sort());
      matrix.push(row.join(" "));
      await f.c.advance(10000);
      await f.done();
      if (repetition < 4 || mode === "time") await f.c.advance(1000);
    }
    assert.equal(f.controller.state, "COMPLETED");
    assert.equal(f.controller.snapshot().completedCycles, 5);
    assert.equal(f.programs().length, 5);
    assert.equal(f.stops().length, 1);
    assert.deepEqual(matrix, [
      "I D G(2) H(5) Serve F B(-3) E A C(-1)",
      "C(-3) F A G(3) Serve I H(5) D B(-1) E",
      "H(5) F E G(1) Serve C(-1) B(-1) A D I",
      "B(-1) E H(3) I Serve G(2.5) F A C(-2.5) D",
      "I B(-1) D A Serve C(-3) F E G(1) H(3)",
    ]);
    t.diagnostic(`${mode} matrix:\n${matrix.join("\n")}`);
  });
}
