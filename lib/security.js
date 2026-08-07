const rateBuckets = new Map();

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

export const consumeRateLimit = (namespace, key, maximum, windowMs) => {
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
