import { CUSTOM_DRILL_FORMAT, CUSTOM_DRILL_FORMAT_VERSION } from "../drills/custom-drill-service.js";
import { createSharePackage, summarizeSharePackage, validateSharePackage } from "../../domain/sharing/package.js";

function fileSlug(value) {
  return String(value || "nova-prime-drills")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50) || "nova-prime-drills";
}

export class SharingService {
  constructor(drillService, {
    navigatorObject = globalThis.navigator,
    fileFactory = (parts, name, options) => new File(parts, name, options),
    now = () => new Date().toISOString(),
  } = {}) {
    this.drillService = drillService;
    this.navigatorObject = navigatorObject;
    this.fileFactory = fileFactory;
    this.now = now;
  }

  async create({ ids, title, note = "" }) {
    const selectedIds = new Set(ids ?? []);
    const drills = (await this.drillService.list()).filter((drill) => selectedIds.has(drill.id));
    if (!drills.length) throw new Error("Select at least one custom drill to share");
    if (drills.length !== selectedIds.size) throw new Error("One or more selected drills are no longer available");
    const payload = createSharePackage({ drills, title, note, createdAt: this.now() });
    const json = `${JSON.stringify(payload, null, 2)}\n`;
    return Object.freeze({ payload, json, filename: `${fileSlug(payload.title)}.nova-share.json`, summary: summarizeSharePackage(payload) });
  }

  preview(payload) {
    return summarizeSharePackage(payload);
  }

  async import(payload) {
    const valid = validateSharePackage(payload);
    const summary = summarizeSharePackage(valid);
    const result = await this.drillService.import({
      format: CUSTOM_DRILL_FORMAT,
      version: CUSTOM_DRILL_FORMAT_VERSION,
      createdAt: valid.createdAt,
      drills: valid.drills,
    });
    return Object.freeze({ ...result, summary });
  }

  async share(bundle) {
    if (typeof this.navigatorObject?.share !== "function") throw new Error("System sharing is not available in this browser");
    const file = this.fileFactory([bundle.json], bundle.filename, { type: "application/json" });
    const shareData = { title: bundle.payload.title, text: `${bundle.summary.drills} Nova Prime custom drill${bundle.summary.drills === 1 ? "" : "s"}`, files: [file] };
    if (typeof this.navigatorObject.canShare === "function" && !this.navigatorObject.canShare(shareData)) throw new Error("This browser cannot share Nova Prime drill files");
    await this.navigatorObject.share(shareData);
    return Object.freeze({ shared: true, filename: bundle.filename });
  }
}
