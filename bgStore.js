import redis from "./redis.js";

const BG_DATA_KEY = "huios:bgdata";

export async function getAllBgData() {
  return (await redis.get(BG_DATA_KEY)) || {};
}

export async function getBgUser(userId) {
  const all = await getAllBgData();
  return all[userId] || null;
}

export async function setBgUser(userId, value) {
  const all = await getAllBgData();
  all[userId] = value;
  await redis.set(BG_DATA_KEY, all);
  return all[userId];
}

export async function setAllBgData(data) {
  await redis.set(BG_DATA_KEY, data || {});
}