import { setSecurityHeaders } from '../lib/security.js';
import { getPublicOrigin } from '../lib/site-url.js';

const escapeXml = (value) => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

export default function handler(request, response) {
    setSecurityHeaders(response);
    if (request.method !== 'GET') {
        response.setHeader('Allow', 'GET');
        return response.status(405).send('Méthode non autorisée.');
    }

    const origin = getPublicOrigin(request);
    if (!origin) return response.status(503).send('URL publique indisponible.');

    const pages = [
        { path: '/', priority: '1.0', frequency: 'weekly' },
        { path: '/informations-legales.html', priority: '0.3', frequency: 'yearly' }
    ];
    const urls = pages.map((page) => `
    <url>
        <loc>${escapeXml(`${origin}${page.path}`)}</loc>
        <changefreq>${page.frequency}</changefreq>
        <priority>${page.priority}</priority>
    </url>`).join('');

    response.setHeader('Content-Type', 'application/xml; charset=utf-8');
    response.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600');
    return response.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}
</urlset>`);
}
