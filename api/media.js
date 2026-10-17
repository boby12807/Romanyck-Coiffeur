import { readFile } from 'node:fs/promises';
import { get } from '@vercel/blob';
import { hasAdminSession } from '../lib/admin-session.js';
import { createGalleryStore, validId } from '../lib/gallery-store.js';
import { consumeRateLimit, getClientIp, setSecurityHeaders } from '../lib/security.js';
import { defaultRealisations } from '../lib/default-realisations.js';
import { logEvent } from '../lib/store.js';

// Bundled media is included only in this server function, never in the static output.
const bundledPaths = new Set(defaultRealisations.flatMap((entry) => [entry.before.fallback, entry.after.fallback]));
export const createHandler = ({ store = createGalleryStore(), authenticated = hasAdminSession,
    rateLimit = consumeRateLimit, readBlob = get, readBundled = (path) => readFile(new URL(`../${path}`, import.meta.url)) } = {}) => async (request, response) => {
    setSecurityHeaders(response);
    response.setHeader('X-Robots-Tag', 'noindex, nofollow');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    if (request.method !== 'GET') {
        response.setHeader('Allow', 'GET');
        return response.status(405).send('Méthode non autorisée.');
    }
    try {
        const params = new URL(request.url, 'https://site.invalid').searchParams;
        const id = params.get('id'), side = params.get('side');
        if (!validId(id) || !['before', 'after'].includes(side)) return response.status(404).send('Photo introuvable.');
        const rate = await rateLimit('media-read', getClientIp(request), 240, 60000);
        if (rate.unavailable) return response.status(503).send('Service indisponible.');
        if (!rate.allowed) {
            response.setHeader('Retry-After', String(rate.retryAfter));
            return response.status(429).send('Trop de demandes.');
        }
        const entry = await store.find(id);
        if (!entry || entry.deleted || (entry.visible === false && !await authenticated(request))) {
            return response.status(404).send('Photo introuvable.');
        }
        const storage = entry[side]?.storage;
        let buffer, contentType;
        if (storage?.kind === 'bundled' && bundledPaths.has(storage.path)) {
            buffer = await readBundled(storage.path);
            contentType = 'image/jpeg';
        } else if (storage?.kind === 'blob' && /^realisations\/media\/[a-zA-Z0-9_-]+\.webp$/.test(storage.path)) {
            const result = await readBlob(storage.path, { access: 'private', abortSignal: AbortSignal.timeout(8000) });
            if (!result || result.statusCode !== 200) return response.status(404).send('Photo introuvable.');
            // Maximum uploaded output is 1.5 MB. A corrupted oversized store is rejected.
            const reader = result.stream.getReader();
            const parts = []; let length = 0;
            try {
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    length += value.length;
                    if (length > 1_500_000) throw new Error('Oversized media');
                    parts.push(Buffer.from(value));
                }
            } finally { await reader.cancel().catch(() => {}); }
            buffer = Buffer.concat(parts);
            contentType = 'image/webp';
        } else return response.status(404).send('Photo introuvable.');
        // Recheck after downloading: a concurrent withdrawal must not serve old bytes.
        const latest = await store.find(id);
        if (!latest || latest.deleted || (latest.visible === false && !await authenticated(request))) return response.status(404).send('Photo introuvable.');
        response.setHeader('Content-Type', contentType);
        response.setHeader('Content-Disposition', 'inline');
        return response.status(200).send(buffer);
    } catch {
        logEvent('gallery.media.unavailable');
        return response.status(503).send('Photo temporairement indisponible.');
    }
};
export default createHandler();
