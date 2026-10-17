import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, readdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { Redis } from '@upstash/redis';
import { createHandler as galleryHandler } from '../api/realisations.js';
import { createHandler as sessionHandler } from '../api/admin-session.js';
import { createHandler as mediaHandler } from '../api/media.js';
import robotsHandler from '../api/robots.js';
import sitemapHandler from '../api/sitemap.js';
import { ADMIN_COOKIE_NAME, createSessionManager, passwordMatches, sessionCookie } from '../lib/admin-session.js';
import { GalleryError, presentEntry, createGalleryStore } from '../lib/gallery-store.js';
import { defaultRealisations } from '../lib/default-realisations.js';
import { normaliseImage } from '../lib/images.js';
import { buildSite } from '../scripts/build.mjs';
import { cleanText, consumeRateLimit, getClientIp, isSameOrigin, parseDataImage, readBody } from '../lib/security.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const response = () => ({ headers: {}, statusCode: 200,
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }, send(body) { this.body = body; return this; } });
const withEnvironment = async (values, callback) => {
    const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
    Object.entries(values).forEach(([key, value]) => { if (value === undefined) delete process.env[key]; else process.env[key] = value; });
    try { return await callback(); }
    finally { Object.entries(previous).forEach(([key, value]) => { if (value === undefined) delete process.env[key]; else process.env[key] = value; }); }
};
const credentials = { ADMIN_UPLOAD_PASSWORD: 'audit-test-password-only-long', ADMIN_SESSION_SECRET: 'audit-test-secret-with-at-least-32-characters' };
const allowed = async () => ({ allowed: true });
const request = (method = 'GET', body = {}, url = '/api/realisations') => ({ method, url, body,
    headers: { host: 'salon.example', origin: 'https://salon.example', 'x-forwarded-for': '203.0.113.1' } });
const initialEntry = () => {
    const entry = structuredClone(defaultRealisations[0]);
    for (const side of ['before', 'after']) {
        entry[side].storage = { kind: 'bundled', path: entry[side].fallback };
        delete entry[side].fallback;
    }
    return entry;
};
const memoryStore = (values = [initialEntry()]) => {
    const records = new Map(values.map((entry) => [entry.id, structuredClone(entry)]));
    return { records, async all() { return structuredClone([...records.values()]); },
        async find(id) { return structuredClone(records.get(id) || null); },
        async save(entry, previous = null) {
            if (JSON.stringify(records.get(entry.id) || null) !== JSON.stringify(previous)) throw new GalleryError('Conflit', 409);
            records.set(entry.id, structuredClone(entry)); return structuredClone(entry);
        }, async remove(entry) { records.delete(entry.id); } };
};
const gallery = (store, options = {}) => galleryHandler({ store, authenticated: async () => true, rateLimit: allowed, ...options });
const memorySessions = () => {
    const values = new Map();
    return createSessionManager({ redis: () => ({
        async set(key, value, { ex }) { values.set(key, { value, expires: Date.now() + ex * 1000 }); },
        async get(key) { const item = values.get(key); return item?.expires > Date.now() ? item.value : null; },
        async del(key) { return values.delete(key); }
    }) });
};

test('les sessions sont signées, stockées, puis réellement révoquées à la déconnexion', () => withEnvironment(credentials, async () => {
    const sessions = memorySessions();
    const session = await sessions.createAdminSession();
    const req = request('DELETE'); req.headers.cookie = sessionCookie(session.token, session.maxAge);
    assert.equal(passwordMatches(credentials.ADMIN_UPLOAD_PASSWORD), true);
    assert.equal(passwordMatches('incorrect'), false);
    assert.match(req.headers.cookie, /HttpOnly; Secure; SameSite=Strict/);
    assert.equal(await sessions.hasAdminSession(req), true);
    assert.equal(await sessions.hasAdminSession({ headers: { cookie: `${ADMIN_COOKIE_NAME}=${session.token}x` } }), false);
    const result = response(); await sessionHandler({ sessions })(req, result);
    assert.equal(result.statusCode, 200);
    assert.match(result.headers['Set-Cookie'], /Max-Age=0/);
    assert.equal(await sessions.hasAdminSession(req), false);
}));

test('changer le mot de passe invalide les sessions signées précédemment', () => withEnvironment(credentials, async () => {
    const sessions = memorySessions(), session = await sessions.createAdminSession();
    const req = { headers: { cookie: sessionCookie(session.token, session.maxAge) } };
    process.env.ADMIN_UPLOAD_PASSWORD = 'new-password-with-adequate-length';
    assert.equal(await sessions.hasAdminSession(req), false);
}));

test('une session expirée est refusée', (context) => withEnvironment(credentials, async () => {
    const sessions = memorySessions(), session = await sessions.createAdminSession();
    const now = Date.now(); context.mock.method(Date, 'now', () => now + 9 * 3600000);
    assert.equal(await sessions.hasAdminSession({ headers: { cookie: sessionCookie(session.token, session.maxAge) } }), false);
}));

test('la panne du stockage de session interdit l’accès et ne simule pas une déconnexion réussie', async () => {
    const sessions = { async hasAdminSession() { throw new Error('offline'); }, async revokeAdminSession() { throw new Error('offline'); } };
    for (const method of ['GET', 'DELETE']) {
        const result = response(); await sessionHandler({ sessions })(request(method), result);
        assert.equal(result.statusCode, 503); assert.equal(result.headers['Set-Cookie'], undefined);
    }
});

test('la connexion valide crée un cookie et les tentatives dépassant le quota sont bloquées', () => withEnvironment(credentials, async () => {
    const result = response();
    await sessionHandler({ sessions: memorySessions(), rateLimit: allowed })(request('POST', { password: credentials.ADMIN_UPLOAD_PASSWORD }), result);
    assert.equal(result.statusCode, 200); assert.match(result.headers['Set-Cookie'], /HttpOnly; Secure; SameSite=Strict/);
    const blocked = response();
    await sessionHandler({ rateLimit: async () => ({ allowed: false, retryAfter: 42 }) })(request('POST'), blocked);
    assert.equal(blocked.statusCode, 429); assert.equal(blocked.headers['Retry-After'], '42');
}));

test('la connexion refuse les secrets trop courts et les origines étrangères', () => withEnvironment({ ADMIN_UPLOAD_PASSWORD: 'short', ADMIN_SESSION_SECRET: 'short' }, async () => {
    const result = response(); await sessionHandler()(request('POST'), result); assert.equal(result.statusCode, 503);
    const req = request('POST'); req.headers.origin = 'https://evil.example';
    const foreign = response(); await sessionHandler()(req, foreign); assert.equal(foreign.statusCode, 403);
}));

test('la galerie publique exclut les photos masquées, les suppressions et tous les chemins privés', async () => {
    const visible = initialEntry(), hidden = { ...initialEntry(), id: 'hidden', visible: false }, deleted = { ...initialEntry(), id: 'deleted', deleted: true, deletionPending: true };
    const result = response(); await gallery(memoryStore([visible, hidden, deleted]))(request(), result);
    assert.equal(result.statusCode, 200); assert.equal(result.body.realisations.length, 1);
    assert.doesNotMatch(JSON.stringify(result.body), /storage|assets\/|blob\.vercel/);
    assert.match(result.body.realisations[0].before.fallback, /^\/api\/media\?/);
    assert.match(result.headers['Cache-Control'], /no-store/);
});

test('la vue privée et toutes les mutations nécessitent une session', async () => {
    for (const [method, url] of [['GET', '/api/realisations?admin=1'], ['POST', '/api/realisations'], ['PATCH', '/api/realisations'], ['DELETE', '/api/realisations']]) {
        const result = response(); await gallery(memoryStore(), { authenticated: async () => false })(request(method, {}, url), result);
        assert.equal(result.statusCode, 401);
    }
});

test('les mutations refusent une origine différente avant toute lecture du stockage', async () => {
    const req = request('DELETE'); req.headers.origin = 'https://evil.example';
    const result = response(); await gallery(memoryStore())(req, result); assert.equal(result.statusCode, 403);
});

test('la galerie applique une limite aux lectures publiques et refuse une panne de protection', async () => {
    for (const [rate, code] of [[{ allowed: false, retryAfter: 5 }, 429], [{ unavailable: true }, 503]]) {
        const result = response(); await gallery({ all() { assert.fail('read before rate limit'); } }, { rateLimit: async () => rate })(request(), result);
        assert.equal(result.statusCode, code);
    }
});

test('une panne de galerie ne renvoie aucune photo initiale', async () => {
    const result = response();
    await gallery({ async all() { throw new Error('offline'); } })(request(), result);
    assert.equal(result.statusCode, 503); assert.equal(result.body.realisations, undefined);
});

test('le navigateur ne réaffiche aucune photo en cas de panne ou de réponse invalide', async () => {
    const source = await readFile(resolve(root, 'script.js'), 'utf8');
    const body = source.split('const loadPublishedRealisations = async () => {')[1].split('\n    };')[0];
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    for (const scenario of ['503', 'network', 'invalid-json']) {
        let message;
        const fetchMock = async () => {
            if (scenario === 'network') throw new TypeError('offline');
            return { ok: scenario !== '503', status: 503, async json() { throw new SyntaxError(); } };
        };
        const classes = { remove() {} };
        await new AsyncFunction('fetch', 'renderRealisations', 'realisationsGrid', 'workFilters', 'document', body)(
            fetchMock, () => assert.fail('fallback photos'), { classList: classes, replaceChildren(element) { message = element.textContent; } },
            { classList: classes, replaceChildren() {} }, { createElement() { return {}; } }
        );
        assert.match(message, /temporairement indisponible/);
    }
});

test('une suppression échouée reste masquée et visible dans l’administration pour réessai', async () => {
    const entry = initialEntry();
    for (const side of ['before', 'after']) entry[side].storage = { kind: 'blob', path: `realisations/media/test-${side}.webp` };
    const store = memoryStore([entry]); let fail = true;
    const handler = gallery(store, { blob: { async del() { if (fail) throw new Error('storage down'); } } });
    const result = response(); await handler(request('DELETE', { id: entry.id }), result); assert.equal(result.statusCode, 503);
    assert.equal((await store.find(entry.id)).deletionPending, true);
    const publicResult = response(); await handler(request(), publicResult); assert.equal(publicResult.body.realisations.length, 0);
    const adminResult = response(); await handler(request('GET', {}, '/api/realisations?admin=1'), adminResult);
    assert.equal(adminResult.body.realisations[0].deletionPending, true);
    fail = false;
    const retry = response(); await handler(request('DELETE', { id: entry.id }), retry);
    assert.equal(retry.statusCode, 200); assert.equal(await store.find(entry.id), null);
    const later = response(); await handler(request(), later); assert.equal(later.body.realisations.length, 0);
});

test('une photo initiale supprimée ne revient pas à la lecture suivante', async () => {
    const store = memoryStore(), id = initialEntry().id;
    const deleted = response(); await gallery(store)(request('DELETE', { id }), deleted); assert.equal(deleted.statusCode, 200);
    const result = response(); await gallery(store)(request(), result); assert.equal(result.body.realisations.length, 0);
});

test('le masquage coupe immédiatement la lecture par URL directe, même avec un ancien lien', async () => {
    const store = memoryStore(), id = initialEntry().id;
    const media = mediaHandler({ store, authenticated: async () => false, rateLimit: allowed, readBundled: async () => Buffer.from('image') });
    const req = request('GET', {}, `/api/media?id=${id}&side=before`);
    const visible = response(); await media(req, visible); assert.equal(visible.statusCode, 200);
    const hidden = response(); await gallery(store)(request('PATCH', { id, visible: false }), hidden); assert.equal(hidden.statusCode, 200);
    const denied = response(); await media(req, denied); assert.equal(denied.statusCode, 404);
    const publicList = response(); await gallery(store)(request(), publicList); assert.equal(publicList.body.realisations.length, 0);
    const admin = response(); await mediaHandler({ store, authenticated: async () => true, rateLimit: allowed, readBundled: async () => Buffer.from('image') })(req, admin);
    assert.equal(admin.statusCode, 200); assert.match(admin.headers['Cache-Control'], /no-store/);
});

test('un retrait pendant le téléchargement coupe aussi la réponse en cours', async () => {
    const store = memoryStore(), id = initialEntry().id;
    const media = mediaHandler({ store, authenticated: async () => false, rateLimit: allowed, async readBundled() {
        const entry = await store.find(id); await store.save({ ...entry, visible: false }, entry); return Buffer.from('image');
    } });
    const result = response(); await media(request('GET', {}, `/api/media?id=${id}&side=before`), result); assert.equal(result.statusCode, 404);
});

test('les photos supprimées et les chemins inconnus ne sont jamais servis, même à un administrateur', async () => {
    const entry = { ...initialEntry(), deleted: true };
    const handler = mediaHandler({ store: memoryStore([entry]), authenticated: async () => true, rateLimit: allowed,
        readBundled() { assert.fail('deleted media read'); } });
    for (const url of [`/api/media?id=${entry.id}&side=before`, '/api/media?id=../secret&side=before', '/api/media?id=x&side=../../secret']) {
        const result = response(); await handler(request('GET', {}, url), result); assert.equal(result.statusCode, 404);
    }
});

test('la lecture privée transmet le jeton côté serveur et ne divulgue pas les URL Blob', async () => {
    const entry = initialEntry(); entry.before.storage = { kind: 'blob', path: 'realisations/media/test-before.webp' };
    const result = response();
    await mediaHandler({ store: memoryStore([entry]), authenticated: async () => false, rateLimit: allowed,
        async readBlob(path, options) {
            assert.equal(options.access, 'private'); assert.equal(path, entry.before.storage.path);
            return { statusCode: 200, stream: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); controller.close(); } }) };
        } })(request('GET', {}, `/api/media?id=${entry.id}&side=before`), result);
    assert.equal(result.statusCode, 200); assert.deepEqual([...result.body], [1, 2, 3]);
    assert.equal(result.headers.Location, undefined);
});

test('une republication exige une confirmation d’autorisation et une suppression en attente ne peut pas être réactivée', async () => {
    const entry = { ...initialEntry(), visible: false }, store = memoryStore([entry]);
    const invalid = response(); await gallery(store)(request('PATCH', { id: entry.id, visible: true }), invalid); assert.equal(invalid.statusCode, 400);
    const valid = response(); await gallery(store)(request('PATCH', { id: entry.id, visible: true, publicationAuthorized: true }), valid); assert.equal(valid.statusCode, 200);
    const current = await store.find(entry.id); await store.save({ ...current, deleted: true, deletionPending: true }, current);
    const pending = response(); await gallery(store)(request('PATCH', { id: entry.id, visible: true, publicationAuthorized: true }), pending); assert.equal(pending.statusCode, 409);
});

test('une modification concurrente ne peut pas annuler silencieusement un retrait', async () => {
    const store = memoryStore(), originalSave = store.save;
    store.save = async (entry, previous) => {
        store.records.set(entry.id, { ...previous, deleted: true, visible: false });
        return originalSave(entry, previous);
    };
    const result = response(); await gallery(store)(request('PATCH', { id: initialEntry().id, title: 'Updated' }), result);
    assert.equal(result.statusCode, 409); assert.equal((await store.find(initialEntry().id)).deleted, true);
});

test('le serveur décode, réencode et retire les métadonnées des photos réelles', async () => {
    const jpeg = await sharp({ create: { width: 300, height: 240, channels: 3, background: '#aabbcc' } }).jpeg().withMetadata().toBuffer();
    assert.ok((await sharp(jpeg).metadata()).exif);
    const output = await normaliseImage(`data:image/jpeg;base64,${jpeg.toString('base64')}`);
    const metadata = await sharp(output.buffer).metadata();
    assert.equal(metadata.format, 'webp'); assert.equal(metadata.width, 300); assert.equal(metadata.height, 240);
    assert.equal(metadata.exif, undefined); assert.equal(metadata.icc, undefined);
});

test('les faux fichiers, images corrompues, dimensions et tailles excessives sont refusés', async () => {
    const fake = Buffer.from([0xff, 0xd8, 0xff, 65, 65, 65]);
    await assert.rejects(normaliseImage(`data:image/jpeg;base64,${fake.toString('base64')}`));
    const tooWide = await sharp({ create: { width: 4001, height: 200, channels: 3, background: '#fff' } }).png().toBuffer();
    await assert.rejects(normaliseImage(`data:image/png;base64,${tooWide.toString('base64')}`));
    assert.equal(parseDataImage(`data:image/jpeg;base64,${'A'.repeat(5000)}`, 100), null);
    const corrupt = await sharp({ create: { width: 300, height: 240, channels: 3, background: '#eee' } }).jpeg().toBuffer();
    await assert.rejects(normaliseImage(`data:image/jpeg;base64,${corrupt.subarray(0, 200).toString('base64')}`));
});

test('la publication ignore les dimensions client et n’utilise que le stockage privé', async () => {
    const bytes = await sharp({ create: { width: 300, height: 240, channels: 3, background: '#aabbcc' } }).png().toBuffer();
    const store = memoryStore([]), uploads = [];
    const result = response();
    await gallery(store, { blob: { async put(path, buffer, options) { uploads.push({ path, options }); return { pathname: path }; }, async del() {} } })(
        request('POST', { title: 'Nouvelle coupe', category: 'Coupe', publicationAuthorized: true,
            before: { dataUrl: `data:image/png;base64,${bytes.toString('base64')}`, width: 99999, height: 1 },
            after: { dataUrl: `data:image/png;base64,${bytes.toString('base64')}` } }), result);
    assert.equal(result.statusCode, 201); assert.equal(uploads.length, 2);
    assert.ok(uploads.every((item) => item.options.access === 'private'));
    assert.equal(result.body.realisation.before.width, 300); assert.equal(result.body.realisation.before.height, 240);
    assert.doesNotMatch(JSON.stringify(result.body), /storage|blob\.vercel/);
});

test('le magasin Redis lit un index unique et refuse les conflits et la réinitialisation', async () => {
    let reads = 0; const entry = initialEntry();
    const store = createGalleryStore({ redis: () => ({ async hgetall() { reads++; return { __schema: '2', [entry.id]: JSON.stringify(entry) }; }, async eval() { return 'conflict'; } }) });
    assert.equal((await store.all()).length, 1); assert.equal(reads, 1);
    await assert.rejects(store.save({ ...entry, visible: false }, entry), (error) => error.status === 409);
    const populated = createGalleryStore({ redis: () => ({ async eval() { return 0; } }) });
    await assert.rejects(populated.initialise([entry]), (error) => error.status === 409);
});

test('le vrai SDK Redis conserve les chaînes et renvoie bien le format brut attendu par le magasin', async () => {
    const entry = initialEntry(), calls = [];
    const redis = new Redis({ url: 'https://test.upstash.io', token: 'test-token', automaticDeserialization: false, enableAutoPipelining: false });
    redis.client.request = async ({ body }) => {
        calls.push(body);
        if (body[0] === 'hgetall') return { result: ['__schema', '2', entry.id, JSON.stringify(entry)] };
        if (body[0] === 'hget') return { result: JSON.stringify(entry) };
        if (body[0] === 'get') return { result: 'active' };
        if (body[0] === 'eval') return { result: 'ok' };
        return { result: 'OK' };
    };
    const store = createGalleryStore({ redis: () => redis });
    assert.deepEqual(await store.all(), [entry]); assert.deepEqual(await store.find(entry.id), entry);
    const updated = { ...entry, visible: false }; await store.save(updated, entry);
    const cas = calls.find((call) => call[0] === 'eval');
    assert.equal(cas[4], entry.id); assert.equal(cas[5], JSON.stringify(entry)); assert.equal(cas[6], JSON.stringify(updated));
    await withEnvironment(credentials, async () => {
        const sessions = createSessionManager({ redis: () => redis });
        const session = await sessions.createAdminSession();
        assert.equal(await sessions.hasAdminSession({ headers: { cookie: sessionCookie(session.token, session.maxAge) } }), true);
        assert.equal(calls.find((call) => call[0] === 'set')[2], 'active');
    });
});

test('la limitation locale bloque au quota et la production refuse de fonctionner sans Redis', async () => {
    await withEnvironment({ NODE_ENV: undefined, VERCEL: undefined, UPSTASH_REDIS_REST_URL: undefined, UPSTASH_REDIS_REST_TOKEN: undefined }, async () => {
        const name = `quota-${Date.now()}`;
        assert.equal((await consumeRateLimit(name, 'client', 1, 60000)).allowed, true);
        assert.equal((await consumeRateLimit(name, 'client', 1, 60000)).allowed, false);
        await withEnvironment({ NODE_ENV: 'production' }, async () => assert.equal((await consumeRateLimit(name, 'client', 1, 60000)).unavailable, true));
    });
});

test('les utilitaires refusent les corps non objets et les origines sans HTTPS en ligne', () => {
    assert.equal(cleanText('  A\n  B ', 80), 'A B');
    for (const body of ['null', '[]', 'true', '{broken']) assert.deepEqual(readBody({ body }), {});
    assert.equal(getClientIp({ headers: { 'x-forwarded-for': '203.0.113.10, 10.0.0.1' } }), '203.0.113.10');
    assert.equal(isSameOrigin({ headers: { origin: 'https://salon.example', host: 'salon.example' } }), true);
    assert.equal(isSameOrigin({ headers: { origin: 'http://salon.example', host: 'salon.example' } }), false);
    assert.equal(isSameOrigin({ headers: { origin: 'http://localhost:3000', host: 'localhost:3000' } }), true);
});

test('le sitemap suit le domaine configuré et les prévisualisations bloquent l’indexation', async () => {
    await withEnvironment({ PUBLIC_SITE_URL: 'https://salon.example', VERCEL_ENV: 'production' }, async () => {
        const sitemap = response(); sitemapHandler(request(), sitemap);
        assert.match(sitemap.body, /https:\/\/salon\.example\//); assert.doesNotMatch(sitemap.body, /admin\.html/);
        const robots = response(); robotsHandler(request(), robots); assert.match(robots.body, /Disallow: \/admin\.html/);
    });
    await withEnvironment({ PUBLIC_SITE_URL: 'https://salon.example', VERCEL_ENV: 'preview' }, async () => {
        const robots = response(); robotsHandler(request(), robots); assert.equal(robots.body, 'User-agent: *\nDisallow: /\n');
    });
    await withEnvironment({ PUBLIC_SITE_URL: undefined, VERCEL_ENV: 'production' }, async () => {
        const sitemap = response(); sitemapHandler(request(), sitemap); assert.equal(sitemap.statusCode, 503);
    });
});

test('la construction produit des URL absolues et exclut photos de galerie, secrets et sources serveur', async () => {
    const output = await mkdtemp(resolve(root, 'test-output-'));
    try {
        await buildSite({ output, env: { PUBLIC_SITE_URL: 'https://salon.fr' } });
        const html = await readFile(resolve(output, 'index.html'), 'utf8');
        assert.match(html, /rel="canonical" href="https:\/\/salon.fr\/"/); assert.match(html, /noindex, nofollow/);
        for (const path of ['assets/realisations', 'assets/balayage_before.jpg', 'assets/balayage_after.webp', 'lib', 'scripts', '.env', 'package-lock.json']) {
            await assert.rejects(stat(resolve(output, path)), { code: 'ENOENT' });
        }
        assert.ok((await readdir(output)).includes('admin.html'));
    } finally { await rm(output, { recursive: true, force: true }); }
});

test('la construction production refuse les informations manquantes et échappe celles du médiateur', async () => {
    const output = await mkdtemp(resolve(root, 'test-output-'));
    const env = { VERCEL_ENV: 'production', PUBLIC_SITE_URL: 'https://salon.fr', ...credentials,
        BLOB_READ_WRITE_TOKEN: 'fake-private-token', UPSTASH_REDIS_REST_URL: 'https://fake.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'fake-redis-token' };
    try {
        await assert.rejects(buildSite({ output, env }), /médiateur/);
        await assert.rejects(buildSite({ output, env: { ...env, PUBLIC_SITE_URL: 'https://www.votre-domaine.fr' } }), /PUBLIC_SITE_URL/);
        await buildSite({ output, env: { ...env, MEDIATOR_NAME: '<Mediator & Co>', MEDIATOR_ADDRESS: 'Adresse test', MEDIATOR_URL: 'https://mediateur.fr' } });
        const html = await readFile(resolve(output, 'informations-legales.html'), 'utf8');
        assert.match(html, /&lt;Mediator &amp; Co&gt;/); assert.doesNotMatch(html, /\{\{[A-Z_]+\}\}/);
        assert.match(html, /content="index, follow"/);
        const oidcEnv = { ...env, BLOB_READ_WRITE_TOKEN: undefined, BLOB_STORE_ID: 'store_test', VERCEL: '1',
            MEDIATOR_NAME: 'Médiateur de test', MEDIATOR_ADDRESS: 'Adresse test', MEDIATOR_URL: 'https://mediateur.fr' };
        await buildSite({ output, env: oidcEnv });
        await assert.rejects(buildSite({ output, env: { ...oidcEnv, VERCEL: undefined } }), /Blob privé/);
    } finally { await rm(output, { recursive: true, force: true }); }
});
