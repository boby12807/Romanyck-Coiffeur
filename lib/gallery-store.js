import { getRedis, namespace } from './store.js';

export class GalleryError extends Error {
    constructor(message, status = 503) { super(message); this.status = status; }
}
export const validId = (id) => typeof id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/.test(id);
export const galleryKey = () => `${namespace()}:gallery`;
const parse = (raw) => raw ? JSON.parse(raw) : null;

// A single materialized index: no Blob listing or per-record downloads on visits.
// Every mutation uses compare-and-set so concurrent edits cannot undo a withdrawal.
export const createGalleryStore = ({ redis = getRedis } = {}) => ({
    async all() {
        const raw = await redis().hgetall(galleryKey());
        // With automaticDeserialization disabled, Upstash returns Redis's flat array.
        const records = Array.isArray(raw) ? Object.fromEntries(
            Array.from({ length: raw.length / 2 }, (_, index) => [raw[index * 2], raw[index * 2 + 1]])
        ) : raw;
        if (records?.__schema !== '2') throw new GalleryError('La galerie doit être initialisée ou migrée.');
        return Object.entries(records).filter(([id]) => id !== '__schema').map(([, raw]) => parse(raw));
    },
    async find(id) {
        if (!validId(id)) return null;
        return parse(await redis().hget(galleryKey(), id));
    },
    async save(entry, previous = null) {
        if (!validId(entry.id)) throw new GalleryError('Identifiant invalide.', 400);
        const result = await redis().eval(`
            if redis.call('HGET', KEYS[1], '__schema') ~= '2' then return 'unavailable' end
            local current = redis.call('HGET', KEYS[1], ARGV[1]) or ''
            if current ~= ARGV[2] then return 'conflict' end
            if current == '' and redis.call('HLEN', KEYS[1]) > 500 then return 'full' end
            redis.call('HSET', KEYS[1], ARGV[1], ARGV[3])
            return 'ok'
        `, [galleryKey()], [entry.id, previous ? JSON.stringify(previous) : '', JSON.stringify(entry)]);
        if (result === 'conflict') throw new GalleryError('Cette réalisation a changé. Actualisez avant de réessayer.', 409);
        if (result === 'full') throw new GalleryError('La galerie a atteint sa capacité de 500 réalisations.', 409);
        if (result !== 'ok') throw new GalleryError('La galerie doit être initialisée ou migrée.');
        return entry;
    },
    async remove(entry) {
        const result = await redis().eval(`
            if redis.call('HGET', KEYS[1], ARGV[1]) ~= ARGV[2] then return 0 end
            return redis.call('HDEL', KEYS[1], ARGV[1])
        `, [galleryKey()], [entry.id, JSON.stringify(entry)]);
        if (result !== 1) throw new GalleryError('La suppression doit être réessayée après actualisation.', 409);
    },
    async initialise(entries) {
        if (entries.length > 500 || entries.some((entry) => !validId(entry.id))) throw new GalleryError('Import invalide.', 400);
        const fields = entries.flatMap((entry) => [entry.id, JSON.stringify(entry)]);
        const result = await redis().eval(`
            if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
            redis.call('HSET', KEYS[1], '__schema', '2')
            for i = 1, #ARGV, 2 do redis.call('HSET', KEYS[1], ARGV[i], ARGV[i+1]) end
            return 1
        `, [galleryKey()], fields);
        if (result !== 1) throw new GalleryError('Une galerie existe déjà : import refusé pour préserver les retraits.', 409);
    }
});

export const presentEntry = (entry, admin = false) => {
    const photo = (side) => ({
        fallback: `/api/media?id=${encodeURIComponent(entry.id)}&side=${side}`,
        alt: entry[side].alt, width: entry[side].width, height: entry[side].height
    });
    return {
        id: entry.id, order: entry.order, title: entry.title, description: entry.description,
        category: entry.category, createdAt: entry.createdAt, updatedAt: entry.updatedAt,
        visible: entry.visible, ...(admin ? { deletionPending: entry.deletionPending === true } : {}),
        before: photo('before'), after: photo('after')
    };
};
