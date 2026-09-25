import assert from 'node:assert/strict';
import { test } from 'node:test';
import realisationsHandler from '../api/realisations.js';
import adminSessionHandler from '../api/admin-session.js';
import robotsHandler from '../api/robots.js';
import sitemapHandler from '../api/sitemap.js';
import {
    ADMIN_COOKIE_NAME,
    createAdminSession,
    expiredSessionCookie,
    hasAdminSession,
    passwordMatches,
    sessionCookie
} from '../lib/admin-session.js';
import {
    cleanText,
    consumeRateLimit,
    getClientIp,
    isSameOrigin,
    parseDataImage,
    readBody
} from '../lib/security.js';

const response = () => ({
    headers: {},
    statusCode: 200,
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; }
});

const withEnvironment = async (values, callback) => {
    const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
    Object.entries(values).forEach(([key, value]) => {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    });
    try {
        return await callback();
    } finally {
        Object.entries(previous).forEach(([key, value]) => {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        });
    }
};

test('la galerie locale contient toutes les réalisations et une catégorie administrable', async () => {
    const result = response();
    await realisationsHandler({ method: 'GET', url: '/api/realisations', headers: { host: 'localhost' } }, result);
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.realisations.length, 4);
    assert.equal(result.body.realisations.find(({ id }) => id === 'blond-long-2026-02').category, 'Coloration');
});

test('la galerie initiale reste visible en production avant configuration du stockage', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
        const result = response();
        await realisationsHandler({ method: 'GET', url: '/api/realisations', headers: { host: 'localhost' } }, result);
        assert.equal(result.statusCode, 200);
        assert.equal(result.body.realisations.length, 4);
    } finally {
        if (previous === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previous;
    }
});

test('une galerie administrée refuse de republier les exemples si Blob disparaît', async (context) => {
    context.mock.method(console, 'error', () => {});
    const previous = process.env.ADMIN_UPLOAD_PASSWORD;
    process.env.ADMIN_UPLOAD_PASSWORD = 'configured-secret';
    try {
        const result = response();
        await realisationsHandler({ method: 'GET', url: '/api/realisations', headers: { host: 'localhost' } }, result);
        assert.equal(result.statusCode, 503);
    } finally {
        if (previous === undefined) delete process.env.ADMIN_UPLOAD_PASSWORD;
        else process.env.ADMIN_UPLOAD_PASSWORD = previous;
    }
});

test('la connexion administrateur refuse une configuration de secrets incomplète', async () => {
    const result = response();
    await adminSessionHandler({
        method: 'POST', headers: { origin: 'http://localhost', host: 'localhost' },
        body: { password: 'incorrect' }
    }, result);
    assert.equal(result.statusCode, 503);
});

test('une image Base64 trop grande est refusée', () => {
    assert.equal(parseDataImage(`data:image/jpeg;base64,${'A'.repeat(5000)}`, 100), null);
});

test('la protection des requêtes échoue fermement sans stockage partagé en production', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
        assert.deepEqual(await consumeRateLimit('login-test', '127.0.0.1', 5, 900000), {
            allowed: false, unavailable: true, retryAfter: 0
        });
    } finally {
        if (previous === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previous;
    }
});

test('les utilitaires nettoient les entrées et refusent une origine étrangère', () => {
    assert.equal(cleanText('  Camille\n   Dupont  ', 80), 'Camille Dupont');
    assert.deepEqual(readBody({ body: '{"service":"soin"}' }), { service: 'soin' });
    assert.deepEqual(readBody({ body: '{invalide' }), {});
    assert.equal(getClientIp({ headers: { 'x-forwarded-for': '203.0.113.10, 10.0.0.1' } }), '203.0.113.10');
    assert.equal(isSameOrigin({ headers: { origin: 'https://salon.example', host: 'salon.example' } }), true);
    assert.equal(isSameOrigin({ headers: { origin: 'https://evil.example', host: 'salon.example' } }), false);
});

test('la limitation locale bloque au-delà du quota', async () => {
    const namespace = `test-${Date.now()}-${Math.random()}`;
    assert.equal((await consumeRateLimit(namespace, 'client', 2, 60_000)).allowed, true);
    assert.equal((await consumeRateLimit(namespace, 'client', 2, 60_000)).allowed, true);
    const blocked = await consumeRateLimit(namespace, 'client', 2, 60_000);
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.retryAfter > 0);
});

test('une session administrateur signée est acceptée et une session altérée est refusée', async () => {
    await withEnvironment({
        ADMIN_UPLOAD_PASSWORD: 'mot-de-passe-long-et-distinct',
        ADMIN_SESSION_SECRET: 'secret-de-session-encore-plus-long'
    }, async () => {
        assert.equal(passwordMatches('mot-de-passe-long-et-distinct'), true);
        assert.equal(passwordMatches('incorrect'), false);
        const session = createAdminSession();
        const cookie = sessionCookie(session.token, session.maxAge);
        assert.match(cookie, new RegExp(`^${ADMIN_COOKIE_NAME}=`));
        assert.match(cookie, /HttpOnly; Secure; SameSite=Strict/);
        assert.equal(hasAdminSession({ headers: { cookie } }), true);
        assert.equal(hasAdminSession({ headers: { cookie: `${ADMIN_COOKIE_NAME}=${session.token}x` } }), false);
        assert.match(expiredSessionCookie(), /Max-Age=0/);
    });
});

test('une connexion administrateur valide crée un cookie sécurisé', async () => {
    await withEnvironment({
        NODE_ENV: undefined,
        VERCEL: undefined,
        UPSTASH_REDIS_REST_URL: undefined,
        UPSTASH_REDIS_REST_TOKEN: undefined,
        ADMIN_UPLOAD_PASSWORD: 'mot-de-passe-long-et-distinct',
        ADMIN_SESSION_SECRET: 'secret-de-session-encore-plus-long'
    }, async () => {
        const result = response();
        await adminSessionHandler({
            method: 'POST',
            headers: {
                origin: 'http://localhost',
                host: 'localhost',
                'x-forwarded-for': `127.0.0.${Math.floor(Math.random() * 200) + 2}`
            },
            body: { password: 'mot-de-passe-long-et-distinct' }
        }, result);
        assert.equal(result.statusCode, 200);
        assert.equal(result.body.authenticated, true);
        assert.match(result.headers['Set-Cookie'], /HttpOnly; Secure; SameSite=Strict/);
    });
});

test('les mutations refusent les requêtes provenant d’un autre site', async () => {
    const login = response();
    await adminSessionHandler({ method: 'POST', headers: { origin: 'https://evil.example', host: 'salon.example' }, body: {} }, login);
    assert.equal(login.statusCode, 403);
});

test('le sitemap et robots utilisent le domaine public sans exposer l’administration', async () => {
    await withEnvironment({ PUBLIC_SITE_URL: undefined }, async () => {
        const sitemap = response();
        sitemapHandler({ method: 'GET', headers: { host: 'salon.example' } }, sitemap);
        assert.equal(sitemap.statusCode, 200);
        assert.equal(sitemap.headers['Content-Type'], 'application/xml; charset=utf-8');
        assert.match(sitemap.body, /https:\/\/salon\.example\//);
        assert.doesNotMatch(sitemap.body, /admin\.html/);

        const robots = response();
        robotsHandler({ method: 'GET', headers: { host: 'salon.example' } }, robots);
        assert.equal(robots.statusCode, 200);
        assert.match(robots.body, /Disallow: \/admin\.html/);
        assert.match(robots.body, /Sitemap: https:\/\/salon\.example\/sitemap\.xml/);
    });
});

test('une configuration publique invalide ne permet pas une injection de domaine', async () => {
    await withEnvironment({ PUBLIC_SITE_URL: 'javascript:alert(1)' }, async () => {
        const result = response();
        sitemapHandler({ method: 'GET', headers: { host: 'bad host\n.example' } }, result);
        assert.equal(result.statusCode, 503);
    });
});
