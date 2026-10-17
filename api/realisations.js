import { randomUUID } from 'node:crypto';
import { del, put } from '@vercel/blob';
import { hasAdminSession } from '../lib/admin-session.js';
import { createGalleryStore, GalleryError, presentEntry, validId } from '../lib/gallery-store.js';
import { normaliseImage } from '../lib/images.js';
import { cleanText, consumeRateLimit, getClientIp, isSameOrigin, readBody, setSecurityHeaders } from '../lib/security.js';
import { logEvent } from '../lib/store.js';

const CATEGORIES = new Set(['Coupe', 'Coloration', 'Balayage', 'Mèches', 'Coiffure', 'Transformation', 'Soin']);
const sort = (entries) => entries.sort((a, b) => a.order - b.order || Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
export const createHandler = ({ store = createGalleryStore(), authenticated = hasAdminSession,
    rateLimit = consumeRateLimit, blob = { put, del }, prepareImage = normaliseImage } = {}) => async (request, response) => {
    setSecurityHeaders(response);
    try {
        if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(request.method)) {
            response.setHeader('Allow', 'GET, POST, PATCH, DELETE');
            return response.status(405).json({ error: 'Méthode non autorisée.' });
        }
        const adminView = new URL(request.url, 'https://site.invalid').searchParams.get('admin') === '1';
        const mutation = request.method !== 'GET';
        if (mutation && !isSameOrigin(request)) return response.status(403).json({ error: 'Origine de la demande refusée.' });
        if ((mutation || adminView) && !await authenticated(request)) return response.status(401).json({ error: 'Connexion administrateur requise.' });
        const rate = await rateLimit(mutation ? 'admin-write' : 'gallery-read', getClientIp(request), mutation ? 40 : 120, mutation ? 600000 : 60000);
        if (rate.unavailable) return response.status(503).json({ error: 'La protection du service est indisponible.' });
        if (!rate.allowed) {
            response.setHeader('Retry-After', String(rate.retryAfter));
            return response.status(429).json({ error: 'Trop de demandes rapprochées. Réessayez plus tard.' });
        }
        if (!mutation) {
            const entries = sort((await store.all()).filter((entry) => adminView
                ? !entry.deleted || entry.deletionPending
                : !entry.deleted && entry.visible !== false));
            return response.status(200).json({ realisations: entries.map((entry) => presentEntry(entry, adminView)) });
        }
        const body = readBody(request);
        if (request.method === 'POST') {
            const title = cleanText(body.title, 90);
            const category = cleanText(body.category, 40);
            if (!title || !CATEGORIES.has(category) || body.publicationAuthorized !== true) {
                throw new GalleryError('Vérifiez le titre, la catégorie et l’autorisation de publication.', 400);
            }
            let before, after;
            try {
                // Sequential decoding bounds peak memory use. Client dimensions are never trusted.
                before = await prepareImage(body.before?.dataUrl);
                after = await prepareImage(body.after?.dataUrl);
            } catch { throw new GalleryError('Photos invalides : JPEG, PNG ou WebP, 200 à 4000 pixels, 1,5 Mo maximum par photo.', 400); }
            const existing = await store.all();
            const id = `${Date.now()}-${randomUUID()}`;
            const now = new Date().toISOString();
            const entry = { id, order: Math.max(0, ...existing.map((e) => e.order || 0)) + 1,
                title, category, description: cleanText(body.description, 240), visible: true,
                createdAt: now, updatedAt: now, publicationAuthorizedAt: now };
            for (const [side, image] of [['before', before], ['after', after]]) {
                entry[side] = { storage: { kind: 'blob', path: `realisations/media/${id}-${side}.webp` },
                    width: image.width, height: image.height,
                    alt: `Chevelure ${side === 'before' ? 'avant' : 'après'} la prestation ${category.toLowerCase()}` };
            }
            try {
                for (const [side, image] of [['before', before], ['after', after]]) {
                    const path = `realisations/media/${id}-${side}.webp`;
                    const result = await blob.put(path, image.buffer, { access: 'private', contentType: 'image/webp',
                        addRandomSuffix: false, abortSignal: AbortSignal.timeout(8000) });
                    entry[side] = { storage: { kind: 'blob', path: result.pathname }, width: image.width, height: image.height,
                        alt: `Chevelure ${side === 'before' ? 'avant' : 'après'} la prestation ${category.toLowerCase()}` };
                }
                await store.save(entry);
            } catch (error) {
                // Include a timed-out upload whose write may still have reached storage.
                const paths = [entry.before.storage.path, entry.after.storage.path];
                try { await blob.del(paths, { abortSignal: AbortSignal.timeout(5000) }); }
                catch {
                    logEvent('gallery.upload.cleanup.failed', id);
                    const current = await store.find(id);
                    await store.save({ ...entry, visible: false, deleted: true, deletionPending: true }, current);
                }
                throw error;
            }
            logEvent('gallery.created', id);
            return response.status(201).json({ success: true, realisation: presentEntry(entry, true) });
        }
        if (!validId(body.id)) throw new GalleryError('Identifiant invalide.', 400);
        const current = await store.find(body.id);
        if (!current) throw new GalleryError('Réalisation introuvable.', 404);
        if (request.method === 'DELETE') {
            const pending = current.deletionPending ? current : await store.save({ ...current,
                visible: false, deleted: true, deletionPending: true, updatedAt: new Date().toISOString() }, current);
            // Keep the pending record in the admin index until all deletions succeed.
            const paths = [pending.before, pending.after].filter((photo) => photo.storage.kind === 'blob').map((photo) => photo.storage.path);
            try {
                if (paths.length) await blob.del(paths, { abortSignal: AbortSignal.timeout(8000) });
                await store.remove(pending);
            } catch {
                logEvent('gallery.delete.pending', current.id);
                throw new GalleryError('Publication retirée. La suppression des fichiers reste à terminer : cliquez sur « Réessayer la suppression ».');
            }
            logEvent('gallery.deleted', current.id);
            return response.status(200).json({ success: true });
        }
        if (current.deleted || current.deletionPending) throw new GalleryError('Cette réalisation est en cours de suppression.', 409);
        const updated = { ...current, updatedAt: new Date().toISOString(),
            title: body.title === undefined ? current.title : cleanText(body.title, 90),
            description: body.description === undefined ? current.description : cleanText(body.description, 240),
            category: body.category === undefined ? current.category : cleanText(body.category, 40),
            visible: body.visible === undefined ? current.visible : body.visible,
            order: body.order === undefined ? current.order : Number(body.order) };
        if (!updated.title || !CATEGORIES.has(updated.category) || typeof updated.visible !== 'boolean'
            || !Number.isFinite(updated.order) || Math.abs(updated.order) > 1000000) throw new GalleryError('Modification invalide.', 400);
        if (updated.visible && current.visible === false && body.publicationAuthorized !== true) {
            throw new GalleryError('Confirmez l’autorisation de publication avant de réafficher ces photos.', 400);
        }
        await store.save(updated, current);
        logEvent(updated.visible ? 'gallery.updated' : 'gallery.hidden', current.id);
        return response.status(200).json({ success: true, realisation: presentEntry(updated, true) });
    } catch (error) {
        logEvent('gallery.request.failed');
        return response.status(error instanceof GalleryError ? error.status : 503).json({
            error: error instanceof GalleryError ? error.message : 'La galerie est temporairement indisponible.'
        });
    }
};
export default createHandler();
