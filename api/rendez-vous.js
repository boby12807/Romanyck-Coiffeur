import nodemailer from 'nodemailer';
import {
    cleanText,
    consumeRateLimit,
    getClientIp,
    isSameOrigin,
    parseDataImage,
    readBody,
    setSecurityHeaders
} from '../lib/security.js';

const DESTINATION_EMAIL = 'romanyckj@gmail.com';
const MAX_MESSAGE_LENGTH = 800;
const SERVICES = new Map([
    ['femme-coupe', 'Coupe & coiffage femme'],
    ['homme-coupe', 'Coupe homme'],
    ['coloration-balayage', 'Coloration / balayage'],
    ['soin', 'Soin'],
    ['diagnostic', 'Diagnostic / conseil']
]);

const escapeHtml = (value) => value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const parisDate = () => {
    const parts = new Intl.DateTimeFormat('fr-FR', {
        timeZone: 'Europe/Paris',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
};

const validPreferredDate = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < parisDate()) return false;
    const date = new Date(`${value}T12:00:00Z`);
    if (Number.isNaN(date.getTime())) return false;
    const maximum = new Date();
    maximum.setUTCFullYear(maximum.getUTCFullYear() + 1);
    if (date > maximum) return false;
    const day = date.getUTCDay();
    return day !== 0 && day !== 1;
};

export default async function handler(request, response) {
    setSecurityHeaders(response);

    if (request.method !== 'POST') {
        response.setHeader('Allow', 'POST');
        return response.status(405).json({ error: 'Méthode non autorisée.' });
    }
    if (!isSameOrigin(request)) {
        return response.status(403).json({ error: 'Origine de la demande refusée.' });
    }

    const rate = consumeRateLimit('booking', getClientIp(request), 5, 10 * 60 * 1000);
    if (!rate.allowed) {
        response.setHeader('Retry-After', String(rate.retryAfter));
        return response.status(429).json({ error: 'Trop de demandes rapprochées. Réessayez dans quelques minutes.' });
    }

    const body = readBody(request);
    if (body.website) return response.status(200).json({ success: true });

    const startedAt = Number(body.form_started_at);
    const elapsed = Date.now() - startedAt;
    if (!Number.isFinite(startedAt) || elapsed < 1500 || elapsed > 24 * 60 * 60 * 1000) {
        return response.status(400).json({ error: 'Veuillez actualiser la page puis recommencer votre demande.' });
    }

    const serviceCode = cleanText(body.service, 80);
    const data = {
        name: cleanText(body.client_name, 80),
        phone: cleanText(body.phone, 30),
        email: cleanText(body.email, 120),
        service: SERVICES.get(serviceCode) || '',
        preferredDate: cleanText(body.preferred_date, 20),
        message: cleanText(body.message, MAX_MESSAGE_LENGTH)
    };

    const phoneDigits = data.phone.replace(/\D/g, '');
    if (!data.name || phoneDigits.length < 10 || phoneDigits.length > 15 || !data.service || !validPreferredDate(data.preferredDate)) {
        return response.status(400).json({ error: 'Nom, téléphone, prestation ou date invalide.' });
    }
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        return response.status(400).json({ error: 'Adresse e-mail invalide.' });
    }

    let projectPhoto = null;
    if (body.project_photo?.dataUrl) {
        const width = Number(body.project_photo.width);
        const height = Number(body.project_photo.height);
        projectPhoto = parseDataImage(body.project_photo.dataUrl, 900_000);
        if (!projectPhoto || !Number.isFinite(width) || !Number.isFinite(height) || width < 100 || height < 100 || width > 2000 || height > 2000) {
            return response.status(400).json({ error: "La photo d’inspiration est invalide." });
        }
    }

    const gmailUser = process.env.GMAIL_USER || DESTINATION_EMAIL;
    const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;
    if (!gmailAppPassword) {
        return response.status(503).json({ error: "L'envoi des rendez-vous n'est pas encore configuré sur Vercel." });
    }

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: gmailUser, pass: gmailAppPassword }
    });

    const plainMessage = [
        'Nouvelle demande de rendez-vous depuis le site Romanyck Coiffure',
        '',
        `Nom : ${data.name}`,
        `Téléphone : ${data.phone}`,
        `E-mail : ${data.email || 'Non renseignée'}`,
        `Prestation : ${data.service}`,
        `Date souhaitée : ${data.preferredDate}`,
        `Projet : ${data.message || 'Non renseigné'}`,
        `Photo d’inspiration : ${projectPhoto ? 'Jointe à cet e-mail' : 'Non renseignée'}`
    ].join('\n');

    const htmlMessage = `
        <h1>Nouvelle demande de rendez-vous</h1>
        <p><strong>Nom :</strong> ${escapeHtml(data.name)}</p>
        <p><strong>Téléphone :</strong> ${escapeHtml(data.phone)}</p>
        <p><strong>E-mail :</strong> ${escapeHtml(data.email || 'Non renseignée')}</p>
        <p><strong>Prestation :</strong> ${escapeHtml(data.service)}</p>
        <p><strong>Date souhaitée :</strong> ${escapeHtml(data.preferredDate)}</p>
        <p><strong>Projet :</strong> ${escapeHtml(data.message || 'Non renseigné')}</p>
        <p><strong>Photo d’inspiration :</strong> ${projectPhoto ? 'Jointe à cet e-mail' : 'Non renseignée'}</p>
    `;

    const attachments = projectPhoto ? [{
        filename: `inspiration-${data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'client'}.${projectPhoto.extension}`,
        content: projectPhoto.buffer,
        contentType: projectPhoto.contentType
    }] : [];

    try {
        await transporter.sendMail({
            from: `"Site Romanyck Coiffure" <${gmailUser}>`,
            to: DESTINATION_EMAIL,
            replyTo: data.email || undefined,
            subject: `Rendez-vous — ${data.name} — ${data.preferredDate}`,
            text: plainMessage,
            html: htmlMessage,
            attachments
        });

        let confirmationSent = false;
        if (data.email) {
            try {
                await transporter.sendMail({
                    from: `"Romanyck Coiffure" <${gmailUser}>`,
                    to: data.email,
                    subject: 'Votre demande a bien été reçue — Romanyck Coiffure',
                    text: `Bonjour ${data.name},\n\nVotre demande pour « ${data.service} » le ${data.preferredDate} a bien été reçue. Le salon vous recontactera pour confirmer le créneau.\n\nRomanyck Coiffure\n04 78 60 46 21`,
                    html: `<p>Bonjour ${escapeHtml(data.name)},</p><p>Votre demande pour <strong>${escapeHtml(data.service)}</strong> le <strong>${escapeHtml(data.preferredDate)}</strong> a bien été reçue.</p><p>Le salon vous recontactera pour confirmer le créneau.</p><p>Romanyck Coiffure<br>04 78 60 46 21</p>`
                });
                confirmationSent = true;
            } catch (confirmationError) {
                console.error('Accusé de réception client non envoyé', confirmationError);
            }
        }

        return response.status(200).json({ success: true, confirmationSent });
    } catch (error) {
        console.error('Erreur lors de l’envoi du rendez-vous', error);
        return response.status(502).json({ error: "L'e-mail n'a pas pu être envoyé." });
    }
}
