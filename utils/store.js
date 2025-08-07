// Einfache In-Memory-Stores mit TTL für Uploads/Ergebnisse

class TTLStore {
    constructor() {
      this.map = new Map();
    }
    set(key, value, ttlMs) {
      const expiresAt = Date.now() + (ttlMs || 3600000);
      this.map.set(key, { value, expiresAt });
    }
    get(key) {
      const entry = this.map.get(key);
      if (!entry) return null;
      if (Date.now() > entry.expiresAt) {
        this.map.delete(key);
        return null;
      }
      return entry.value;
    }
    delete(key) {
      this.map.delete(key);
    }
    keys() {
      return Array.from(this.map.keys());
    }
    cleanup(predicate) {
      const now = Date.now();
      for (const [k, v] of this.map.entries()) {
        if (now > v.expiresAt || (predicate && predicate(k, v))) {
          this.map.delete(k);
        }
      }
    }
  }
  
  export const uploadsStore = new TTLStore();
  export const resultsStore = new TTLStore();
  
  export function cleanupScheduler() {
    // Alle 10 Minuten aufräumen
    setInterval(() => {
      try {
        uploadsStore.cleanup();
        resultsStore.cleanup();
      } catch (e) {
        console.error('Cleanup-Fehler:', e);
      }
    }, 10 * 60 * 1000);
  }