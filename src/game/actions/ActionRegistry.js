export class ActionRegistry {
  constructor() {
    this.entries = [];
    this.lastActionId = "";
  }

  register({ id, weight = 1, create }) {
    this.entries.push({ id, weight, create });
  }

  createById(id) {
    const entry = this.entries.find((candidate) => candidate.id === id);
    if (!entry) return null;
    this.lastActionId = entry.id;
    return entry.create();
  }

  next() {
    if (this.entries.length === 0) return null;

    const options =
      this.entries.length > 1
        ? this.entries.filter((entry) => entry.id !== this.lastActionId)
        : [...this.entries];

    const totalWeight = options.reduce((sum, item) => sum + item.weight, 0);
    let roll = Math.random() * totalWeight;

    for (const entry of options) {
      roll -= entry.weight;
      if (roll <= 0) {
        this.lastActionId = entry.id;
        return entry.create();
      }
    }

    const fallback = options[options.length - 1];
    this.lastActionId = fallback.id;
    return fallback.create();
  }
}
