import { createClient } from 'redis';

let redisClient;

if (process.env.REDIS_URL) {
  try {
    redisClient = createClient({ url: process.env.REDIS_URL });
    redisClient.connect().catch(() => {});
  } catch {
    redisClient = null;
  }
}

export async function clearProductsCache() {
  if (!redisClient || !redisClient.isOpen) return;
  try {
    const keys = await redisClient.keys('products:*');
    if (keys.length > 0) await redisClient.del(keys);
  } catch {
    // ignore
  }
}

export async function clearProductCache(productId) {
  if (!redisClient || !redisClient.isOpen) return;
  try {
    await redisClient.del(`product:${productId}`);
  } catch {
    // ignore
  }
}

export { redisClient };
