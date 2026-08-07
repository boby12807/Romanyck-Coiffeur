import {
    ADMIN_COOKIE_NAME,
    createAdminSession,
    expiredSessionCookie,
    hasAdminSession,
    passwordMatches,
    sessionCookie
} from '../lib/admin-session.js';
import {
    consumeRateLimit,
    getClientIp,
    isSameOrigin,
    readBody,
    setSecurityHeaders
} from '../lib/security.js';

export default async function handler(request, response) {
    setSecurityHeaders(response);

    if (request.method === 'GET') {
        return response.status(200).json({ authenticated: hasAdminSession(request) });
    }

    if (!isSameOrigin(request)) {
        return response.status(403).json({ error: 'Origine de la demande refusée.' });
    }

    if (request.method === 'DELETE') {
        response.setHeader('Set-Cookie', expiredSessionCookie());
        return response.status(200).json({ authenticated: false });
    }

    if (request.method !== 'POST') {
        response.setHeader('Allow', 'GET, POST, DELETE');
        return response.status(405).json({ error: 'Méthode non autorisée.' });
    }

    if (!process.env.ADMIN_UPLOAD_PASSWORD) {
        return response.status(503).json({ error: "L’accès administrateur n’est pas encore configuré." });
    }

    const rate = consumeRateLimit('admin-login', getClientIp(request), 5, 15 * 60 * 1000);
    if (!rate.allowed) {
        response.setHeader('Retry-After', String(rate.retryAfter));
        return response.status(429).json({ error: 'Trop de tentatives. Réessayez plus tard.' });
    }

    const body = readBody(request);
    if (!passwordMatches(body.password)) {
        return response.status(401).json({ error: 'Mot de passe incorrect.' });
    }

    const session = createAdminSession();
    response.setHeader('Set-Cookie', sessionCookie(session.token, session.maxAge));
    return response.status(200).json({ authenticated: true, cookie: ADMIN_COOKIE_NAME });
}
