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

  constructor({ audio = new Audio(), urlObject = URL } = {}) {
    this.#audio = audio;
    this.#urlObject = urlObject;
    audio.addEventListener("timeupdate", () => this.#notify());
    audio.addEventListener("ended", () => { void this.#advance(); });
    audio.addEventListener("error", () => {
      if (["loading", "playing", "paused"].includes(this.#state)) {
        this.#setError(playbackErrorMessage(audio.error, "Audio playback failed. The file may be missing or unsupported."));
      }
    });
  }

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
    this.#audio.pause();
    this.#state = "paused";
    this.#notify();
    return true;
  }

  async resume() {
    if (this.#state !== "paused") return false;
    try {
      await this.#audio.play();
      this.#state = "playing";
      this.#notify();
      return true;
    } catch (error) {
      this.#setError(playbackErrorMessage(error, "Audio playback could not resume"));
      return false;
    }
  }

  stop() {
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
    this.#releaseUrl();
    const track = this.#queue[this.#index];
    if (!track?.audioBlob) return this.#setError("The next audio file is missing from local storage");
    this.#state = "loading";
    this.#notify();
    try {
      this.#currentUrl = this.#urlObject.createObjectURL(track.audioBlob);
      this.#audio.src = this.#currentUrl;
      this.#audio.load?.();
      await this.#audio.play();
      this.#state = "playing";
      this.#notify();
    } catch (error) {
      this.#setError(playbackErrorMessage(error, "Audio playback could not start"));
      throw error;
    }
  }

  async #advance() {
    this.#completed += 1;
    if (this.#completed >= this.#queue.length) {
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
    this.#state = "error";
    this.#error = String(message);
    this.#audio.pause();
    this.#releaseUrl();
    this.#notify();
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
