document.documentElement.classList.add('js');

document.addEventListener('DOMContentLoaded', () => {
    const loginPanel = document.getElementById('adminLoginPanel');
    const loginForm = document.getElementById('adminLoginForm');
    const loginStatus = document.getElementById('loginStatus');
    const loginButton = document.getElementById('loginButton');
    const workspace = document.getElementById('adminWorkspace');
    const logoutButton = document.getElementById('logoutButton');
    const uploadForm = document.getElementById('realisationUploadForm');
    const uploadStatus = document.getElementById('uploadStatus');
    const uploadButton = document.getElementById('uploadButton');
    const beforeInput = document.getElementById('beforePhoto');
    const afterInput = document.getElementById('afterPhoto');
    const managerStatus = document.getElementById('managerStatus');
    const managerList = document.getElementById('adminRealisationsList');
    const refreshButton = document.getElementById('refreshRealisations');
    const editDialog = document.getElementById('editRealisationDialog');
    const editForm = document.getElementById('editRealisationForm');
    const editStatus = document.getElementById('editStatus');
    const editDialogClose = document.getElementById('editDialogClose');
    const MAX_JSON_LENGTH = 3_800_000;
    const previewUrls = new Map();
    let realisations = [];

    const setStatus = (element, message, type = '') => {
        element.textContent = message;
        element.className = `form-status${type ? ` is-${type}` : ''}`;
        if (message) element.focus({ preventScroll: true });
    };

    const setAuthenticated = (authenticated) => {
        loginPanel.hidden = authenticated;
        workspace.hidden = !authenticated;
        if (!authenticated) {
            managerList.replaceChildren();
            realisations = [];
        }
    };

    const requestJson = async (url, options = {}) => {
        const response = await fetch(url, {
            credentials: 'same-origin',
            headers: {
                Accept: 'application/json',
                ...(options.body ? { 'Content-Type': 'application/json' } : {}),
                ...options.headers
            },
            ...options
        });
        const payload = await response.json().catch(() => ({}));
        if (response.status === 401) {
            setAuthenticated(false);
            throw new Error(payload.error || 'Votre session a expiré. Reconnectez-vous.');
        }
        if (!response.ok) throw new Error(payload.error || `Erreur ${response.status}`);
        return payload;
    };

    const checkSession = async () => {
        try {
            const payload = await requestJson('/api/admin-session');
            setAuthenticated(payload.authenticated === true);
            if (payload.authenticated) await loadRealisations();
        } catch {
            setAuthenticated(false);
        }
    };

    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!loginForm.checkValidity()) {
            loginForm.reportValidity();
            return;
        }

        loginButton.disabled = true;
        setStatus(loginStatus, 'Connexion…');
        try {
            await requestJson('/api/admin-session', {
                method: 'POST',
                body: JSON.stringify({ password: loginForm.elements.password.value })
            });
            loginForm.reset();
            setStatus(loginStatus, '');
            setAuthenticated(true);
            await loadRealisations();
        } catch (error) {
            setStatus(loginStatus, error.message, 'error');
        } finally {
            loginButton.disabled = false;
        }
    });

    logoutButton.addEventListener('click', async () => {
        try {
            await requestJson('/api/admin-session', { method: 'DELETE' });
        } catch {
            // La session est supprimée visuellement même si le réseau est interrompu.
        }
        setAuthenticated(false);
        setStatus(loginStatus, 'Vous êtes déconnecté.', 'success');
    });

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

    beforeInput.addEventListener('change', () => updatePreview(beforeInput, 'beforePreview', 'beforePlaceholder', 'avant'));
    afterInput.addEventListener('change', () => updatePreview(afterInput, 'afterPreview', 'afterPlaceholder', 'après'));

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
        return { dataUrl: await blobToDataUrl(blob), width, height };
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
            if (before.dataUrl.length + after.dataUrl.length < MAX_JSON_LENGTH) return { before, after };
        }
        throw new Error('Ces photos restent trop lourdes. Essayez avec deux fichiers plus petits.');
    };

    uploadForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        setStatus(uploadStatus, '');
        if (!uploadForm.checkValidity()) {
            uploadForm.reportValidity();
            setStatus(uploadStatus, 'Complétez tous les champs obligatoires.', 'error');
            return;
        }

        const beforeFile = beforeInput.files?.[0];
        const afterFile = afterInput.files?.[0];
        if (!beforeFile?.type.startsWith('image/') || !afterFile?.type.startsWith('image/')) {
            setStatus(uploadStatus, 'Choisissez deux fichiers image valides.', 'error');
            return;
        }

        uploadButton.disabled = true;
        uploadButton.setAttribute('aria-busy', 'true');
        setStatus(uploadStatus, 'Optimisation des deux photos…');
        try {
            const images = await prepareImages(beforeFile, afterFile);
            setStatus(uploadStatus, 'Publication sur le site…');
            await requestJson('/api/realisations', {
                method: 'POST',
                body: JSON.stringify({
                    category: uploadForm.elements.category.value,
                    title: uploadForm.elements.title.value,
                    description: uploadForm.elements.description.value,
                    before: images.before,
                    after: images.after
                })
            });

            uploadForm.reset();
            beforeInput.dispatchEvent(new Event('change'));
            afterInput.dispatchEvent(new Event('change'));
            setStatus(uploadStatus, 'La réalisation est publiée.', 'success');
            await loadRealisations();
        } catch (error) {
            const message = error instanceof TypeError
                ? 'Le service de publication est indisponible. Vérifiez la configuration Vercel.'
                : error.message;
            setStatus(uploadStatus, message, 'error');
        } finally {
            uploadButton.disabled = false;
            uploadButton.removeAttribute('aria-busy');
        }
    });

    const actionButton = (label, className, handler, disabled = false) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = className;
        button.textContent = label;
        button.disabled = disabled;
        button.addEventListener('click', handler);
        return button;
    };

    const updateRealisation = async (payload, successMessage) => {
        setStatus(managerStatus, 'Enregistrement…');
        await requestJson('/api/realisations', {
            method: 'PATCH',
            body: JSON.stringify(payload)
        });
        setStatus(managerStatus, successMessage, 'success');
        await loadRealisations(false);
    };

    const moveRealisation = async (index, direction) => {
        const targetIndex = index + direction;
        if (!realisations[targetIndex]) return;
        const current = realisations[index];
        const target = realisations[targetIndex];
        try {
            await requestJson('/api/realisations', {
                method: 'PATCH',
                body: JSON.stringify({ id: current.id, order: target.order })
            });
            await updateRealisation({ id: target.id, order: current.order }, 'Ordre mis à jour.');
        } catch (error) {
            setStatus(managerStatus, error.message, 'error');
        }
    };

    const openEditDialog = (item) => {
        editForm.elements.id.value = item.id;
        editForm.elements.category.value = item.category;
        editForm.elements.title.value = item.title;
        editForm.elements.description.value = item.description || '';
        setStatus(editStatus, '');
        editDialog.showModal();
    };

    const createManagerCard = (item, index) => {
        const card = document.createElement('article');
        card.className = `admin-realisation-card${item.visible === false ? ' is-hidden' : ''}`;

        const photos = document.createElement('div');
        photos.className = 'admin-realisation-photos';
        [item.before, item.after].forEach((photo) => {
            const image = document.createElement('img');
            image.src = photo.fallback;
            image.alt = photo.alt;
            image.loading = 'lazy';
            photos.append(image);
        });

        const content = document.createElement('div');
        content.className = 'admin-realisation-content';
        const eyebrow = document.createElement('span');
        eyebrow.className = 'realisation-category';
        eyebrow.textContent = `${item.category} · ${item.visible === false ? 'Masquée' : 'Visible'}`;
        const title = document.createElement('h3');
        title.textContent = item.title;
        const description = document.createElement('p');
        description.textContent = item.description || '';
        const actions = document.createElement('div');
        actions.className = 'admin-realisation-actions';

        actions.append(
            actionButton('Monter', 'admin-action-btn', () => moveRealisation(index, -1), index === 0),
            actionButton('Descendre', 'admin-action-btn', () => moveRealisation(index, 1), index === realisations.length - 1),
            actionButton('Modifier', 'admin-action-btn', () => openEditDialog(item)),
            actionButton(item.visible === false ? 'Afficher' : 'Masquer', 'admin-action-btn', async () => {
                try {
                    await updateRealisation({ id: item.id, visible: item.visible === false }, 'Visibilité mise à jour.');
                } catch (error) {
                    setStatus(managerStatus, error.message, 'error');
                }
            }),
            actionButton('Supprimer', 'admin-action-btn is-danger', async () => {
                if (!window.confirm(`Supprimer définitivement « ${item.title} » et ses deux photos ?`)) return;
                try {
                    setStatus(managerStatus, 'Suppression…');
                    await requestJson('/api/realisations', {
                        method: 'DELETE',
                        body: JSON.stringify({ id: item.id })
                    });
                    setStatus(managerStatus, 'Réalisation supprimée.', 'success');
                    await loadRealisations(false);
                } catch (error) {
                    setStatus(managerStatus, error.message, 'error');
                }
            })
        );

        content.append(eyebrow, title, description, actions);
        card.append(photos, content);
        return card;
    };

    async function loadRealisations(showLoading = true) {
        if (showLoading) setStatus(managerStatus, 'Chargement des réalisations…');
        try {
            const payload = await requestJson('/api/realisations?admin=1');
            realisations = Array.isArray(payload.realisations) ? payload.realisations : [];
            managerList.replaceChildren(...realisations.map(createManagerCard));
            setStatus(
                managerStatus,
                realisations.length ? `${realisations.length} réalisation(s).` : 'Aucune réalisation ajoutée depuis cette administration.',
                realisations.length ? '' : 'success'
            );
        } catch (error) {
            managerList.replaceChildren();
            setStatus(managerStatus, error.message, 'error');
        }
    }

    refreshButton.addEventListener('click', () => loadRealisations());
    editDialogClose.addEventListener('click', () => editDialog.close());
    editDialog.addEventListener('click', (event) => {
        if (event.target === editDialog) editDialog.close();
    });
    editForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!editForm.checkValidity()) {
            editForm.reportValidity();
            return;
        }
        try {
            await updateRealisation({
                id: editForm.elements.id.value,
                category: editForm.elements.category.value,
                title: editForm.elements.title.value,
                description: editForm.elements.description.value
            }, 'Réalisation modifiée.');
            editDialog.close();
        } catch (error) {
            setStatus(editStatus, error.message, 'error');
        }
    });

    checkSession();
});
