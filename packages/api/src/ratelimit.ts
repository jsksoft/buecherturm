import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

function getRedis(): Redis {
  const url = process.env['UPSTASH_REDIS_REST_URL'];
  const token = process.env['UPSTASH_REDIS_REST_TOKEN'];
  if (!url || !token) {
    throw new Error('Upstash Redis environment variables are not configured');
  }
  return new Redis({ url, token });
}

// 20 text-search queries per user per minute (fast — local DB + DNB)
export const searchRateLimit = new Ratelimit({
  redis: getRedis(),
  limiter: Ratelimit.slidingWindow(20, '1 m'),
  prefix: 'rl:search',
});

// 5 semantic (embedding) searches per user per minute — each call hits OpenAI embeddings API
export const semanticRateLimit = new Ratelimit({
  redis: getRedis(),
  limiter: Ratelimit.slidingWindow(5, '1 m'),
  prefix: 'rl:semantic',
});
