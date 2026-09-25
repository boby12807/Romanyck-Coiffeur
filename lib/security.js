import { createHash } from 'node:crypto';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const rateBuckets = new Map();
const distributedLimiters = new Map();

export const cleanText = (value, maximumLength) => (
    typeof value === 'string'
        ? value.trim().replace(/\s+/g, ' ').slice(0, maximumLength)
        : ''
);

export const readBody = (request) => {
    if (request.body && typeof request.body === 'object') return request.body;
    if (typeof request.body === 'string') {
        try {
            return JSON.parse(request.body);
        } catch {
            return {};
        }
    }
    return {};
};

export const getClientIp = (request) => {
    const forwarded = request.headers['x-forwarded-for'];
    return cleanText(Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0], 80)
        || request.socket?.remoteAddress
        || 'unknown';
};

export const consumeRateLimit = async (namespace, key, maximum, windowMs) => {
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
        const limiterKey = `${namespace}:${maximum}:${windowMs}`;
        if (!distributedLimiters.has(limiterKey)) {
            distributedLimiters.set(limiterKey, new Ratelimit({
                redis: Redis.fromEnv(),
                limiter: Ratelimit.fixedWindow(maximum, `${windowMs}ms`),
                prefix: `romanyck:${namespace}`,
                // A failed remote check must never silently allow an unlimited request.
                timeout: 0,
                analytics: false
            }));
        }
        try {
            const identifier = createHash('sha256').update(key).digest('hex');
            const result = await distributedLimiters.get(limiterKey).limit(identifier);
            return {
                allowed: result.success && result.reason !== 'timeout',
                retryAfter: Math.max(1, Math.ceil((result.reset - Date.now()) / 1000))
            };
        } catch (error) {
            console.error('Limitation des requêtes indisponible', error);
            return { allowed: false, unavailable: true, retryAfter: 0 };
        }
    }

    // Useful for local previews; production needs one counter shared by every instance.
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
        return { allowed: false, unavailable: true, retryAfter: 0 };
    }

    const now = Date.now();
    const bucketKey = `${namespace}:${key}`;
    const current = rateBuckets.get(bucketKey);
    if (!current || current.resetAt <= now) {
        rateBuckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
        return { allowed: true, retryAfter: 0 };
    }

    current.count += 1;
    if (current.count <= maximum) return { allowed: true, retryAfter: 0 };
    return {
        allowed: false,
        retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000))
    };
};

export const isSameOrigin = (request) => {
    const origin = request.headers.origin;
    const host = request.headers['x-forwarded-host'] || request.headers.host;
    if (!origin || !host) return false;

    try {
        return new URL(origin).host === String(host).split(',')[0].trim();
    } catch {
        return false;
    }
};

const hasImageSignature = (buffer, contentType) => {
    if (contentType === 'image/jpeg') {
        return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    }
    if (contentType === 'image/png') {
        return buffer.length >= 8
            && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    }
    if (contentType === 'image/webp') {
        return buffer.length >= 12
            && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
            && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
    }
    return false;
};

export const parseDataImage = (dataUrl, maximumBytes) => {
    if (typeof dataUrl !== 'string') return null;
    const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) return null;

    // Reject oversized encoded input before allocating a decoded buffer.
    if (match[2].length > Math.ceil(maximumBytes / 3) * 4 + 4
        || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(match[2])) return null;

    const buffer = Buffer.from(match[2], 'base64');
    if (!buffer.length || buffer.length > maximumBytes || !hasImageSignature(buffer, match[1])) return null;

    return {
        buffer,
        contentType: match[1],
        extension: match[1] === 'image/png' ? 'png' : match[1] === 'image/webp' ? 'webp' : 'jpg'
    };
};

export const setSecurityHeaders = (response) => {
    response.setHeader('Cache-Control', 'no-store, max-age=0');
    response.setHeader('X-Content-Type-Options', 'nosniff');
};
