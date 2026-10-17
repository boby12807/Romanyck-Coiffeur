import sharp from 'sharp';
import { parseDataImage } from './security.js';

export const MAX_SINGLE_IMAGE_BYTES = 1_500_000;
export const normaliseImage = async (dataUrl) => {
    const parsed = parseDataImage(dataUrl, MAX_SINGLE_IMAGE_BYTES);
    if (!parsed) throw new Error('Photo invalide ou trop lourde.');
    return normaliseBuffer(parsed.buffer);
};
export const normaliseBuffer = async (buffer) => {
    const image = sharp(buffer, { limitInputPixels: 16_000_000, failOn: 'warning' });
    const metadata = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages || 1) !== 1
        || metadata.width < 200 || metadata.height < 200 || metadata.width > 4000 || metadata.height > 4000) {
        throw new Error('Utilisez une photo JPEG, PNG ou WebP de 200 à 4000 pixels par côté, sans animation.');
    }
    // Full decoding rejects corrupt data; re-encoding removes EXIF/GPS.
    const { data, info } = await image.rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
    if (data.length > MAX_SINGLE_IMAGE_BYTES) throw new Error('La photo reste trop lourde après préparation.');
    return { buffer: data, contentType: 'image/webp', extension: 'webp', width: info.width, height: info.height };
};
