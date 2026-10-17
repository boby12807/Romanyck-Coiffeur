import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { del, get, list, put } from '@vercel/blob';
import { createGalleryStore } from '../lib/gallery-store.js';
import { namespace } from '../lib/store.js';
import { defaultRealisations } from '../lib/default-realisations.js';
import { normaliseBuffer } from '../lib/images.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultBlob = { del, get, list, put };
export const createOperations = ({ store = createGalleryStore(), blob = defaultBlob, env = process.env,
    args = process.argv.slice(2), directory = projectRoot } = {}) => {
    const root = directory;
    const { del, get, list, put } = blob;
    const command = args[0];
    const has = (flag) => args.includes(flag);
    const argument = (flag) => args[args.indexOf(flag) + 1];
    const oldToken = () => {
        if (!env.LEGACY_PUBLIC_BLOB_TOKEN) throw new Error('LEGACY_PUBLIC_BLOB_TOKEN manque. Ne remplacez pas le jeton du nouveau stockage privé.');
        return env.LEGACY_PUBLIC_BLOB_TOKEN;
    };
    const backupKey = () => {
        if (!/^[a-f0-9]{64}$/i.test(env.BACKUP_ENCRYPTION_KEY || '')) throw new Error('BACKUP_ENCRYPTION_KEY doit contenir 32 octets aléatoires en hexadécimal (64 caractères).');
        return Buffer.from(env.BACKUP_ENCRYPTION_KEY, 'hex');
    };
    const encrypt = (data) => {
        const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', backupKey(), iv);
        const encrypted = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final()]);
        return JSON.stringify({ version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: encrypted.toString('base64') });
    };
    const decrypt = (raw) => {
        const payload = JSON.parse(raw);
        if (payload.version !== 1) throw new Error('Format de sauvegarde inconnu.');
        const decipher = createDecipheriv('aes-256-gcm', backupKey(), Buffer.from(payload.iv, 'base64'));
        decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
        return JSON.parse(Buffer.concat([decipher.update(Buffer.from(payload.data, 'base64')), decipher.final()]).toString());
    };
    const saveBackup = async (payload, suffix) => {
        const folder = resolve(root, 'backups');
        await mkdir(folder, { recursive: true });
        const file = resolve(folder, `${Date.now()}-${suffix}.encrypted.json`);
        await writeFile(file, encrypt(payload), { mode: 0o600, flag: 'wx' });
        console.log(`Sauvegarde chiffrée : ${file}`);
        return file;
    };
    const listAll = async (prefix, token) => {
        const blobs = []; let cursor, more;
        do {
            const page = await list({ prefix, token, cursor, limit: 100, abortSignal: AbortSignal.timeout(10000) });
            blobs.push(...page.blobs); more = page.hasMore; cursor = page.cursor;
            if (more && !cursor) throw new Error('Pagination incomplète.');
            if (blobs.length > 5000) throw new Error('Trop de fichiers : intervention manuelle nécessaire.');
        } while (more);
        return blobs;
    };
    const download = async (path, access, token) => {
        const result = await get(path, { access, token, useCache: false, abortSignal: AbortSignal.timeout(10000) });
        if (!result || result.statusCode !== 200 || result.blob.size > 16000000) throw new Error('Fichier inaccessible ou trop volumineux.');
        return Buffer.from(await new Response(result.stream).arrayBuffer());
    };
    const bundled = (entry) => ({ ...entry, before: { ...entry.before, storage: { kind: 'bundled', path: entry.before.fallback } },
        after: { ...entry.after, storage: { kind: 'bundled', path: entry.after.fallback } } });
    const importPhoto = async (buffer, id, side) => {
        const image = await normaliseBuffer(buffer);
        const result = await put(`realisations/media/${id}-${side}.webp`, image.buffer, {
            access: 'private', contentType: image.contentType, addRandomSuffix: false, abortSignal: AbortSignal.timeout(10000)
        });
        return { storage: { kind: 'blob', path: result.pathname }, width: image.width, height: image.height };
    };

    async function main() {
        if (command === 'seed') {
            if (!has('--approve-photos')) throw new Error('Vérifiez les autorisations des photos initiales, puis ajoutez --approve-photos. Pour une galerie vide : --empty --approve-photos.');
            await store.initialise(has('--empty') ? [] : defaultRealisations.map(bundled));
            console.log('Galerie initialisée. Une initialisation ultérieure ne pourra pas réintroduire des photos retirées.');
        } else if (command === 'migrate') {
            if (!has('--approve-photos')) throw new Error('Vérifiez les autorisations avant migration, puis ajoutez --approve-photos.');
            backupKey();
            // Refuse migration into an existing gallery before uploading anything.
            try { await store.all(); throw new Error('Une galerie existe déjà.'); }
            catch (error) { if (error.message !== 'La galerie doit être initialisée ou migrée.') throw error; }
            const metadata = await listAll('realisations/entries/', oldToken());
            const oldMedia = await listAll('realisations/media/', oldToken());
            const legacy = [];
            for (const file of metadata) {
                const entry = JSON.parse((await download(file.pathname, 'public', oldToken())).toString());
                legacy.push({ metadataPath: file.pathname, entry });
            }
            const replacements = new Set(legacy.map(({ entry }) => entry.id));
            const entries = defaultRealisations.filter((entry) => !replacements.has(entry.id)).map(bundled);
            const cleanup = [];
            for (const { entry: original, metadataPath } of legacy) {
                const entry = { ...original, category: original.category === 'Couleur' ? 'Coloration' : original.category };
                const id = `${Date.now()}-${randomUUID()}`;
                if (entry.deleted) {
                    cleanup.push(metadataPath, ...oldMedia.filter((file) => [entry.before?.fallback, entry.after?.fallback].includes(file.url)).map((file) => file.pathname));
                    continue;
                }
                for (const side of ['before', 'after']) {
                    const photo = entry[side];
                    const local = defaultRealisations.flatMap((e) => [e.before, e.after]).find((p) => p.fallback === photo?.fallback);
                    if (local) entry[side] = { ...local, storage: { kind: 'bundled', path: local.fallback } };
                    else {
                        // Never fetch arbitrary URLs from metadata. Match only the connected legacy store's list.
                        const file = oldMedia.find((item) => item.url === photo?.fallback);
                        if (!file) throw new Error('Photo ancienne introuvable dans le stockage source.');
                        const bytes = await download(file.pathname, 'public', oldToken());
                        if (!entry.deleted) entry[side] = { ...await importPhoto(bytes, id, side), alt: photo.alt };
                        cleanup.push(file.pathname);
                    }
                    delete entry[side]?.fallback;
                    delete entry[side]?.webp;
                }
                cleanup.push(metadataPath);
                if (!entry.deleted) entries.push(entry);
            }
            // Preserve original visibility; never restore a tombstone as an initial photo.
            const manifest = { type: 'legacy-migration', targetNamespace: namespace(env), createdAt: new Date().toISOString(), cleanup: [...new Set(cleanup)], legacy, entries };
            await saveBackup(manifest, 'migration');
            await store.initialise(entries);
            console.log('Migration privée enregistrée. Testez le nouveau site, puis utilisez cleanup --legacy --file avec le manifeste pour supprimer les anciennes URL publiques.');
        } else if (command === 'backup') {
            backupKey();
            const entries = await store.all(), media = {};
            for (const entry of entries.filter((e) => !e.deleted)) {
                for (const side of ['before', 'after']) {
                    const storage = entry[side].storage;
                    const bytes = storage.kind === 'bundled' ? await readFile(resolve(root, storage.path)) : await download(storage.path, 'private');
                    media[`${entry.id}/${side}`] = bytes.toString('base64');
                }
            }
            await saveBackup({ type: 'gallery-backup', createdAt: new Date().toISOString(), entries, media }, 'gallery');
        } else if (command === 'restore') {
            if (!has('--file')) throw new Error('Indiquez --file chemin-de-la-sauvegarde.');
            if (env.VERCEL_ENV === 'production' && !has('--allow-production')) throw new Error('Testez d’abord la restauration dans une base et un stockage de test distincts ; --allow-production requis ensuite.');
            const snapshot = decrypt(await readFile(resolve(argument('--file')), 'utf8'));
            if (snapshot.type !== 'gallery-backup') throw new Error('Utilisez une sauvegarde complète de galerie.');
            try { await store.all(); throw new Error('La restauration exige une galerie cible vide, sans écraser les retraits actuels.'); }
            catch (error) { if (error.message !== 'La galerie doit être initialisée ou migrée.') throw error; }
            const entries = [];
            for (const old of snapshot.entries.filter((entry) => !entry.deleted)) {
                const entry = { ...old, visible: false, deletionPending: false, updatedAt: new Date().toISOString() };
                const mediaId = `${Date.now()}-${randomUUID()}`;
                for (const side of ['before', 'after']) entry[side] = { ...await importPhoto(Buffer.from(snapshot.media[`${old.id}/${side}`], 'base64'), mediaId, side), alt: old[side].alt };
                entries.push(entry);
            }
            await store.initialise(entries);
            console.log('Restauration terminée, toutes les photos sont masquées. Vérifiez les retraits et autorisations avant chaque republication.');
        } else if (command === 'cleanup') {
            if (has('--legacy')) {
                if (!has('--file')) throw new Error('Indiquez le manifeste chiffré de migration avec --file.');
                const manifest = decrypt(await readFile(resolve(argument('--file')), 'utf8'));
                if (manifest.type !== 'legacy-migration' || manifest.targetNamespace !== namespace(env)) throw new Error('Manifeste de migration de cet environnement requis.');
                // Ensure migrated records still exist, or were explicitly deleted, using the initialized target index.
                await store.all();
                for (const path of manifest.cleanup) {
                    if (!/^realisations\/(entries|media)\/[a-zA-Z0-9_.-]+$/.test(path)) throw new Error('Chemin source inattendu.');
                    await del(path, { token: oldToken(), abortSignal: AbortSignal.timeout(10000) });
                }
                console.log('Anciennes photos et fiches publiques supprimées du stockage source. Contrôlez aussi les anciens déploiements et les caches.');
            } else {
                const entries = await store.all();
                for (const entry of entries.filter((e) => e.deletionPending)) {
                    const paths = [entry.before, entry.after].filter((p) => p.storage.kind === 'blob').map((p) => p.storage.path);
                    if (paths.length) await del(paths, { abortSignal: AbortSignal.timeout(10000) });
                    await store.remove(entry);
                }
                // Clean orphan uploads older than 24h only, to avoid deleting an in-flight upload.
                const referenced = new Set(entries.flatMap((e) => [e.before?.storage?.path, e.after?.storage?.path]));
                for (const file of await listAll('realisations/media/')) {
                    if (!referenced.has(file.pathname) && new Date(file.uploadedAt).getTime() < Date.now() - 86400000) {
                        await del(file.pathname, { abortSignal: AbortSignal.timeout(10000) });
                    }
                }
                console.log('Suppressions en attente et fichiers orphelins traités.');
            }
        } else throw new Error('Commandes : seed, migrate, backup, restore, cleanup. Charger les variables de l’environnement cible avant exécution.');
    }
    return main;
};
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    createOperations()().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
