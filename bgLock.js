import redis from "./redis.js";

const BG_LOCK_KEY = "huios:bg:lock";

export async function acquireBgLock(ttlSeconds = 120) {
  const result = await redis.set(BG_LOCK_KEY, "1", {
    nx: true,
    ex: ttlSeconds
  });
  return result === "OK";
}

export async function releaseBgLock() {
  await redis.del(BG_LOCK_KEY);
}