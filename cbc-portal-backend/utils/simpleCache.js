class SimpleCache {
  constructor(stdTTL = 60) {
    // Default TTL: 60 seconds
    this.cache = new Map();
    this.stdTTL = stdTTL * 1000;
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }
    return item.value;
  }

  set(key, value, ttl = null) {
    const expiry = Date.now() + (ttl ? ttl * 1000 : this.stdTTL);
    this.cache.set(key, { value, expiry });
  }

  del(key) {
    this.cache.delete(key);
  }

  // Invalidate all keys related to a specific scope (e.g., a schoolId)
  clearByPattern(pattern) {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }
}

const cache = new SimpleCache(60); 
export default cache;