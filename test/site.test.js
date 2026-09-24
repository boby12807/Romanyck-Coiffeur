import assert from 'node:assert/strict';
import { test } from 'node:test';
import realisationsHandler from '../api/realisations.js';
import rendezVousHandler from '../api/rendez-vous.js';
import adminSessionHandler from '../api/admin-session.js';
import { consumeRateLimit, parseDataImage } from '../lib/security.js';

const response = () => ({
    headers: {},
    statusCode: 200,
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
});

test('la galerie locale contient toutes les réalisations et une catégorie administrable', async () => {
    const result = response();
    await realisationsHandler({ method: 'GET', url: '/api/realisations', headers: { host: 'localhost' } }, result);
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.realisations.length, 4);
    assert.equal(result.body.realisations.find(({ id }) => id === 'blond-long-2026-02').category, 'Coloration');
});

test('une galerie sans stockage configuré échoue en production', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
        const result = response();
        await realisationsHandler({ method: 'GET', url: '/api/realisations', headers: { host: 'localhost' } }, result);
        assert.equal(result.statusCode, 503);
    } finally {
        if (previous === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previous;
    }
});

test('la date impossible est refusée avant tout envoi de courriel', async () => {
    const result = response();
    await rendezVousHandler({
        method: 'POST',
        headers: { origin: 'http://localhost', host: 'localhost', 'x-forwarded-for': '127.0.0.1' },
        body: {
            form_started_at: Date.now() - 2000,
            client_name: 'Camille', phone: '0612345678', service: 'femme-coupe',
            preferred_date: '2027-02-30'
        }
    }, result);
    assert.equal(result.statusCode, 400);
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
