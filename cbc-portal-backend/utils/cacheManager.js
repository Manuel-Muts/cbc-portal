/**
 * Simple in-memory cache manager with TTL support
 * Can be easily replaced with Redis in production
 */

class CacheManager {
  constructor() {
    this.cache = new Map();
  }

  /**
   * Set a value in cache with optional TTL (in seconds)
   */
  set(key, value, ttl = 300) {
    const now = Date.now();
    this.cache.set(key, {
      value,
      expiry: now + (ttl * 1000),
    });
  }

  /**
   * Get a value from cache
   */
  get(key) {
    if (!this.cache.has(key)) {
      return null;
    }

    const item = this.cache.get(key);
    const now = Date.now();

    // Check if expired
    if (item.expiry < now) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  /**
   * Delete a specific cache key
   */
  delete(key) {
    this.cache.delete(key);
  }

  /** Alias for delete to support legacy simpleCache calls */
  del(key) {
    this.delete(key);
  }

  /**
   * Clear all cache related to a pattern
   */
  clearPattern(pattern) {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  /** Alias for clearPattern to support legacy simpleCache calls */
  clearByPattern(pattern) {
    this.clearPattern(pattern);
  }

  /**
   * Clear all cache
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Generate a cache key from parameters
   */
  generateKey(prefix, params = {}) {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}:${params[key]}`)
      .join('|');
    return `${prefix}:${sortedParams}`;
  }
}

export default new CacheManager();
