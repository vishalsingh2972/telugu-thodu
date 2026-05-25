import { Redis } from '@upstash/redis'
export const redis = Redis.fromEnv()

await redis.get("foo");