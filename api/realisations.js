import { timingSafeEqual, randomUUID } from 'node:crypto';
import { list, put } from '@vercel/blob';

const ALLOWED_CATEGORIES = new Set([
    'Coupe',
    'Coloration',
    'Balayage',
    'Mèches',
    'Coiffure',
    'Transformation',
    'Soin'
]);
const MAX_COMBINED_IMAGE_BYTES = 3_000_000;

const cleanText = (value, maximumLength) => (
    typeof value === 'string'
        ? value.trim().replace(/\s+/g, ' ').slice(0, maximumLength)
        : ''
);

const passwordsMatch = (received, expected) => {
    if (!received || !expected) return false;
    const receivedBuffer = Buffer.from(received);
    const expectedBuffer = Buffer.from(expected);
    return receivedBuffer.length === expectedBuffer.length
        && timingSafeEqual(receivedBuffer, expectedBuffer);
};

const parseDataImage = (dataUrl) => {
    if (typeof dataUrl !== 'string') return null;
    const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) return null;

    const buffer = Buffer.from(match[2], 'base64');
    if (!buffer.length) return null;

    return {
        buffer,
        contentType: match[1],
        extension: match[1] === 'image/png' ? 'png' : match[1] === 'image/webp' ? 'webp' : 'jpg'
    };
};

const readBody = (request) => {
    if (request.body && typeof request.body === 'object') return request.body;
    if (typeof request.body === 'string') {
        try {
            return JSON.parse(request.body);
        } catch {
            return {};
        }
    }
    return {};
};

const readPublishedEntries = async () => {
    const { blobs } = await list({
        prefix: 'realisations/entries/',
        limit: 100
    });

    const entries = await Promise.all(blobs.map(async (blob) => {
        try {
            const response = await fetch(blob.url, { cache: 'no-store' });
            return response.ok ? response.json() : null;
        } catch {
            return null;
        }
    }));

    return entries
        .filter(Boolean)
        .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
};

export default async function handler(request, response) {
    response.setHeader('Cache-Control', 'no-store, max-age=0');

    if (request.method === 'GET') {
        try {
            const realisations = await readPublishedEntries();
            return response.status(200).json({ realisations });
        } catch (error) {
            console.error('Erreur de lecture des réalisations', error);
            return response.status(503).json({ realisations: [], error: 'Stockage indisponible.' });
        }
    }

    if (request.method !== 'POST') {
        response.setHeader('Allow', 'GET, POST');
        return response.status(405).json({ error: 'Méthode non autorisée.' });
    }

    const body = readBody(request);
    if (!passwordsMatch(body.password, process.env.ADMIN_UPLOAD_PASSWORD)) {
        return response.status(401).json({ error: 'Mot de passe incorrect.' });
    }

    const title = cleanText(body.title, 90);
    const description = cleanText(body.description, 240);
    const category = cleanText(body.category, 40);
    const before = parseDataImage(body.before?.dataUrl);
    const after = parseDataImage(body.after?.dataUrl);
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

    if (
        !Number.isFinite(beforeWidth)
        || !Number.isFinite(beforeHeight)
        || !Number.isFinite(afterWidth)
        || !Number.isFinite(afterHeight)
    ) {
        return response.status(400).json({ error: 'Dimensions des photos invalides.' });
    }

    const id = `${Date.now()}-${randomUUID()}`;
    const beforeBlob = await put(
        `realisations/media/${id}-avant.${before.extension}`,
        before.buffer,
        { access: 'public', contentType: before.contentType, addRandomSuffix: false }
    );
    const afterBlob = await put(
        `realisations/media/${id}-apres.${after.extension}`,
        after.buffer,
        { access: 'public', contentType: after.contentType, addRandomSuffix: false }
    );

    const realisation = {
        id,
        order: 0,
        visible: true,
        createdAt: new Date().toISOString(),
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

    await put(
        `realisations/entries/${id}.json`,
        JSON.stringify(realisation),
        {
            access: 'public',
            contentType: 'application/json; charset=utf-8',
            addRandomSuffix: false
        }
    );

    return response.status(201).json({ success: true, realisation });
}
