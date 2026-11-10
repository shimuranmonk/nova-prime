import { NOVA_BLE_PROFILE } from "./nova-protocol.js";

function withTimeout(promise, milliseconds, code) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(code)), milliseconds); }),
  ]).finally(() => clearTimeout(timer));
}

export class WebBluetoothTransport {
  #device = null;
  #writeCharacteristic = null;
  #notifyCharacteristic = null;
  #writeTail = Promise.resolve();
  #disconnectListener = null;

  constructor({ bluetooth = globalThis.navigator?.bluetooth, profile = NOVA_BLE_PROFILE, timeoutMs = 8000 } = {}) {
    this.bluetooth = bluetooth;
    this.profile = profile;
    this.timeoutMs = timeoutMs;
  }

  get supported() { return typeof this.bluetooth?.requestDevice === "function"; }
  get connected() { return Boolean(this.#device?.gatt?.connected && this.#writeCharacteristic); }

  async connect({ onNotification = () => {}, onDisconnect = () => {} } = {}) {
    if (!this.supported) throw new Error("WEB_BLUETOOTH_UNAVAILABLE");
    if (this.connected) return;
    const device = await this.bluetooth.requestDevice({
      filters: [{ services: [this.profile.advertisedService] }],
      optionalServices: [this.profile.serviceUuid],
    });
    this.#device = device;
    this.#disconnectListener = () => {
      this.#writeCharacteristic = null;
      this.#notifyCharacteristic = null;
      onDisconnect();
    };
    device.addEventListener?.("gattserverdisconnected", this.#disconnectListener);
    try {
      const server = await withTimeout(device.gatt.connect(), this.timeoutMs, "NOVA_GATT_CONNECT_TIMEOUT");
      const service = await withTimeout(server.getPrimaryService(this.profile.serviceUuid), this.timeoutMs, "NOVA_SERVICE_TIMEOUT");
      const [writeCharacteristic, notifyCharacteristic] = await Promise.all([
        withTimeout(service.getCharacteristic(this.profile.writeUuid), this.timeoutMs, "NOVA_WRITE_CHARACTERISTIC_TIMEOUT"),
        withTimeout(service.getCharacteristic(this.profile.notifyUuid), this.timeoutMs, "NOVA_NOTIFY_CHARACTERISTIC_TIMEOUT"),
      ]);
      this.#writeCharacteristic = writeCharacteristic;
      this.#notifyCharacteristic = notifyCharacteristic;
      notifyCharacteristic.addEventListener("characteristicvaluechanged", (event) => {
        const value = event?.target?.value;
        if (value) onNotification(new Uint8Array(value.buffer, value.byteOffset ?? 0, value.byteLength));
      });
      await withTimeout(notifyCharacteristic.startNotifications(), this.timeoutMs, "NOVA_NOTIFICATION_TIMEOUT");
    } catch (error) {
      this.disconnect();
      throw error;
    }
  }

  write(bytes) {
    if (!this.connected) return Promise.reject(new Error("NOVA_NOT_CONNECTED"));
    const payload = Uint8Array.from(bytes);
    const task = this.#writeTail.then(() => withTimeout(this.#writeCharacteristic.writeValue(payload), this.timeoutMs, "NOVA_WRITE_TIMEOUT"));
    this.#writeTail = task.catch(() => {});
    return task;
  }

  disconnect() {
    const device = this.#device;
    if (device && this.#disconnectListener) device.removeEventListener?.("gattserverdisconnected", this.#disconnectListener);
    if (device?.gatt?.connected) device.gatt.disconnect();
    this.#device = null;
    this.#writeCharacteristic = null;
    this.#notifyCharacteristic = null;
    this.#writeTail = Promise.resolve();
  }
}
