import { Redis } from '@upstash/redis';

export const namespace = (env = process.env) => `romanyck:${env.VERCEL_ENV || 'development'}:v2`;
export const getRedis = () => {
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) throw new Error('Stockage de sécurité non configuré.');
    return new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN,
        retry: false, signal: () => AbortSignal.timeout(5000), automaticDeserialization: false });
};
// Never log passwords, cookies, IPs or storage URLs.
export const logEvent = (event, id = undefined) => {
    console.info(JSON.stringify({ event, ...(id ? { id } : {}), at: new Date().toISOString() }));
};
