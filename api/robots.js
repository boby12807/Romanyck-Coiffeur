import { setSecurityHeaders } from '../lib/security.js';
import { getPublicOrigin } from '../lib/site-url.js';

export default function handler(request, response) {
    setSecurityHeaders(response);
    if (request.method !== 'GET') {
        response.setHeader('Allow', 'GET');
        return response.status(405).send('Méthode non autorisée.');
    }

    const origin = getPublicOrigin(request);
    if (!origin) return response.status(503).send('URL publique indisponible.');

    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600');
    return response.status(200).send(`User-agent: *
Allow: /
Disallow: /admin.html
Disallow: /api/

Sitemap: ${origin}/sitemap.xml
`);
}
