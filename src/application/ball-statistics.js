export class BallStatistics {
  constructor(store) { this.store = store; this.tail = Promise.resolve(); }
  async totals() { return (await this.store.get("settings", "ball-statistics")) ?? { id: "ball-statistics", balls: 0, drills: 0 }; }
  change(transform) {
    const operation = this.tail.then(async () => {
      const next = transform(await this.totals());
      for (const key of ["balls", "drills"]) if (!Number.isSafeInteger(next[key]) || next[key] < 0) throw new Error("Totals must be non-negative whole numbers");
      await this.store.put("settings", next); return next;
    });
    this.tail = operation.catch(() => {}); return operation;
  }
  set(balls, drills) { return this.change((old) => ({ ...old, balls, drills })); }
  resetBalls() { return this.change((old) => ({ ...old, balls: 0 })); }
  completed(balls) { return this.change((old) => ({ ...old, balls: old.balls + balls, drills: old.drills + 1 })); }
}
