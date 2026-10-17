import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { createOperations } from '../scripts/gallery.mjs';
import { defaultRealisations } from '../lib/default-realisations.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const env = { BACKUP_ENCRYPTION_KEY: 'ab'.repeat(32), LEGACY_PUBLIC_BLOB_TOKEN: 'legacy-token' };
const uninitialised = () => {
    let entries;
    return { async all() { if (!entries) throw new Error('La galerie doit être initialisée ou migrée.'); return structuredClone(entries); },
        async initialise(values) { if (entries) throw new Error('exists'); entries = structuredClone(values); },
        async remove(entry) { entries = entries.filter((value) => value.id !== entry.id); } };
};
const mockBlob = (files = []) => {
    const values = new Map(files.map((file) => [file.pathname, file]));
    const writes = [], deletions = [];
    return { writes, deletions, values,
        async list({ prefix }) { return { blobs: [...values.values()].filter((f) => f.pathname.startsWith(prefix)), hasMore: false }; },
        async get(path, options) {
            const file = values.get(path); if (!file) return null;
            if (options.access === 'public') assert.equal(options.token, 'legacy-token');
            return { statusCode: 200, blob: { size: file.bytes.length }, stream: new ReadableStream({ start(c) { c.enqueue(file.bytes); c.close(); } }) };
        },
        async put(path, buffer, options) {
            assert.equal(options.access, 'private');
            writes.push(path); values.set(path, { pathname: path, bytes: buffer, uploadedAt: new Date() }); return { pathname: path };
        },
        async del(path, options) {
            for (const item of Array.isArray(path) ? path : [path]) { deletions.push({ path: item, options }); values.delete(item); }
        } };
};
const temporary = async (callback) => {
    const folder = await mkdtemp(resolve(root, 'test-operations-'));
    try { await callback(folder); } finally { await rm(folder, { recursive: true, force: true }); }
};
const photoBytes = () => sharp({ create: { width: 300, height: 240, channels: 3, background: '#aabbcc' } }).jpeg().withMetadata().toBuffer();
const file = (pathname, bytes) => ({ pathname, url: `https://legacy.public.blob.vercel-storage.com/${pathname}`, bytes: Buffer.from(bytes), uploadedAt: new Date(0) });

test('une sauvegarde chiffrée peut être restaurée, sans republier les images ni conserver leurs métadonnées', () => temporary(async (folder) => {
    const bytes = await photoBytes(), source = uninitialised();
    const entry = { ...structuredClone(defaultRealisations[0]), title: 'PRIVATE TITLE NOT IN ARCHIVE', visible: true };
    entry.before.storage = { kind: 'blob', path: 'realisations/media/source-before.webp' };
    entry.after.storage = { kind: 'blob', path: 'realisations/media/source-after.webp' };
    const blob = mockBlob([file(entry.before.storage.path, bytes), file(entry.after.storage.path, bytes)]);
    await source.initialise([entry, { ...entry, id: 'deleted', deleted: true }]);
    await createOperations({ store: source, blob, env, directory: folder, args: ['backup'] })();
    const [name] = await readdir(resolve(folder, 'backups')), snapshot = resolve(folder, 'backups', name);
    const encrypted = await readFile(snapshot, 'utf8');
    assert.doesNotMatch(encrypted, /PRIVATE TITLE|storage|source-before|base64/);
    const destination = uninitialised();
    await createOperations({ store: destination, blob, env, directory: folder, args: ['restore', '--file', snapshot] })();
    const restored = await destination.all(); assert.equal(restored.length, 1); assert.equal(restored[0].visible, false);
    assert.notEqual(restored[0].before.storage.path, entry.before.storage.path);
    assert.equal((await sharp(blob.values.get(restored[0].before.storage.path).bytes).metadata()).exif, undefined);
    await assert.rejects(createOperations({ store: destination, blob, env, directory: folder, args: ['restore', '--file', snapshot] })(), /cible vide/);
}));

test('une archive altérée ou une mauvaise clé est refusée avant toute écriture', () => temporary(async (folder) => {
    const source = uninitialised(); await source.initialise([]); const blob = mockBlob();
    await createOperations({ store: source, blob, env, directory: folder, args: ['backup'] })();
    const [name] = await readdir(resolve(folder, 'backups')), snapshot = resolve(folder, 'backups', name);
    await assert.rejects(createOperations({ store: uninitialised(), blob, env: { ...env, BACKUP_ENCRYPTION_KEY: 'cd'.repeat(32) }, directory: folder, args: ['restore', '--file', snapshot] })());
    const payload = JSON.parse(await readFile(snapshot, 'utf8')); payload.tag = Buffer.alloc(16).toString('base64');
    await writeFile(snapshot, JSON.stringify(payload));
    await assert.rejects(createOperations({ store: uninitialised(), blob, env, directory: folder, args: ['restore', '--file', snapshot] })());
    assert.equal(blob.writes.length, 0);
}));

test('la migration conserve les masquages et les retraits, sans réinsérer une photo initiale supprimée', () => temporary(async (folder) => {
    const bytes = await photoBytes();
    const hidden = { ...structuredClone(defaultRealisations[0]), visible: false };
    const deleted = { ...structuredClone(defaultRealisations[1]), deleted: true, visible: false };
    const uploaded = { ...structuredClone(defaultRealisations[2]), id: 'legacy-upload', visible: true };
    const before = file('realisations/media/old-before.jpg', bytes), after = file('realisations/media/old-after.jpg', bytes);
    uploaded.before.fallback = before.url; uploaded.after.fallback = after.url;
    const metadata = [hidden, deleted, uploaded].map((entry) => file(`realisations/entries/${entry.id}.json`, JSON.stringify(entry)));
    const blob = mockBlob([...metadata, before, after]), store = uninitialised();
    await createOperations({ store, blob, env, directory: folder, args: ['migrate', '--approve-photos'] })();
    const entries = await store.all();
    assert.equal(entries.find((e) => e.id === hidden.id).visible, false);
    assert.equal(entries.some((e) => e.id === deleted.id), false);
    assert.equal(entries.find((e) => e.id === uploaded.id).before.storage.kind, 'blob');
    assert.equal(blob.writes.length, 2); assert.equal(blob.deletions.length, 0);
    const [name] = await readdir(resolve(folder, 'backups')), manifest = resolve(folder, 'backups', name);
    await createOperations({ store, blob, env, directory: folder, args: ['cleanup', '--legacy', '--file', manifest] })();
    assert.equal(blob.deletions.length, 5); assert.ok(blob.deletions.every((item) => item.options.token === 'legacy-token'));
}));

test('la migration refuse une galerie existante et toute photo externe au stockage source', () => temporary(async (folder) => {
    const populated = uninitialised(); await populated.initialise([]); const blob = mockBlob();
    await assert.rejects(createOperations({ store: populated, blob, env, directory: folder, args: ['migrate', '--approve-photos'] })(), /existe déjà/);
    const entry = { ...structuredClone(defaultRealisations[0]), id: 'external' }; entry.before.fallback = 'http://169.254.169.254/secrets';
    const external = mockBlob([file('realisations/entries/external.json', JSON.stringify(entry))]);
    await assert.rejects(createOperations({ store: uninitialised(), blob: external, env, directory: folder, args: ['migrate', '--approve-photos'] })(), /stockage source/);
    assert.equal(external.writes.length, 0);
}));

test('le nettoyage conserve les fichiers référencés et les envois récents', () => temporary(async (folder) => {
    const store = uninitialised(), entry = structuredClone(defaultRealisations[0]);
    entry.before.storage = { kind: 'blob', path: 'realisations/media/kept.webp' };
    entry.after.storage = { kind: 'blob', path: 'realisations/media/pending.webp' };
    const pending = { ...entry, id: 'pending', deleted: true, deletionPending: true };
    const recent = file('realisations/media/recent.webp', 'bytes'); recent.uploadedAt = new Date();
    const blob = mockBlob([file('realisations/media/kept.webp', 'bytes'), file('realisations/media/pending.webp', 'bytes'), file('realisations/media/orphan.webp', 'bytes'), recent]);
    // Pending entry uses separate paths so another record's media is never selected for deletion.
    pending.before = { storage: { kind: 'blob', path: 'realisations/media/delete-before.webp' } };
    pending.after = { storage: { kind: 'blob', path: 'realisations/media/delete-after.webp' } };
    await store.initialise([entry, pending]);
    await createOperations({ store, blob, env, directory: folder, args: ['cleanup'] })();
    assert.ok(blob.values.has('realisations/media/kept.webp')); assert.ok(blob.values.has('realisations/media/recent.webp'));
    assert.equal(blob.values.has('realisations/media/orphan.webp'), false); assert.equal((await store.all()).length, 1);
}));

test('la restauration en production et l’initialisation des photos exigent leurs options explicites', () => temporary(async (folder) => {
    await assert.rejects(createOperations({ store: uninitialised(), env, directory: folder, args: ['seed'] })(), /approve-photos/);
    await assert.rejects(createOperations({ store: uninitialised(), env: { ...env, VERCEL_ENV: 'production' }, directory: folder, args: ['restore', '--file', 'ignored'] })(), /allow-production/);
}));
