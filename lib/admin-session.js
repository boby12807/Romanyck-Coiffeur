import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const ADMIN_COOKIE_NAME = 'romanyck_admin';
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

const getSecret = () => process.env.ADMIN_SESSION_SECRET || '';

const safeEqual = (left, right) => {
    const leftBuffer = Buffer.from(left || '');
    const rightBuffer = Buffer.from(right || '');
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

export const passwordMatches = (received) => (
    typeof received === 'string' && safeEqual(received, process.env.ADMIN_UPLOAD_PASSWORD)
);

const sign = (payload) => createHmac('sha256', getSecret()).update(payload).digest('base64url');

export const createAdminSession = () => {
    if (!getSecret() || getSecret() === process.env.ADMIN_UPLOAD_PASSWORD) {
        throw new Error('Secret de session administrateur invalide.');
    }
    const expiresAt = Date.now() + SESSION_DURATION_MS;
    const payload = `${expiresAt}.${randomBytes(18).toString('base64url')}`;
    return {
        token: `${payload}.${sign(payload)}`,
        maxAge: Math.floor(SESSION_DURATION_MS / 1000)
    };
};

const readCookies = (request) => Object.fromEntries(
    String(request.headers.cookie || '')
        .split(';')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
            const separator = part.indexOf('=');
            return separator === -1 ? [part, ''] : [part.slice(0, separator), part.slice(separator + 1)];
        })
);

export const hasAdminSession = (request) => {
    if (!getSecret()) return false;
    const token = readCookies(request)[ADMIN_COOKIE_NAME];
    if (!token) return false;

    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const payload = `${parts[0]}.${parts[1]}`;
    const expiresAt = Number(parts[0]);
    return Number.isFinite(expiresAt) && expiresAt > Date.now() && safeEqual(parts[2], sign(payload));
};

export const sessionCookie = (token, maxAge) => (
    `${ADMIN_COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`
);

export const expiredSessionCookie = () => (
    `${ADMIN_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
);
