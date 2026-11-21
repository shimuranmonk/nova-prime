function frozen(value) { return Object.freeze({ ...value }); }

function playbackErrorMessage(error, fallback) {
  if (error?.name === "NotSupportedError" || Number(error?.code) === 4) return "This audio format is not supported by this browser or device.";
  if (error?.name === "NotAllowedError") return "The browser blocked audio playback. Tap Start again to allow sound.";
  if (error?.name === "AbortError") return "Audio loading was interrupted before playback could start.";
  return error?.message || fallback;
}

export class AudioPlayer {
  #audio;
  #urlObject;
  #listeners = new Set();
  #queue = [];
  #index = 0;
  #completed = 0;
  #state = "idle";
  #currentUrl = null;
  #error = null;
  #generation = 0;
  #watchdog = null;
  #lastProgress = 0;
  #lastPosition = 0;

  constructor({ audio = new Audio(), urlObject = URL, now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout, stallTimeoutMs = 5000 } = {}) {
    this.#audio = audio;
    // Browser timer functions require Window as their receiver, not AudioPlayer.
    Object.assign(this, { now, setTimer: setTimer.bind(globalThis), clearTimer: clearTimer.bind(globalThis), stallTimeoutMs });
    this.#urlObject = urlObject;
    audio.addEventListener("timeupdate", () => this.#notify());
    audio.addEventListener("ended", () => { void this.#advance(); });
    audio.addEventListener("error", () => {
      if (["loading", "playing", "paused"].includes(this.#state)) {
        this.#setError(playbackErrorMessage(audio.error, "Audio playback failed. The file may be missing or unsupported."));
      }
    });
  }

  currentTimeMs() { return Math.round((Number(this.#audio.currentTime) || 0) * 1000); }

  snapshot() {
    const duration = Number(this.#audio.duration) || (this.#queue[this.#index]?.durationMs ?? 0) / 1000;
    const currentTime = Number(this.#audio.currentTime) || 0;
    const fraction = duration > 0 ? Math.min(1, currentTime / duration) : 0;
    const progress = this.#queue.length ? Math.min(1, (this.#completed + fraction) / this.#queue.length) : 0;
    return frozen({
      state: this.#state,
      trackIndex: this.#index,
      trackCount: this.#queue.length,
      completedTracks: this.#completed,
      currentTrack: this.#queue[this.#index] ?? null,
      currentTime,
      duration,
      progress,
      error: this.#error,
    });
  }

  subscribe(listener) {
    this.#listeners.add(listener);
    listener(this.snapshot());
    return () => this.#listeners.delete(listener);
  }

  async start(tracks) {
    const queue = [...(tracks ?? [])];
    if (queue.length === 0) throw new Error("No playable tracks were selected");
    if (queue.some((track) => !track?.audioBlob)) throw new Error("Selected audio is missing from local storage");
    this.stop();
    this.#queue = queue;
    this.#index = 0;
    this.#completed = 0;
    this.#error = null;
    await this.#playCurrent();
    return this.snapshot();
  }

  pause() {
    if (this.#state !== "playing") return false;
    this.#cancelWatchdog();
    this.#audio.pause();
    this.#state = "paused";
    this.#notify();
    return true;
  }

  async resume() {
    if (this.#state !== "paused") return false;
    const generation = this.#generation;
    this.#state = "loading";
    this.#armWatchdog();
    try {
      await this.#audio.play();
      if (generation !== this.#generation) return false;
      this.#state = "playing";
      this.#notify();
      return true;
    } catch (error) {
      if (generation !== this.#generation) return false;
      this.#setError(playbackErrorMessage(error, "Audio playback could not resume"));
      return false;
    }
  }

  stop() {
    this.#generation += 1;
    this.#cancelWatchdog();
    this.#audio.pause();
    this.#audio.removeAttribute?.("src");
    this.#audio.load?.();
    this.#releaseUrl();
    this.#queue = [];
    this.#index = 0;
    this.#completed = 0;
    this.#state = "idle";
    this.#error = null;
    this.#notify();
  }

  async #playCurrent() {
    const generation = this.#generation;
    this.#releaseUrl();
    const track = this.#queue[this.#index];
    if (!track?.audioBlob) return this.#setError("The next audio file is missing from local storage");
    this.#state = "loading";
    this.#armWatchdog();
    this.#notify();
    try {
      this.#currentUrl = this.#urlObject.createObjectURL(track.audioBlob);
      this.#audio.src = this.#currentUrl;
      this.#audio.load?.();
      await this.#audio.play();
      if (generation !== this.#generation) return;
      this.#state = "playing";
      this.#notify();
    } catch (error) {
      if (generation !== this.#generation) return;
      this.#setError(playbackErrorMessage(error, "Audio playback could not start"));
      throw error;
    }
  }

  async #advance() {
    if (this.#state !== "playing") return;
    this.#completed += 1;
    if (this.#completed >= this.#queue.length) {
      this.#cancelWatchdog();
      this.#state = "completed";
      this.#releaseUrl();
      this.#notify();
      return;
    }
    this.#index += 1;
    await this.#playCurrent().catch(() => {});
  }

  #setError(message) {
    if (this.#state === "error") return;
    this.#generation += 1;
    this.#cancelWatchdog();
    this.#state = "error";
    this.#error = String(message);
    this.#audio.pause();
    this.#releaseUrl();
    this.#notify();
  }

  #cancelWatchdog() { this.clearTimer(this.#watchdog); this.#watchdog = null; }

  #armWatchdog() {
    this.#cancelWatchdog();
    this.#lastProgress = this.now(); this.#lastPosition = this.currentTimeMs();
    const check = () => {
      if (!["loading", "playing"].includes(this.#state)) return;
      const position = this.currentTimeMs();
      if (position > this.#lastPosition) { this.#lastPosition = position; this.#lastProgress = this.now(); }
      if (this.now() - this.#lastProgress >= this.stallTimeoutMs) {
        this.#setError("Audio stopped progressing. Robot Stop requested; check the robot physically."); return;
      }
      this.#watchdog = this.setTimer(check, 1000); this.#watchdog?.unref?.();
    };
    this.#watchdog = this.setTimer(check, 1000); this.#watchdog?.unref?.();
  }

  #releaseUrl() {
    if (this.#currentUrl) this.#urlObject.revokeObjectURL(this.#currentUrl);
    this.#currentUrl = null;
  }

  #notify() {
    const snapshot = this.snapshot();
    this.#listeners.forEach((listener) => listener(snapshot));
  }
}
