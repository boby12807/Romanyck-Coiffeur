import nodemailer from 'nodemailer';

const DESTINATION_EMAIL = 'romanyckj@gmail.com';
const MAX_MESSAGE_LENGTH = 800;

const cleanText = (value, maximumLength) => (
    typeof value === 'string'
        ? value.trim().replace(/\s+/g, ' ').slice(0, maximumLength)
        : ''
);

const escapeHtml = (value) => value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const readBody = (request) => {
    if (request.body && typeof request.body === 'object') return request.body;
    if (typeof request.body === 'string') {
        try {
            return JSON.parse(request.body);
        } catch {
            return {};
        }
    }
    return {};
};

export default async function handler(request, response) {
    response.setHeader('Cache-Control', 'no-store');

    if (request.method !== 'POST') {
        response.setHeader('Allow', 'POST');
        return response.status(405).json({ error: 'Méthode non autorisée.' });
    }

    const body = readBody(request);
    if (body.website) return response.status(200).json({ success: true });

    const data = {
        name: cleanText(body.client_name, 80),
        phone: cleanText(body.phone, 30),
        email: cleanText(body.email, 120),
        service: cleanText(body.service, 80),
        preferredDate: cleanText(body.preferred_date, 20),
        message: cleanText(body.message, MAX_MESSAGE_LENGTH)
    };

    if (!data.name || !data.phone || !data.service || !data.preferredDate) {
        return response.status(400).json({ error: 'Informations obligatoires manquantes.' });
    }

    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        return response.status(400).json({ error: 'Adresse e-mail invalide.' });
    }

    const gmailUser = process.env.GMAIL_USER || DESTINATION_EMAIL;
    const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;
    if (!gmailAppPassword) {
        return response.status(503).json({
            error: "L'envoi des rendez-vous n'est pas encore configuré sur Vercel."
        });
    }

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: gmailUser,
            pass: gmailAppPassword
        }
    });

    const plainMessage = [
        'Nouvelle demande de rendez-vous depuis le site Romanyck Coiffure',
        '',
        `Nom : ${data.name}`,
        `Téléphone : ${data.phone}`,
        `E-mail : ${data.email || 'Non renseignée'}`,
        `Prestation : ${data.service}`,
        `Date souhaitée : ${data.preferredDate}`,
        `Projet : ${data.message || 'Non renseigné'}`
    ].join('\n');

    const htmlMessage = `
        <h1>Nouvelle demande de rendez-vous</h1>
        <p><strong>Nom :</strong> ${escapeHtml(data.name)}</p>
        <p><strong>Téléphone :</strong> ${escapeHtml(data.phone)}</p>
        <p><strong>E-mail :</strong> ${escapeHtml(data.email || 'Non renseignée')}</p>
        <p><strong>Prestation :</strong> ${escapeHtml(data.service)}</p>
        <p><strong>Date souhaitée :</strong> ${escapeHtml(data.preferredDate)}</p>
        <p><strong>Projet :</strong> ${escapeHtml(data.message || 'Non renseigné')}</p>
    `;

    try {
        await transporter.sendMail({
            from: `"Site Romanyck Coiffure" <${gmailUser}>`,
            to: DESTINATION_EMAIL,
            replyTo: data.email || undefined,
            subject: `Rendez-vous — ${data.name} — ${data.preferredDate}`,
            text: plainMessage,
            html: htmlMessage
        });

        return response.status(200).json({ success: true });
    } catch (error) {
        console.error('Erreur lors de l’envoi du rendez-vous', error);
        return response.status(502).json({ error: "L'e-mail n'a pas pu être envoyé." });
    }
}
