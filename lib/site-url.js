export const getPublicOrigin = (request) => {
    const configured = process.env.PUBLIC_SITE_URL?.trim();
    if (configured) {
        try {
            const url = new URL(configured);
            if (url.protocol === 'https:') return url.origin;
        } catch {
            // Fall through to the deployment host.
        }
    }

    const host = String(request.headers['x-forwarded-host'] || request.headers.host || '')
        .split(',')[0]
        .trim();
    if (!host || !/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) return '';
    const local = host.startsWith('localhost') || host.startsWith('127.0.0.1');
    return `${local ? 'http' : 'https'}://${host}`;
};
