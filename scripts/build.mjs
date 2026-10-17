import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const escapeHtml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll("'", '&#39;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
export const publicOrigin = (value) => {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash
        || /(^|\.)(example|test|invalid|localhost)$/.test(url.hostname) || url.hostname.includes('votre-domaine')) throw new Error('PUBLIC_SITE_URL doit être le domaine HTTPS définitif.');
    return url.origin;
};
export const buildSite = async ({ env = process.env, output = resolve(root, 'dist') } = {}) => {
    const production = env.VERCEL_ENV === 'production';
    const origin = env.PUBLIC_SITE_URL ? publicOrigin(env.PUBLIC_SITE_URL) : production ? '' : 'http://localhost:3000';
    if (!origin) throw new Error('PUBLIC_SITE_URL manque pour la production.');
    if (production) {
        if ((env.ADMIN_UPLOAD_PASSWORD?.length || 0) < 16 || (env.ADMIN_SESSION_SECRET?.length || 0) < 32
            || env.ADMIN_UPLOAD_PASSWORD === env.ADMIN_SESSION_SECRET) throw new Error('Définissez un mot de passe de 16 caractères minimum et un secret aléatoire distinct de 32 caractères minimum.');
        // Connected stores use Vercel's short-lived OIDC identity by default.
        // The SDK resolves the runtime request token; a long-lived token is optional.
        const blobConfigured = env.BLOB_READ_WRITE_TOKEN
            || (env.BLOB_STORE_ID && (env.VERCEL_OIDC_TOKEN || env.VERCEL === '1'));
        if (!blobConfigured) throw new Error('Connectez un stockage Blob privé (BLOB_STORE_ID sur Vercel), ou définissez BLOB_READ_WRITE_TOKEN.');
        for (const name of ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) {
            if (!env[name]) throw new Error(`${name} manque pour la production.`);
        }
    }
    const mediator = { name: env.MEDIATOR_NAME?.trim(), address: env.MEDIATOR_ADDRESS?.trim(), url: env.MEDIATOR_URL?.trim() };
    if (production && (!mediator.name || !mediator.address || !mediator.url)) throw new Error('Renseignez les coordonnées du médiateur conventionné avant la production.');
    if (mediator.url) {
        const url = new URL(mediator.url);
        if (url.protocol !== 'https:' || url.username || url.password) throw new Error('MEDIATOR_URL doit être une URL HTTPS.');
    }
    // The only directory removed by a build is its explicit output directory.
    const target = resolve(output);
    if (target === root || !target.startsWith(`${root}\\`) && !target.startsWith(`${root}/`)) throw new Error('Dossier de sortie hors du projet.');
    await rm(target, { recursive: true, force: true });
    await mkdir(target, { recursive: true });
    const tokens = {
        PUBLIC_ORIGIN: origin,
        MEDIATOR_NAME: mediator.name || 'Médiateur à confirmer avant ouverture au public',
        MEDIATOR_ADDRESS: mediator.address || 'Coordonnées en cours de confirmation',
        MEDIATOR_URL: mediator.url || '#mediation'
    };
    for (const file of ['index.html', 'admin.html', 'informations-legales.html']) {
        let html = await readFile(resolve(root, file), 'utf8');
        for (const [name, value] of Object.entries(tokens)) html = html.replaceAll(`{{${name}}}`, escapeHtml(value));
        if (!production) html = html.replace(/<meta name="robots" content="[^"]*">/, '<meta name="robots" content="noindex, nofollow">');
        await writeFile(resolve(target, file), html);
    }
    // Explicit allowlist excludes all gallery images, source files and secrets.
    for (const file of ['style.css', 'script.js', 'admin.js', 'assets/favicon.svg', 'assets/facade_original.jpg',
        'assets/products_gondola.jpg', 'assets/products.jpg', 'assets/reception_alt.jpg', 'assets/reception.jpg', 'assets/shampoo.jpg',
        'assets/fonts/OFL-Montserrat.txt', 'assets/fonts/OFL-Cormorant-Garamond.txt',
        'assets/fonts/cormorant-garamond-italic-latin.woff2', 'assets/fonts/cormorant-garamond-latin.woff2', 'assets/fonts/montserrat-latin.woff2']) {
        await mkdir(dirname(resolve(target, file)), { recursive: true });
        await cp(resolve(root, file), resolve(target, file));
    }
    return target;
};
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    buildSite().then(() => console.log('Fichiers publics préparés.')).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
