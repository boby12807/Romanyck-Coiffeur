import { ADMIN_COOKIE_NAME, adminConfigured, createSessionManager, expiredSessionCookie, passwordMatches, sessionCookie } from '../lib/admin-session.js';
import { consumeRateLimit, getClientIp, isSameOrigin, readBody, setSecurityHeaders } from '../lib/security.js';
import { logEvent } from '../lib/store.js';

export const createHandler = ({ sessions = createSessionManager(), rateLimit = consumeRateLimit } = {}) => async (request, response) => {
    setSecurityHeaders(response);
    try {
        if (request.method === 'GET') return response.status(200).json({ authenticated: await sessions.hasAdminSession(request) });
        if (!isSameOrigin(request)) return response.status(403).json({ error: 'Origine de la demande refusée.' });
        if (request.method === 'DELETE') {
            await sessions.revokeAdminSession(request);
            response.setHeader('Set-Cookie', expiredSessionCookie());
            logEvent('admin.logout');
            return response.status(200).json({ authenticated: false });
        }
        if (request.method !== 'POST') {
            response.setHeader('Allow', 'GET, POST, DELETE');
            return response.status(405).json({ error: 'Méthode non autorisée.' });
        }
        if (!adminConfigured()) return response.status(503).json({ error: 'L’accès administrateur n’est pas encore configuré.' });
        const rate = await rateLimit('admin-login', getClientIp(request), 5, 15 * 60 * 1000);
        if (rate.unavailable) return response.status(503).json({ error: 'La connexion est temporairement indisponible.' });
        if (!rate.allowed) {
            response.setHeader('Retry-After', String(rate.retryAfter));
            return response.status(429).json({ error: 'Trop de tentatives. Réessayez plus tard.' });
        }
        if (!passwordMatches(readBody(request).password)) {
            logEvent('admin.login.denied');
            return response.status(401).json({ error: 'Mot de passe incorrect.' });
        }
        const session = await sessions.createAdminSession();
        response.setHeader('Set-Cookie', sessionCookie(session.token, session.maxAge));
        logEvent('admin.login.success');
        return response.status(200).json({ authenticated: true, cookie: ADMIN_COOKIE_NAME });
    } catch {
        logEvent('admin.security.unavailable');
        return response.status(503).json({ error: 'Le service de sécurité est temporairement indisponible.' });
    }
};
export default createHandler();
