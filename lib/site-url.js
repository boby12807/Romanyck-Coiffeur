export const getPublicOrigin = (request) => {
    const configured = process.env.PUBLIC_SITE_URL?.trim();
    if (configured) {
        try {
            const url = new URL(configured);
            if (url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash) return url.origin;
        } catch {
            // Fall through to the deployment host.
        }
    }
    if (process.env.VERCEL_ENV === 'production') return '';

    const host = String(request.headers['x-forwarded-host'] || request.headers.host || '')
        .split(',')[0]
        .trim();
    if (!host || !/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) return '';
    const local = host.startsWith('localhost') || host.startsWith('127.0.0.1');
    return `${local ? 'http' : 'https'}://${host}`;
};
