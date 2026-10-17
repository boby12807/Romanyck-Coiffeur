import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { buildSite } from '../scripts/build.mjs';
import { defaultRealisations } from '../lib/default-realisations.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = async (callback) => {
    const folder = await mkdtemp(resolve(root, 'test-static-'));
    try { await callback(folder); } finally { await rm(folder, { recursive: true, force: true }); }
};
test('le site production fonctionne sans secrets, API ou services externes et affiche ses quatre réalisations dans le HTML', () => temporary(async (output) => {
    await buildSite({ output, env: { VERCEL_ENV: 'production' } });
    const html = await readFile(resolve(output, 'index.html'), 'utf8');
    assert.equal((html.match(/class="realisation-card"/g) || []).length, 4);
    assert.equal((html.match(/class="slider-range"/g) || []).length, 4);
    assert.match(html, /rel="canonical" href="https:\/\/romanyck-coiffeur-five.vercel.app\/"/);
    assert.doesNotMatch(html, /Chargement des réalisations|\{\{|\/api\//);
    const script = await readFile(resolve(output, 'script.js'), 'utf8');
    assert.doesNotMatch(script, /fetch\(|XMLHttpRequest|fallbackData|localStorage|sessionStorage|document\.cookie/);
    assert.match(await readFile(resolve(output, 'robots.txt'), 'utf8'), /Allow: \//);
}));
test('le dossier public ne contient ni administration, ni sources serveur, ni photos originales', () => temporary(async (output) => {
    await buildSite({ output, env: {} });
    for (const path of ['api', 'admin.html', 'admin.js', 'lib', 'scripts', '.env', 'site.config.js', 'package.json',
        'assets/realisations/coupe-blond-before.jpg', 'assets/balayage_before.jpg', 'assets/balayage_after.webp']) {
        await assert.rejects(stat(resolve(output, path)), { code: 'ENOENT' });
    }
    const images = await readdir(resolve(output, 'assets/realisations'));
    assert.equal(images.length, 8);
    for (const image of images) {
        assert.match(image, /^[a-f0-9]{24}\.webp$/);
        const metadata = await sharp(await readFile(resolve(output, 'assets/realisations', image))).metadata();
        assert.equal(metadata.format, 'webp'); assert.equal(metadata.exif, undefined);
        assert.ok(metadata.width <= 1600 && metadata.height <= 1600);
    }
}));
test('reconstruire après retrait efface les images et le texte de la réalisation retirée, sans secours automatique', () => temporary(async (output) => {
    await buildSite({ output, env: {}, entries: [defaultRealisations[0]] });
    const [oldImage] = await readdir(resolve(output, 'assets/realisations'));
    await writeFile(resolve(output, 'obsolete-file.txt'), 'old build');
    await buildSite({ output, env: {}, entries: [] });
    assert.deepEqual(await readdir(resolve(output, 'assets/realisations')), []);
    await assert.rejects(stat(resolve(output, 'assets/realisations', oldImage)), { code: 'ENOENT' });
    await assert.rejects(stat(resolve(output, 'obsolete-file.txt')), { code: 'ENOENT' });
    const html = await readFile(resolve(output, 'index.html'), 'utf8');
    assert.doesNotMatch(html, /Coupe &amp; blond fondu|class="realisation-card"/);
}));
test('les réalisations masquées ou supprimées ne publient aucun de leurs fichiers', () => temporary(async (output) => {
    await buildSite({ output, env: {}, entries: [{ ...defaultRealisations[0], visible: false }, { ...defaultRealisations[1], deleted: true }] });
    assert.deepEqual(await readdir(resolve(output, 'assets/realisations')), []);
}));
test('les textes de galerie et les coordonnées du médiateur sont échappés dans le HTML', () => temporary(async (output) => {
    const entry = { ...defaultRealisations[0], title: '<script>alert(1)</script>', category: 'Coupe" onmouseover="alert(1)', description: '<img src=x onerror=alert(1)>' };
    await buildSite({ output, env: { MEDIATOR_NAME: '<Médiateur>', MEDIATOR_ADDRESS: 'Adresse & test', MEDIATOR_URL: 'https://mediateur.fr/' }, entries: [entry] });
    const html = await readFile(resolve(output, 'index.html'), 'utf8');
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/); assert.doesNotMatch(html, /<script>alert|<img src=x/);
    const legal = await readFile(resolve(output, 'informations-legales.html'), 'utf8');
    assert.match(legal, /&lt;Médiateur&gt;/); assert.match(legal, /Adresse &amp; test/);
    assert.doesNotMatch(legal, /Upstash|Redis|romanyck_admin|session signée|8 heures/);
}));
test('les prévisualisations sont non indexables et le sitemap utilise l’adresse conservée', () => temporary(async (output) => {
    await buildSite({ output, env: { VERCEL_ENV: 'preview' }, entries: [] });
    assert.match(await readFile(resolve(output, 'index.html'), 'utf8'), /content="noindex, nofollow"/);
    assert.equal(await readFile(resolve(output, 'robots.txt'), 'utf8'), 'User-agent: *\nDisallow: /\n');
    const sitemap = await readFile(resolve(output, 'sitemap.xml'), 'utf8');
    assert.match(sitemap, /https:\/\/romanyck-coiffeur-five.vercel.app\/informations-legales.html/);
    assert.doesNotMatch(sitemap, /admin|api/);
}));
test('une source de photo hors du dossier images, un doublon ou un fichier corrompu bloque la publication', () => temporary(async (output) => {
    await assert.rejects(buildSite({ output, env: {}, entries: [{ ...defaultRealisations[0], before: { fallback: '../secret.jpg', alt: 'test' } }] }), /Photo locale/);
    await assert.rejects(buildSite({ output, env: {}, entries: [defaultRealisations[0], defaultRealisations[0]] }), /identifiant dupliqué/);
    await assert.rejects(buildSite({ output, env: {}, entries: [{ ...defaultRealisations[0], before: { fallback: 'assets/favicon.svg', alt: 'test' } }] }), /Format de photo/);
    await assert.rejects(buildSite({ output, env: { PUBLIC_SITE_URL: 'javascript:alert(1)' } }), /adresse publique/);
}));
