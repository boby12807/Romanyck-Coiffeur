import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getRedis, namespace } from './store.js';

export const ADMIN_COOKIE_NAME = 'romanyck_admin';
const SESSION_SECONDS = 8 * 60 * 60;
const safeEqual = (left, right) => {
    const a = Buffer.from(left || '');
    const b = Buffer.from(right || '');
    return a.length === b.length && timingSafeEqual(a, b);
};
export const adminConfigured = () => (process.env.ADMIN_UPLOAD_PASSWORD?.length || 0) >= 16
    && (process.env.ADMIN_SESSION_SECRET?.length || 0) >= 32
    && process.env.ADMIN_UPLOAD_PASSWORD !== process.env.ADMIN_SESSION_SECRET;
export const passwordMatches = (value) => typeof value === 'string' && value.length <= 1024
    && adminConfigured() && safeEqual(value, process.env.ADMIN_UPLOAD_PASSWORD);
// Changing either credential invalidates every existing session, including legacy tokens.
const sign = (payload) => createHmac('sha256', process.env.ADMIN_SESSION_SECRET)
    .update(`${payload}\0${process.env.ADMIN_UPLOAD_PASSWORD}`).digest('base64url');
const cookieToken = (request) => String(request.headers.cookie || '').split(';')
    .map((part) => part.trim()).find((part) => part.startsWith(`${ADMIN_COOKIE_NAME}=`))
    ?.slice(ADMIN_COOKIE_NAME.length + 1) || '';
const sessionKey = (token) => `${namespace()}:session:${createHash('sha256').update(token).digest('hex')}`;
export const createSessionManager = ({ redis = getRedis } = {}) => ({
    async createAdminSession() {
        if (!adminConfigured()) throw new Error('Accès administrateur non configuré.');
        const payload = `${Date.now() + SESSION_SECONDS * 1000}.${randomBytes(24).toString('base64url')}`;
        const token = `${payload}.${sign(payload)}`;
        await redis().set(sessionKey(token), 'active', { ex: SESSION_SECONDS });
        return { token, maxAge: SESSION_SECONDS };
    },
    async hasAdminSession(request) {
        if (!adminConfigured()) return false;
        const token = cookieToken(request);
        if (!/^\d{13}\.[A-Za-z0-9_-]{32}\.[A-Za-z0-9_-]{43}$/.test(token)) return false;
        const [expires, nonce, signature] = token.split('.');
        if (Number(expires) <= Date.now() || !safeEqual(signature, sign(`${expires}.${nonce}`))) return false;
        return await redis().get(sessionKey(token)) === 'active';
    },
    async revokeAdminSession(request) {
        const token = cookieToken(request);
        if (token && token.length <= 256) await redis().del(sessionKey(token));
    }
});
export const { createAdminSession, hasAdminSession, revokeAdminSession } = createSessionManager();
export const sessionCookie = (token, maxAge) =>
    `${ADMIN_COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
export const expiredSessionCookie = () => sessionCookie('', 0);
