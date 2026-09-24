import { randomUUID } from 'node:crypto';
import { del, list, put } from '@vercel/blob';
import { hasAdminSession } from '../lib/admin-session.js';
import { defaultRealisations } from '../lib/default-realisations.js';
import {
    cleanText,
    consumeRateLimit,
    getClientIp,
    isSameOrigin,
    parseDataImage,
    readBody,
    setSecurityHeaders
} from '../lib/security.js';

const ALLOWED_CATEGORIES = new Set([
    'Coupe',
    'Coloration',
    'Balayage',
    'Mèches',
    'Coiffure',
    'Transformation',
    'Soin'
]);
const MAX_SINGLE_IMAGE_BYTES = 1_500_000;
const MAX_COMBINED_IMAGE_BYTES = 3_000_000;
const ENTRY_PREFIX = 'realisations/entries/';

const sortEntries = (entries) => entries.sort((a, b) => {
    const orderDifference = (a.order ?? 1000) - (b.order ?? 1000);
    if (orderDifference) return orderDifference;
    return Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0);
});

const readStoredEntries = async () => {
    // During local setup the bundled examples can be previewed without Blob.
    // A production configuration error must not republish a masked example.
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
        if (process.env.NODE_ENV === 'production'
            || (process.env.VERCEL && process.env.VERCEL_ENV !== 'development')) {
            throw new Error('Stockage Blob non configuré.');
        }
        return [];
    }

    const blobs = [];
    let cursor;
    let hasMore;
    do {
        const page = await list({ prefix: ENTRY_PREFIX, limit: 100, cursor });
        blobs.push(...page.blobs);
        hasMore = page.hasMore;
        cursor = page.cursor;
        if (hasMore && !cursor) throw new Error('Pagination du stockage incomplète.');
    } while (hasMore);

    return Promise.all(blobs.map(async (blob) => {
        const result = await fetch(`${blob.url}?v=${blob.uploadedAt?.getTime?.() || Date.now()}`, {
            cache: 'no-store'
        });
        if (!result.ok) throw new Error('Une réalisation enregistrée est inaccessible.');
        const data = await result.json();
        if (!data?.id) throw new Error('Une réalisation enregistrée est invalide.');
        // Older gallery records used the label « Couleur ».
        if (data.category === 'Couleur') data.category = 'Coloration';
        return { metadataUrl: blob.url, data };
    }));
};

const readMergedEntries = async () => {
    const stored = await readStoredEntries();
    const storedIds = new Set(stored.map((entry) => entry.data.id));
    return [
        ...stored,
        ...defaultRealisations
            .filter((entry) => !storedIds.has(entry.id))
            .map((data) => ({ metadataUrl: null, data }))
    ];
};

const writeEntry = async (entry) => put(
    `${ENTRY_PREFIX}${entry.id}.json`,
    JSON.stringify(entry),
    {
        access: 'public',
        contentType: 'application/json; charset=utf-8',
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 60
    }
);

const validDimension = (value) => Number.isFinite(value) && value >= 200 && value <= 4000;

const requireAdminMutation = async (request, response) => {
    if (!isSameOrigin(request)) {
        response.status(403).json({ error: 'Origine de la demande refusée.' });
        return false;
    }
    if (!hasAdminSession(request)) {
        response.status(401).json({ error: 'Session administrateur expirée.' });
        return false;
    }
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
        response.status(503).json({ error: 'Le stockage des photos est à configurer.' });
        return false;
    }
    const rate = await consumeRateLimit('admin-write', getClientIp(request), 40, 10 * 60 * 1000);
    if (rate.unavailable) {
        response.status(503).json({ error: 'La protection des modifications est indisponible.' });
        return false;
    }
    if (!rate.allowed) {
        response.setHeader('Retry-After', String(rate.retryAfter));
        response.status(429).json({ error: 'Trop de modifications rapprochées.' });
        return false;
    }
    return true;
};

export default async function handler(request, response) {
    setSecurityHeaders(response);

    try {
        if (request.method === 'GET') {
            const requestUrl = new URL(request.url, `https://${request.headers.host || 'localhost'}`);
            const adminView = requestUrl.searchParams.get('admin') === '1';
            if (adminView && !hasAdminSession(request)) {
                return response.status(401).json({ error: 'Connexion administrateur requise.' });
            }

            const stored = await readMergedEntries();
            const realisations = sortEntries(stored.map((entry) => entry.data))
                .filter((entry) => !entry.deleted && (adminView || entry.visible !== false));
            return response.status(200).json({ realisations });
        }

        if (!['POST', 'PATCH', 'DELETE'].includes(request.method)) {
            response.setHeader('Allow', 'GET, POST, PATCH, DELETE');
            return response.status(405).json({ error: 'Méthode non autorisée.' });
        }
        if (!await requireAdminMutation(request, response)) return;

        const body = readBody(request);

        if (request.method === 'POST') {
            if (body.publicationAuthorized !== true) {
                return response.status(400).json({ error: 'Confirmez l’autorisation de publication des deux photos.' });
            }
            const title = cleanText(body.title, 90);
            const description = cleanText(body.description, 240);
            const category = cleanText(body.category, 40);
            const before = parseDataImage(body.before?.dataUrl, MAX_SINGLE_IMAGE_BYTES);
            const after = parseDataImage(body.after?.dataUrl, MAX_SINGLE_IMAGE_BYTES);
            const beforeWidth = Number(body.before?.width);
            const beforeHeight = Number(body.before?.height);
            const afterWidth = Number(body.after?.width);
            const afterHeight = Number(body.after?.height);

            if (!title || !ALLOWED_CATEGORIES.has(category) || !before || !after) {
                return response.status(400).json({ error: 'Titre, catégorie ou photos invalides.' });
            }
            if (before.buffer.length + after.buffer.length > MAX_COMBINED_IMAGE_BYTES) {
                return response.status(413).json({ error: 'Les deux photos sont encore trop lourdes.' });
            }
            if (![beforeWidth, beforeHeight, afterWidth, afterHeight].every(validDimension)) {
                return response.status(400).json({ error: 'Dimensions des photos invalides.' });
            }

            const existing = await readMergedEntries();
            const highestOrder = existing.reduce((maximum, entry) => (
                Math.max(maximum, Number(entry.data.order) || 0)
            ), 0);
            const id = `${Date.now()}-${randomUUID()}`;
            const uploadedUrls = [];
            try {
                const beforeBlob = await put(
                    `realisations/media/${id}-avant.${before.extension}`,
                    before.buffer,
                    { access: 'public', contentType: before.contentType, addRandomSuffix: false }
                );
                uploadedUrls.push(beforeBlob.url);
                const afterBlob = await put(
                    `realisations/media/${id}-apres.${after.extension}`,
                    after.buffer,
                    { access: 'public', contentType: after.contentType, addRandomSuffix: false }
                );
                uploadedUrls.push(afterBlob.url);

                const realisation = {
                    id,
                    order: highestOrder + 1,
                    visible: true,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    category,
                    title,
                    description: description || 'Une réalisation effectuée au salon, présentée en comparaison avant et après.',
                    before: {
                        fallback: beforeBlob.url,
                        alt: `Chevelure avant la prestation ${category.toLowerCase()}`,
                        width: Math.round(beforeWidth),
                        height: Math.round(beforeHeight)
                    },
                    after: {
                        fallback: afterBlob.url,
                        alt: `Chevelure après la prestation ${category.toLowerCase()}`,
                        width: Math.round(afterWidth),
                        height: Math.round(afterHeight)
                    }
                };
                await writeEntry(realisation);
                return response.status(201).json({ success: true, realisation });
            } catch (error) {
                if (uploadedUrls.length) {
                    await del(uploadedUrls).catch((cleanupError) => console.error('Nettoyage photos échoué', cleanupError));
                }
                throw error;
            }
        }

        const id = cleanText(body.id, 120);
        const stored = await readMergedEntries();
        const current = stored.find((entry) => entry.data.id === id);
        if (!current) return response.status(404).json({ error: 'Réalisation introuvable.' });

        if (request.method === 'DELETE') {
            const usesBundledImages = !String(current.data.before?.fallback || '').includes('.blob.vercel-storage.com/')
                || !String(current.data.after?.fallback || '').includes('.blob.vercel-storage.com/');
            if (usesBundledImages) {
                await writeEntry({
                    ...current.data,
                    visible: false,
                    deleted: true,
                    updatedAt: new Date().toISOString()
                });
                return response.status(200).json({ success: true });
            }
            await writeEntry({ ...current.data, visible: false, deleted: true, updatedAt: new Date().toISOString() });
            const mediaUrls = [
                current.data.before?.fallback,
                current.data.after?.fallback
            ].filter((url) => typeof url === 'string' && url.includes('.blob.vercel-storage.com/'));
            if (mediaUrls.length) await del(mediaUrls);
            if (current.metadataUrl) await del(current.metadataUrl);
            return response.status(200).json({ success: true });
        }

        const title = body.title === undefined ? current.data.title : cleanText(body.title, 90);
        const description = body.description === undefined
            ? current.data.description
            : cleanText(body.description, 240);
        const category = body.category === undefined ? current.data.category : cleanText(body.category, 40);
        const visible = body.visible === undefined ? current.data.visible !== false : body.visible === true;
        const order = body.order === undefined ? Number(current.data.order) : Number(body.order);

        if (!title || !ALLOWED_CATEGORIES.has(category) || !Number.isFinite(order) || order < -1000000 || order > 1000000) {
            return response.status(400).json({ error: 'Modification invalide.' });
        }

        const updated = {
            ...current.data,
            title,
            description,
            category,
            visible,
            order,
            updatedAt: new Date().toISOString()
        };
        await writeEntry(updated);
        return response.status(200).json({ success: true, realisation: updated });
    } catch (error) {
        console.error('Erreur API réalisations', error);
        return response.status(503).json({ error: 'Le stockage des réalisations est indisponible.' });
    }
}
