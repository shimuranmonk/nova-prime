import test from 'node:test';
import assert from 'node:assert/strict';
import {MSYNC_SESSION_STATE,MsyncSessionController} from '../src/application/msync/nova-plus/session.js';
class FakeAudio {
    constructor() {
        this.position = 0;
        this.playing = false;
        this.onEnded = null;
        this.onError = null;
    }
    async play() { this.playing = true; return true; }
    pause() { this.playing = false; }
    stop() { this.playing = false; this.position = 0; }
    currentTimeMs() { return this.position; }
    destroy() {}
}

function timeline(countdown = 0) {
    return {
        session: { countdown, cyclePause: 1 },
        audio: { durationMs: 2000 },
        cues: [
            { timeMs: 0, type: 'INLINE', name: 'INL_ONE' },
            { timeMs: 100, type: 'FLAVOR', name: 'FLV_FAST' },
            { timeMs: 200, type: 'REST', durationMs: 500 },
            { timeMs: 300, type: 'DRILL', name: 'DRL_TWO' },
            { timeMs: 1000, type: 'STOP' }
        ]
    };
}

test('simulates cue order, flavor clearing, REST, and STOP without robot hooks', async () => {
    const audio = new FakeAudio();
    const events = [];
    const states = [];
    const controller = new MsyncSessionController({
        audio,
        setTimer: () => 1,
        clearTimer: () => {},
        onEvent: value => events.push(value),
        onState: value => states.push(value.state)
    });

    await controller.start(timeline());
    assert.equal(controller.state, MSYNC_SESSION_STATE.PLAYING);
    assert.deepEqual(controller.active, { type: 'INLINE', name: 'INL_ONE' });

    controller.processPosition(100);
    assert.equal(controller.flavor, 'FLV_FAST');
    controller.processPosition(200);
    assert.equal(controller.restUntilMs, 700);
    controller.processPosition(300);
    assert.deepEqual(controller.active, { type: 'DRILL', name: 'DRL_TWO' });
    assert.equal(controller.flavor, null);
    assert.equal(controller.restUntilMs, 700);
    controller.processPosition(700);
    assert.equal(controller.restUntilMs, null);
    controller.processPosition(1000);

    assert.equal(controller.state, MSYNC_SESSION_STATE.COMPLETED);
    assert.deepEqual(events.map(value => value.type), [
        'ACTIVATE', 'FLAVOR', 'REST_START', 'ACTIVATE', 'REST_END', 'COMPLETE'
    ]);
    assert.ok(states.includes(MSYNC_SESSION_STATE.PLAYING));
    assert.equal(Object.hasOwn(controller, 'robot'), false);
});

test('pause and resume preserve processed cues and remaining REST timeline', async () => {
    const audio = new FakeAudio();
    const events = [];
    const controller = new MsyncSessionController({
        audio,
        setTimer: () => 1,
        clearTimer: () => {},
        onEvent: value => events.push(value)
    });
    await controller.start(timeline());
    controller.processPosition(200);
    audio.position = 250;
    assert.equal(controller.pause(), true);
    const cueIndex = controller.cueIndex;
    controller.processPosition(900);
    assert.equal(controller.cueIndex, cueIndex);
    assert.equal(controller.restUntilMs, 700);
    assert.equal(await controller.resume(), true);
    controller.processPosition(700);
    assert.equal(events.filter(value => value.type === 'REST_END').length, 1);
    assert.equal(events.filter(value => value.type === 'ACTIVATE').length, 2);
});

test('countdown precedes playback and consumes no audio timeline', async () => {
    const audio = new FakeAudio();
    const timers = [];
    const events = [];
    const controller = new MsyncSessionController({
        audio,
        setTimer: (callback, delay) => {
            timers.push({ callback, delay });
            return timers.length;
        },
        clearTimer: () => {},
        onEvent: value => events.push(value)
    });
    await controller.start(timeline(4));

    assert.equal(controller.state, MSYNC_SESSION_STATE.COUNTDOWN);
    assert.equal(audio.playing, false);
    const playbackTimer = timers.find(value => value.delay === 4000);
    assert.ok(playbackTimer);
    assert.equal(events[0].type, 'COUNTDOWN');
    await playbackTimer.callback();
    assert.equal(controller.state, MSYNC_SESSION_STATE.PLAYING);
    assert.equal(events[1].positionMs, 0);
});

test('countdown pre-roll leads an opening cue before audio starts', async () => {
    const audio = new FakeAudio();
    const timers = [];
    const robotEvents = [];
    const controller = new MsyncSessionController({
        audio,
        setTimer: (callback, delay) => {
            timers.push({ callback, delay });
            return timers.length;
        },
        clearTimer: () => {},
        onRobotEvent: value => robotEvents.push(value)
    });
    const parsed = timeline(4);
    parsed.session.robotLead = 1.3;
    await controller.start(parsed);

    const preRoll = timers.find(value => value.delay === 2700);
    assert.ok(preRoll);
    preRoll.callback();
    assert.equal(audio.playing, false);
    assert.equal(robotEvents[0].type, 'ACTIVATE');
    assert.equal(robotEvents[0].positionMs, 0);
});

test('robot events lead written cues while logical events stay on the audio clock', async () => {
    const audio = new FakeAudio();
    const logicalEvents = [];
    const robotEvents = [];
    const parsed = {
        session: { countdown: 0, cyclePause: 1, robotLead: 1.3 },
        audio: { durationMs: 10000 },
        cues: [
            { timeMs: 5000, type: 'DRILL', name: 'DRL_ONE' },
            { timeMs: 7000, type: 'REST', durationMs: 2000 },
            { timeMs: 10000, type: 'STOP' }
        ]
    };
    const controller = new MsyncSessionController({
        audio,
        setTimer: () => 1,
        clearTimer: () => {},
        onEvent: value => logicalEvents.push(value),
        onRobotEvent: value => robotEvents.push(value)
    });
    await controller.start(parsed);

    controller.processPosition(3699);
    assert.equal(robotEvents.length, 0);
    controller.processPosition(3700);
    assert.equal(robotEvents[0].type, 'ACTIVATE');
    assert.equal(robotEvents[0].positionMs, 5000);
    assert.equal(robotEvents[0].commandPositionMs, 3700);
    assert.equal(logicalEvents.length, 0);

    controller.processPosition(5000);
    assert.equal(logicalEvents[0].type, 'ACTIVATE');
    controller.processPosition(5700);
    assert.equal(robotEvents[1].type, 'REST_START');
    controller.processPosition(7700);
    assert.equal(robotEvents[2].type, 'REST_END');
    controller.processPosition(8700);
    assert.equal(robotEvents[3].type, 'COMPLETE');
    assert.equal(controller.state, MSYNC_SESSION_STATE.PLAYING);
});

test('IDLE clears the active drill without ending audio or the session', async () => {
    const audio = new FakeAudio();
    const logicalEvents = [];
    const robotEvents = [];
    const parsed = {
        session: { countdown: 0, cyclePause: 1, robotLead: 1.3 },
        audio: { durationMs: 10000 },
        cues: [
            { timeMs: 2000, type: 'INLINE', name: 'INL_ONE' },
            { timeMs: 5000, type: 'IDLE' },
            { timeMs: 8000, type: 'INLINE', name: 'INL_ONE' }
        ]
    };
    const controller = new MsyncSessionController({
        audio,
        setTimer: () => 1,
        clearTimer: () => {},
        onEvent: value => logicalEvents.push(value),
        onRobotEvent: value => robotEvents.push(value)
    });
    await controller.start(parsed);
    controller.processPosition(3700);
    assert.equal(robotEvents.at(-1).type, 'IDLE');
    assert.equal(controller.state, MSYNC_SESSION_STATE.PLAYING);
    controller.processPosition(5000);
    assert.equal(logicalEvents.at(-1).type, 'IDLE');
    assert.equal(controller.active, null);
    assert.equal(audio.playing, true);
    controller.processPosition(8000);
    assert.deepEqual(controller.active, { type: 'INLINE', name: 'INL_ONE' });
});

test('natural audio completion and playback errors clean all runtime state', async () => {
    const audio = new FakeAudio();
    const controller = new MsyncSessionController({
        audio,
        setTimer: () => 1,
        clearTimer: () => {}
    });
    await controller.start(timeline());
    audio.onEnded();
    assert.equal(controller.state, MSYNC_SESSION_STATE.COMPLETED);
    assert.equal(controller.active, null);
    assert.equal(controller.restUntilMs, null);
    audio.onEnded();
    assert.equal(controller.state, MSYNC_SESSION_STATE.COMPLETED);

    await controller.start(timeline());
    audio.onError(new Error('simulated failure'));
    assert.equal(controller.state, MSYNC_SESSION_STATE.ERROR);
    assert.equal(controller.active, null);
});

test('Stop while audio resume is pending prevents a late resume', async () => {
    const audio = new FakeAudio();
    const controller = new MsyncSessionController({audio, setTimer: () => 1, clearTimer: () => {}});
    await controller.start(timeline());
    controller.pause();
    let release;
    audio.play = () => new Promise(resolve => { release = resolve; });
    const pending = controller.resume();
    controller.stop();
    release(true);
    assert.equal(await pending, false);
    assert.equal(controller.state, MSYNC_SESSION_STATE.COMPLETED);
});
