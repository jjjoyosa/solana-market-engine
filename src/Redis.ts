import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

redis.on('error', (err: Error) => {
  console.error('🚨 [Redis Error]', err.message);
});

redis.on('connect', () => {
  console.log('✅ [Redis] Connected');
});

export default redis;