import { interpretVoiceResult } from "../../domain/voice/commands.js";

export class VoiceController {
  #recognition = null;
  #listening = false;

  constructor({ recognitionFactory = null, onCommand = async () => {}, onStatus = () => {} } = {}) {
    this.recognitionFactory = recognitionFactory;
    this.onCommand = onCommand;
    this.onStatus = onStatus;
  }

  get supported() { return typeof this.recognitionFactory === "function"; }
  get listening() { return this.#listening; }

  listen() {
    if (!this.supported) return Object.freeze({ accepted: false, reason: "UNSUPPORTED" });
    if (this.#listening) return Object.freeze({ accepted: false, reason: "ALREADY_LISTENING" });
    const recognition = this.recognitionFactory();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;
    this.#recognition = recognition;
    this.#listening = true;
    this.onStatus(Object.freeze({ state: "listening", message: "Listening for one command…" }));
    recognition.onresult = (event) => { void this.#handleResult(event); };
    recognition.onerror = (event) => {
      this.#listening = false;
      this.onStatus(Object.freeze({ state: "error", message: this.#errorMessage(event?.error), error: event?.error ?? "unknown" }));
    };
    recognition.onend = () => {
      const wasListening = this.#listening;
      this.#listening = false;
      this.#recognition = null;
      if (wasListening) this.onStatus(Object.freeze({ state: "ready", message: "No command heard. Tap Listen to try again." }));
    };
    try {
      recognition.start();
    } catch (error) {
      this.#listening = false;
      this.#recognition = null;
      this.onStatus(Object.freeze({ state: "error", message: "Voice recognition could not start. Touch controls remain available.", error: error?.message ?? "start-failed" }));
      return Object.freeze({ accepted: false, reason: "START_FAILED" });
    }
    return Object.freeze({ accepted: true });
  }

  cancel() {
    if (!this.#recognition) return false;
    this.#listening = false;
    this.#recognition.abort?.();
    this.#recognition = null;
    this.onStatus(Object.freeze({ state: "ready", message: "Listening cancelled." }));
    return true;
  }

  async #handleResult(event) {
    this.#listening = false;
    const alternatives = [...(event?.results?.[0] ?? [])];
    const interpreted = alternatives
      .map((item) => interpretVoiceResult({ transcript: item.transcript, confidence: item.confidence }))
      .find((item) => item.accepted)
      ?? interpretVoiceResult({ transcript: alternatives[0]?.transcript, confidence: alternatives[0]?.confidence });
    if (!interpreted.accepted) {
      const message = interpreted.reason === "LOW_CONFIDENCE"
        ? "Command was not clear enough. Nothing changed."
        : `Command not recognized${interpreted.transcript ? `: “${interpreted.transcript}”` : ""}. Nothing changed.`;
      this.onStatus(Object.freeze({ state: "rejected", message, result: interpreted }));
      return;
    }
    this.onStatus(Object.freeze({ state: "recognized", message: `Recognized “${interpreted.transcript}”.`, result: interpreted }));
    await this.onCommand(interpreted.command, interpreted);
  }

  #errorMessage(code) {
    if (code === "not-allowed" || code === "service-not-allowed") return "Microphone access was not allowed. Touch controls remain available.";
    if (code === "no-speech") return "No speech detected. Nothing changed.";
    if (code === "audio-capture") return "No microphone is available. Touch controls remain available.";
    if (code === "network") return "The browser’s speech service is unavailable. Touch controls remain available.";
    return "Voice recognition stopped safely. Touch controls remain available.";
  }
}
