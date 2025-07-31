import { Redis } from '@upstash/redis';

const log = (...args) => console.log('[REDIS]', ...args);

// Initialize Upstash Redis client
const redis = Redis.fromEnv();

// Redis wrapper functions to match previous API
export class RedisKV {
  // Get a value
  async get(key) {
    return await redis.get(key);
  }

  // Set a value with optional expiration
  async set(key, value, options = {}) {
    if (options.ex) {
      return await redis.setex(key, options.ex, value);
    }
    return await redis.set(key, value);
  }

  // Hash operations
  async hget(key, field) {
    return await redis.hget(key, field);
  }

  async hset(key, field, value) {
    return await redis.hset(key, field, value);
  }

  async hgetall(key) {
    return await redis.hgetall(key);
  }

  async hincrby(key, field, increment) {
    return await redis.hincrby(key, field, increment);
  }

  async hincrbyfloat(key, field, increment) {
    return await redis.hincrbyfloat(key, field, increment);
  }

  // List operations
  async lpush(key, ...values) {
    return await redis.lpush(key, ...values);
  }

  async lrange(key, start, stop) {
    return await redis.lrange(key, start, stop);
  }

  async ltrim(key, start, stop) {
    return await redis.ltrim(key, start, stop);
  }

  // Set operations
  async sadd(key, ...members) {
    return await redis.sadd(key, ...members);
  }

  // Sorted set operations
  async zadd(key, score, member) {
    return await redis.zadd(key, score, member);
  }

  async zremrangebyrank(key, start, stop) {
    return await redis.zremrangebyrank(key, start, stop);
  }

  // Expiration
  async expire(key, seconds) {
    return await redis.expire(key, seconds);
  }

  // Delete
  async del(key) {
    return await redis.del(key);
  }

  // Get keys matching pattern
  async keys(pattern) {
    return await redis.keys(pattern);
  }

  // Set with expiration (legacy method name)
  async setex(key, seconds, value) {
    return await redis.setex(key, seconds, value);
  }

  // Multi-get
  async mget(keys) {
    return await redis.mget(...keys);
  }

  // Increment
  async incr(key) {
    return await redis.incr(key);
  }

  // Set cardinality (count of set members)
  async scard(key) {
    return await redis.scard(key);
  }
}

// Export singleton instance
export const kv = new RedisKV();
