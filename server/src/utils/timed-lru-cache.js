class TimedLruCache {
  constructor({ maxEntries, ttlMs }) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
    this.store = new Map();
  }

  get(key) {
    const entry = this.store.get(key);

    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }

    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key, value) {
    const entry = {
      value,
      expiresAt: Date.now() + this.ttlMs,
    };

    if (this.store.has(key)) {
      this.store.delete(key);
    }

    this.store.set(key, entry);

    while (this.store.size > this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      this.store.delete(oldestKey);
    }
  }
}

module.exports = { TimedLruCache };
