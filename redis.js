import { Redis } from "@upstash/redis";

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

// 内存兜底（实例重启会丢数据，但能保命）
const mem = new Map();

function makeMemoryRedis() {
  return {
    async get(key) {
      return mem.has(key) ? mem.get(key) : null;
    },
    async set(key, value, opts = {}) {
      mem.set(key, value);
      if (opts?.ex) {
        setTimeout(() => mem.delete(key), opts.ex * 1000).unref?.();
      }
      return "OK";
    },
    async del(key) {
      mem.delete(key);
      return 1;
    }
  };
}

let redis;

try {
  if (!url || !token) {
    console.warn("[redis] missing env, fallback to memory");
    redis = makeMemoryRedis();
  } else {
    redis = new Redis({ url, token });
  }
} catch (e) {
  console.warn("[redis] init failed, fallback to memory:", e?.message || e);
  redis = makeMemoryRedis();
}

export default redis;