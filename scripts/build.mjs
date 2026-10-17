import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, sep } from 'node:path';
import sharp from 'sharp';
import { defaultRealisations } from '../lib/default-realisations.js';
import { siteConfig } from '../site.config.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const escapeHtml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
export const publicOrigin = (value) => {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash
        || /(^|\.)(example|test|invalid|localhost)$/.test(url.hostname) || url.hostname.includes('votre-domaine')) {
        throw new Error('L’adresse publique doit être un domaine HTTPS valide.');
    }
    return url.origin;
};
const photoMarkup = (photo, label) => `<div class="image-container ${label === 'Avant' ? 'before-image' : 'after-image'}">
    <picture><img src="${photo.url}" alt="${escapeHtml(photo.alt)}" width="${photo.width}" height="${photo.height}" loading="lazy" decoding="async"></picture>
    <span class="image-label ${label === 'Avant' ? 'label-before' : 'label-after'}">${label}</span></div>`;
const cardMarkup = (entry) => `<article class="realisation-card" data-category="${escapeHtml(entry.category)}">
    <div class="before-after-slider" role="group" aria-label="${escapeHtml(`Comparaison avant et après : ${entry.title}`)}">
        ${photoMarkup(entry.before, 'Avant')}${photoMarkup(entry.after, 'Après')}
        <input class="slider-range" type="range" min="0" max="100" value="50" aria-label="Afficher davantage l’image avant ou après" aria-valuetext="50 % de l’image avant visible">
        <div class="slider-handle" aria-hidden="true"><div class="handle-line"></div><div class="handle-button"><span class="symbol-icon">↔</span></div><div class="handle-line"></div></div>
    </div>
    <div class="realisation-meta"><div><span class="realisation-category">${escapeHtml(entry.category)}</span><h3>${escapeHtml(entry.title)}</h3></div><p>${escapeHtml(entry.description || '')}</p></div>
</article>`;

export const buildSite = async ({ env = process.env, output = resolve(root, 'dist'), entries = defaultRealisations,
    config = siteConfig } = {}) => {
    const origin = publicOrigin(env.PUBLIC_SITE_URL || config.publicUrl);
    const preview = env.VERCEL_ENV === 'preview' || env.VERCEL_ENV === 'development';
    const supplied = [env.MEDIATOR_NAME, env.MEDIATOR_ADDRESS, env.MEDIATOR_URL];
    if (supplied.some(Boolean) && !supplied.every(Boolean)) throw new Error('Les trois coordonnées du médiateur doivent être renseignées ensemble.');
    const mediator = supplied.every(Boolean) ? { name: supplied[0], address: supplied[1], url: supplied[2] } : config.mediator;
    if (mediator) {
        const url = new URL(mediator.url);
        if (!mediator.name || !mediator.address || url.protocol !== 'https:' || url.username || url.password) throw new Error('Coordonnées du médiateur invalides.');
    }
    const target = resolve(output);
    if (target === root || !target.startsWith(`${root}${sep}`)) throw new Error('Dossier de sortie hors du projet.');
    await rm(target, { recursive: true, force: true });
    await mkdir(resolve(target, 'assets/realisations'), { recursive: true });
    const published = entries.filter((entry) => entry.visible !== false && !entry.deleted)
        .toSorted((a, b) => (a.order ?? 1000) - (b.order ?? 1000));
    const ids = new Set(), rendered = [];
    for (const entry of published) {
        if (!entry.id || ids.has(entry.id) || !entry.title || !entry.category) throw new Error('Réalisation invalide ou identifiant dupliqué.');
        ids.add(entry.id);
        const item = { ...entry };
        for (const side of ['before', 'after']) {
            const photo = entry[side];
            const source = typeof photo?.fallback === 'string' ? resolve(root, photo.fallback) : '';
            if (!photo?.alt || !source.startsWith(`${resolve(root, 'assets')}${sep}`)) throw new Error('Photo locale et texte alternatif requis.');
            const image = sharp(await readFile(source), { limitInputPixels: 16000000, failOn: 'warning' });
            const metadata = await image.metadata();
            if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages || 1) !== 1) throw new Error('Format de photo invalide.');
            const { data, info } = await image.rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
                .webp({ quality: 84 }).toBuffer({ resolveWithObject: true });
            const name = `${createHash('sha256').update(data).digest('hex').slice(0, 24)}.webp`;
            await writeFile(resolve(target, 'assets/realisations', name), data);
            item[side] = { url: `assets/realisations/${name}`, alt: photo.alt, width: info.width, height: info.height };
        }
        rendered.push(item);
    }
    const categories = [...new Set(rendered.map((entry) => entry.category))];
    const filters = categories.length > 1 ? ['Toutes', ...categories].map((label, index) =>
        `<button class="work-filter-btn${index === 0 ? ' active' : ''}" type="button" data-filter="${index === 0 ? 'all' : escapeHtml(label)}" aria-pressed="${index === 0}">${escapeHtml(label)}</button>`).join('') : '';
    const tokens = {
        PUBLIC_ORIGIN: escapeHtml(origin), GALLERY_FILTERS: filters,
        GALLERY_FILTER_CLASS: filters ? ' is-visible' : '', GALLERY_SINGLE_CLASS: rendered.length === 1 ? ' is-single' : '',
        GALLERY: rendered.length ? rendered.map(cardMarkup).join('\n') : '<p class="realisations-empty">Les nouvelles réalisations du salon seront bientôt publiées ici.</p>',
        MEDIATOR_DETAILS: mediator ? `${escapeHtml(mediator.name)} — ${escapeHtml(mediator.address)}. <a href="${escapeHtml(mediator.url)}" target="_blank" rel="noopener noreferrer">Consulter le site du médiateur</a>.`
            : 'Coordonnées de l’organisme conventionné à confirmer auprès du salon.'
    };
    for (const file of ['index.html', 'informations-legales.html']) {
        let html = await readFile(resolve(root, file), 'utf8');
        for (const [name, value] of Object.entries(tokens)) html = html.replaceAll(`{{${name}}}`, value);
        if (preview) html = html.replace(/<meta name="robots" content="[^"]*">/, '<meta name="robots" content="noindex, nofollow">');
        if (/\{\{[A-Z_]+\}\}/.test(html)) throw new Error('Un champ du site n’a pas été remplacé.');
        await writeFile(resolve(target, file), html);
    }
    // Only explicitly listed public assets; originals and server sources stay unpublished.
    for (const file of ['style.css', 'script.js', 'assets/favicon.svg', 'assets/facade_original.jpg', 'assets/products_gondola.jpg',
        'assets/products.jpg', 'assets/reception_alt.jpg', 'assets/reception.jpg', 'assets/shampoo.jpg',
        'assets/fonts/OFL-Montserrat.txt', 'assets/fonts/OFL-Cormorant-Garamond.txt',
        'assets/fonts/cormorant-garamond-italic-latin.woff2', 'assets/fonts/cormorant-garamond-latin.woff2', 'assets/fonts/montserrat-latin.woff2']) {
        await mkdir(dirname(resolve(target, file)), { recursive: true });
        await cp(resolve(root, file), resolve(target, file));
    }
    await writeFile(resolve(target, 'robots.txt'), preview ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`);
    await writeFile(resolve(target, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${escapeHtml(origin)}/</loc></url><url><loc>${escapeHtml(origin)}/informations-legales.html</loc></url></urlset>\n`);
    if (!mediator) console.warn('À compléter avec le salon : coordonnées du médiateur conventionné (site.config.js).');
    return target;
};
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    buildSite().then(() => console.log('Site vitrine généré.')).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
