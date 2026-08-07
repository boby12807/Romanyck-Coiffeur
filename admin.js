document.documentElement.classList.add('js');

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('realisationUploadForm');
    const status = document.getElementById('uploadStatus');
    const submitButton = document.getElementById('uploadButton');
    const beforeInput = document.getElementById('beforePhoto');
    const afterInput = document.getElementById('afterPhoto');
    const MAX_JSON_LENGTH = 3_800_000;

    const previewUrls = new Map();

    const setStatus = (message, type = '') => {
        status.textContent = message;
        status.className = `form-status${type ? ` is-${type}` : ''}`;
        status.focus({ preventScroll: true });
    };

    const updatePreview = (input, imageId, placeholderId, label) => {
        const image = document.getElementById(imageId);
        const placeholder = document.getElementById(placeholderId);
        const previousUrl = previewUrls.get(input.id);
        if (previousUrl) URL.revokeObjectURL(previousUrl);

        const file = input.files?.[0];
        if (!file) {
            image.hidden = true;
            image.removeAttribute('src');
            placeholder.hidden = false;
            return;
        }

        const url = URL.createObjectURL(file);
        previewUrls.set(input.id, url);
        image.src = url;
        image.alt = `Aperçu de la photo ${label}`;
        image.hidden = false;
        placeholder.hidden = true;
    };

    beforeInput.addEventListener('change', () => {
        updatePreview(beforeInput, 'beforePreview', 'beforePlaceholder', 'avant');
    });
    afterInput.addEventListener('change', () => {
        updatePreview(afterInput, 'afterPreview', 'afterPlaceholder', 'après');
    });

    const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener('load', () => resolve(reader.result));
        reader.addEventListener('error', () => reject(reader.error));
        reader.readAsDataURL(blob);
    });

    const optimiseImage = async (file, maxEdge, quality) => {
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext('2d', { alpha: false });
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        context.drawImage(bitmap, 0, 0, width, height);
        bitmap.close();

        const blob = await new Promise((resolve, reject) => {
            canvas.toBlob(
                (result) => result ? resolve(result) : reject(new Error("L'image n'a pas pu être préparée.")),
                'image/webp',
                quality
            );
        });

        return {
            dataUrl: await blobToDataUrl(blob),
            width,
            height
        };
    };

    const prepareImages = async (beforeFile, afterFile) => {
        const settings = [
            { maxEdge: 1600, quality: 0.84 },
            { maxEdge: 1400, quality: 0.78 },
            { maxEdge: 1200, quality: 0.74 },
            { maxEdge: 1000, quality: 0.7 }
        ];

        for (const setting of settings) {
            const [before, after] = await Promise.all([
                optimiseImage(beforeFile, setting.maxEdge, setting.quality),
                optimiseImage(afterFile, setting.maxEdge, setting.quality)
            ]);
            if (before.dataUrl.length + after.dataUrl.length < MAX_JSON_LENGTH) {
                return { before, after };
            }
        }

        throw new Error('Ces photos restent trop lourdes. Essayez avec deux fichiers plus petits.');
    };

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        status.replaceChildren();
        status.className = 'form-status';

        if (!form.checkValidity()) {
            form.reportValidity();
            setStatus('Complétez tous les champs obligatoires.', 'error');
            return;
        }

        const beforeFile = beforeInput.files?.[0];
        const afterFile = afterInput.files?.[0];
        if (!beforeFile?.type.startsWith('image/') || !afterFile?.type.startsWith('image/')) {
            setStatus('Choisissez deux fichiers image valides.', 'error');
            return;
        }

        submitButton.disabled = true;
        submitButton.setAttribute('aria-busy', 'true');
        setStatus('Optimisation des deux photos…');

        try {
            const images = await prepareImages(beforeFile, afterFile);
            setStatus('Publication sur le site…');

            const response = await fetch('/api/realisations', {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    password: form.elements.password.value,
                    category: form.elements.category.value,
                    title: form.elements.title.value,
                    description: form.elements.description.value,
                    before: images.before,
                    after: images.after
                })
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload.error || `La publication a échoué (${response.status}).`);
            }

            form.reset();
            beforeInput.dispatchEvent(new Event('change'));
            afterInput.dispatchEvent(new Event('change'));
            setStatus('La réalisation est publiée. Elle apparaît maintenant dans la rubrique Avant / Après.', 'success');
        } catch (error) {
            const message = error instanceof TypeError
                ? 'Le service de publication est indisponible. Vérifiez la configuration Vercel.'
                : error.message;
            setStatus(message || 'La réalisation n’a pas pu être publiée.', 'error');
        } finally {
            submitButton.disabled = false;
            submitButton.removeAttribute('aria-busy');
        }
    });
});
