/* ==========================================================================
   ROMANYCK COIFFURE — INTERACTIONS ACCESSIBLES ET LÉGÈRES
   ========================================================================== */

document.documentElement.classList.add('js');

document.addEventListener('DOMContentLoaded', () => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const mobileNavigation = window.matchMedia('(max-width: 1080px)');

    // L'API est la seule source d'affichage : une photo masquée ne réapparaît pas lors d'une panne.
    const realisationsGrid = document.getElementById('realisationsGrid');
    const workFilters = document.getElementById('workFilters');
    const normaliseRealisations = (items) => (
        Array.isArray(items)
            ? items
            .filter((item) => (
                item
                && item.visible !== false
                && item.category
                && item.title
                && item.before?.fallback
                && item.before?.alt
                && item.after?.fallback
                && item.after?.alt
            ))
            .sort((a, b) => {
                const orderDifference = (a.order ?? 100) - (b.order ?? 100);
                if (orderDifference) return orderDifference;
                return Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0);
            })
            : []
    );

    const createPicture = (image, label) => {
        const wrapper = document.createElement('div');
        wrapper.className = `image-container ${label === 'Avant' ? 'before-image' : 'after-image'}`;

        const picture = document.createElement('picture');
        if (image.webp) {
            const source = document.createElement('source');
            source.srcset = image.webp;
            source.type = 'image/webp';
            picture.append(source);
        }

        const img = document.createElement('img');
        img.src = image.fallback;
        img.alt = image.alt;
        img.width = image.width ?? 1200;
        img.height = image.height ?? 1200;
        img.loading = 'lazy';
        img.decoding = 'async';
        picture.append(img);

        const imageLabel = document.createElement('span');
        imageLabel.className = `image-label ${label === 'Avant' ? 'label-before' : 'label-after'}`;
        imageLabel.textContent = label;

        wrapper.append(picture, imageLabel);
        return wrapper;
    };

    const createRealisationCard = (item) => {
        const card = document.createElement('article');
        card.className = 'realisation-card';
        card.dataset.category = item.category;

        const comparison = document.createElement('div');
        comparison.className = 'before-after-slider';
        comparison.setAttribute('role', 'group');
        comparison.setAttribute('aria-label', `Comparaison avant et après : ${item.title}`);

        const range = document.createElement('input');
        range.className = 'slider-range';
        range.type = 'range';
        range.min = '0';
        range.max = '100';
        range.value = '50';
        range.setAttribute('aria-label', "Afficher davantage l'image avant ou après");

        const updateComparison = () => {
            const value = Number(range.value);
            comparison.style.setProperty('--clip-pos', `${value}%`);
            range.setAttribute('aria-valuetext', `${value} % de l'image avant visible`);
        };
        range.addEventListener('input', updateComparison);

        const handle = document.createElement('div');
        handle.className = 'slider-handle';
        handle.setAttribute('aria-hidden', 'true');

        const lineBefore = document.createElement('div');
        lineBefore.className = 'handle-line';
        const handleButton = document.createElement('div');
        handleButton.className = 'handle-button';
        const arrow = document.createElement('span');
        arrow.className = 'symbol-icon';
        arrow.setAttribute('aria-hidden', 'true');
        arrow.textContent = '↔';
        handleButton.append(arrow);
        const lineAfter = document.createElement('div');
        lineAfter.className = 'handle-line';
        handle.append(lineBefore, handleButton, lineAfter);

        comparison.append(
            createPicture(item.before, 'Avant'),
            createPicture(item.after, 'Après'),
            range,
            handle
        );
        updateComparison();

        const meta = document.createElement('div');
        meta.className = 'realisation-meta';
        const headingGroup = document.createElement('div');
        const category = document.createElement('span');
        category.className = 'realisation-category';
        category.textContent = item.category;
        const title = document.createElement('h3');
        title.textContent = item.title;
        headingGroup.append(category, title);
        const description = document.createElement('p');
        description.textContent = item.description || '';
        meta.append(headingGroup, description);

        card.append(comparison, meta);
        return card;
    };

    const renderRealisations = (items) => {
        const realisations = normaliseRealisations(items);
        if (!realisationsGrid) return;

        workFilters?.classList.remove('is-visible');
        workFilters?.replaceChildren();
        if (!realisations.length) {
            const empty = document.createElement('p');
            empty.className = 'realisations-empty';
            empty.textContent = 'Les nouvelles réalisations du salon seront bientôt publiées ici.';
            realisationsGrid.replaceChildren(empty);
            realisationsGrid.classList.remove('is-single');
            return;
        }

        realisationsGrid.replaceChildren(...realisations.map(createRealisationCard));
        realisationsGrid.classList.toggle('is-single', realisations.length === 1);

        const categories = [...new Set(realisations.map((item) => item.category))];

        if (workFilters && categories.length > 1) {
            const createFilterButton = (label, value, active = false) => {
                const button = document.createElement('button');
                button.className = `work-filter-btn${active ? ' active' : ''}`;
                button.type = 'button';
                button.dataset.filter = value;
                button.setAttribute('aria-pressed', String(active));
                button.textContent = label;
                return button;
            };

            workFilters.replaceChildren(
                createFilterButton('Toutes', 'all', true),
                ...categories.map((category) => createFilterButton(category, category))
            );
            workFilters.classList.add('is-visible');

            workFilters.querySelectorAll('.work-filter-btn').forEach((button) => {
                button.addEventListener('click', () => {
                    workFilters.querySelectorAll('.work-filter-btn').forEach((candidate) => {
                        const isActive = candidate === button;
                        candidate.classList.toggle('active', isActive);
                        candidate.setAttribute('aria-pressed', String(isActive));
                    });

                    realisationsGrid.querySelectorAll('.realisation-card').forEach((card) => {
                        card.hidden = button.dataset.filter !== 'all'
                            && card.dataset.category !== button.dataset.filter;
                    });
                });
            });
        }
    };

    const loadPublishedRealisations = async () => {
        try {
            const response = await fetch('/api/realisations', {
                headers: { Accept: 'application/json' },
                cache: 'no-store'
            });
            if (!response.ok) throw new Error(`Galerie indisponible : ${response.status}`);

            const payload = await response.json();
            renderRealisations(payload.realisations);
        } catch {
            if (!realisationsGrid) return;
            const unavailable = document.createElement('p');
            unavailable.className = 'realisations-empty';
            unavailable.textContent = 'La galerie est momentanément indisponible. Réessayez plus tard.';
            realisationsGrid.replaceChildren(unavailable);
        }
    };

    loadPublishedRealisations();

    // Navigation mobile
    const mobileToggle = document.getElementById('mobileToggle');
    const navMenu = document.getElementById('navMenu');

    if (mobileToggle && navMenu) {
        const setMenuState = (isOpen, returnFocus = false) => {
            navMenu.classList.toggle('open', isOpen);
            mobileToggle.classList.toggle('active', isOpen);
            mobileToggle.setAttribute('aria-expanded', String(isOpen));
            mobileToggle.setAttribute('aria-label', isOpen ? 'Fermer le menu' : 'Ouvrir le menu');
            document.body.classList.toggle('nav-open', isOpen && mobileNavigation.matches);

            if (mobileNavigation.matches) {
                if (isOpen) {
                    navMenu.removeAttribute('inert');
                } else {
                    navMenu.setAttribute('inert', '');
                }
            } else {
                navMenu.removeAttribute('inert');
            }

            if (isOpen) {
                window.requestAnimationFrame(() => navMenu.querySelector('a')?.focus());
            } else if (returnFocus) {
                mobileToggle.focus();
            }
        };

        const syncNavigation = () => setMenuState(false);
        syncNavigation();
        mobileNavigation.addEventListener('change', syncNavigation);

        mobileToggle.addEventListener('click', () => {
            setMenuState(mobileToggle.getAttribute('aria-expanded') !== 'true');
        });

        const menuLinks = [...navMenu.querySelectorAll('a')];

        menuLinks.forEach((link) => {
            link.addEventListener('click', () => setMenuState(false));
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && mobileToggle.getAttribute('aria-expanded') === 'true') {
                setMenuState(false, true);
            }

            if (
                event.key === 'Tab'
                && mobileNavigation.matches
                && mobileToggle.getAttribute('aria-expanded') === 'true'
            ) {
                const focusableItems = [mobileToggle, ...menuLinks];
                const firstItem = focusableItems[0];
                const lastItem = focusableItems[focusableItems.length - 1];

                if (event.shiftKey && document.activeElement === firstItem) {
                    event.preventDefault();
                    lastItem.focus();
                } else if (!event.shiftKey && document.activeElement === lastItem) {
                    event.preventDefault();
                    firstItem.focus();
                }
            }
        });
    }

    // État actif de la navigation
    const navLinks = [...document.querySelectorAll('.nav-link[href^="#"]')];
    const observedSections = navLinks
        .map((link) => document.querySelector(link.getAttribute('href')))
        .filter(Boolean);

    if ('IntersectionObserver' in window) {
        const sectionObserver = new IntersectionObserver((entries) => {
            const visible = entries
                .filter((entry) => entry.isIntersecting)
                .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

            if (!visible) return;

            navLinks.forEach((link) => {
                const isActive = link.getAttribute('href') === `#${visible.target.id}`;
                link.classList.toggle('active', isActive);
                if (isActive) link.setAttribute('aria-current', 'location');
                else link.removeAttribute('aria-current');
            });
        }, {
            rootMargin: '-25% 0px -60% 0px',
            threshold: [0, 0.25, 0.6]
        });

        observedSections.forEach((section) => sectionObserver.observe(section));
    }

    // Date souhaitée
    const dateInput = document.getElementById('date-pref');
    if (dateInput) {
        dateInput.addEventListener('click', () => {
            if (typeof dateInput.showPicker !== 'function') return;
            try {
                dateInput.showPicker();
            } catch {
                // Le sélecteur natif reste disponible sur les navigateurs qui le gèrent autrement.
            }
        });

        const now = new Date();
        const offset = now.getTimezoneOffset() * 60000;
        dateInput.min = new Date(now.getTime() - offset).toISOString().split('T')[0];

        const validateOpeningDay = () => {
            if (!dateInput.value) {
                dateInput.setCustomValidity('');
                return;
            }

            const day = new Date(`${dateInput.value}T12:00:00`).getDay();
            dateInput.setCustomValidity(
                day === 0 || day === 1
                    ? 'Le salon est fermé le dimanche et le lundi. Choisissez une date du mardi au samedi.'
                    : ''
            );
        };

        dateInput.addEventListener('input', validateOpeningDay);
        dateInput.addEventListener('change', () => {
            validateOpeningDay();
            if (!dateInput.checkValidity()) dateInput.reportValidity();
        });
    }

    // Apparition progressive, désactivée en cas de préférence de mouvement réduit
    const animatedElements = document.querySelectorAll('.fade-in-up, .step-card');
    if (reducedMotion.matches || !('IntersectionObserver' in window)) {
        animatedElements.forEach((element) => element.classList.add('animate-in'));
    } else {
        const animationObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('animate-in');
                observer.unobserve(entry.target);
            });
        }, { rootMargin: '0px 0px -40px', threshold: 0.1 });

        animatedElements.forEach((element) => animationObserver.observe(element));
    }

    // Filtres de la galerie
    const filterButtons = [...document.querySelectorAll('.filter-btn')];
    const galleryItems = [...document.querySelectorAll('.gallery-item')];

    filterButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const filter = button.dataset.filter;

            filterButtons.forEach((candidate) => {
                const isActive = candidate === button;
                candidate.classList.toggle('active', isActive);
                candidate.setAttribute('aria-pressed', String(isActive));
            });

            galleryItems.forEach((item) => {
                item.hidden = filter !== 'all' && item.dataset.category !== filter;
            });
        });
    });

    // Agrandissement accessible des photos de produits
    const galleryLightbox = document.getElementById('galleryLightbox');
    const lightboxImage = document.getElementById('lightboxImage');
    const lightboxTitle = document.getElementById('lightboxTitle');
    const lightboxClose = document.getElementById('lightboxClose');
    let activeLightboxTrigger = null;

    const closeLightbox = () => {
        if (!galleryLightbox) return;
        if (typeof galleryLightbox.close === 'function') galleryLightbox.close();
        else galleryLightbox.removeAttribute('open');
    };

    if (galleryLightbox && lightboxImage && lightboxTitle) {
        document.querySelectorAll('.gallery-lightbox-trigger').forEach((trigger) => {
            trigger.addEventListener('click', () => {
                activeLightboxTrigger = trigger;
                lightboxImage.src = trigger.dataset.lightboxSrc;
                lightboxImage.alt = trigger.dataset.lightboxAlt;
                lightboxTitle.textContent = trigger.dataset.lightboxTitle;
                document.body.classList.add('lightbox-open');

                if (typeof galleryLightbox.showModal === 'function') galleryLightbox.showModal();
                else galleryLightbox.setAttribute('open', '');
            });
        });

        lightboxClose?.addEventListener('click', closeLightbox);

        galleryLightbox.addEventListener('click', (event) => {
            if (event.target === galleryLightbox) closeLightbox();
        });

        galleryLightbox.addEventListener('close', () => {
            document.body.classList.remove('lightbox-open');
            lightboxImage.removeAttribute('src');
            lightboxImage.alt = '';
            activeLightboxTrigger?.focus();
            activeLightboxTrigger = null;
        });
    }

    // Boutons flottants avec un seul gestionnaire de défilement limité
    const backToTop = document.getElementById('backToTop');
    const floatingBooking = document.getElementById('floatingBooking');
    const reservationPanel = document.getElementById('reservation');
    const realisationsSection = document.getElementById('realisations');
    let scrollFrameRequested = false;

    const updateFloatingActions = () => {
        const isVisible = window.scrollY > 250;
        const reservationRect = reservationPanel?.getBoundingClientRect();
        const realisationsRect = realisationsSection?.getBoundingClientRect();
        const reservationIsVisible = Boolean(
            reservationRect
            && reservationRect.top < window.innerHeight * 0.85
            && reservationRect.bottom > Number.parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-height'), 10)
        );
        const realisationsAreVisible = Boolean(
            realisationsRect
            && realisationsRect.top < window.innerHeight * 0.9
            && realisationsRect.bottom > Number.parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-height'), 10)
        );

        backToTop?.classList.toggle('active', isVisible && !realisationsAreVisible);
        floatingBooking?.classList.toggle('active', isVisible && !reservationIsVisible && !realisationsAreVisible);
        scrollFrameRequested = false;
    };

    window.addEventListener('scroll', () => {
        if (scrollFrameRequested) return;
        scrollFrameRequested = true;
        window.requestAnimationFrame(updateFloatingActions);
    }, { passive: true });
    updateFloatingActions();

    backToTop?.addEventListener('click', (event) => {
        event.preventDefault();
        window.scrollTo({ top: 0, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
    });

    // Formulaire : aucun succès n'est affiché sans réponse positive du serveur
    const bookingForm = document.getElementById('bookingForm');
    const formStatus = document.getElementById('formStatus');

    if (bookingForm && formStatus) {
        const submitButton = bookingForm.querySelector('button[type="submit"]');
        const dateInput = bookingForm.querySelector('#date-pref');
        const startedAtInput = bookingForm.querySelector('#formStartedAt');
        const projectPhotoInput = bookingForm.querySelector('#projectPhoto');
        const projectPhotoPreview = bookingForm.querySelector('#projectPhotoPreview');
        let projectPhotoUrl = '';

        const formatLocalDate = (date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        const configureBookingDates = () => {
            if (!dateInput) return;
            const today = new Date();
            const maximum = new Date(today);
            maximum.setFullYear(maximum.getFullYear() + 1);
            dateInput.min = formatLocalDate(today);
            dateInput.max = formatLocalDate(maximum);
        };

        const validateBookingDate = () => {
            if (!dateInput?.value) return;
            const day = new Date(`${dateInput.value}T12:00:00`).getDay();
            dateInput.setCustomValidity(day === 0 || day === 1
                ? 'Le salon reçoit les demandes du mardi au samedi.'
                : '');
        };

        configureBookingDates();
        validateBookingDate();
        dateInput?.addEventListener('change', validateBookingDate);
        if (startedAtInput) startedAtInput.value = String(Date.now());

        projectPhotoInput?.addEventListener('change', () => {
            if (projectPhotoUrl) URL.revokeObjectURL(projectPhotoUrl);
            const file = projectPhotoInput.files?.[0];
            if (!file) {
                projectPhotoPreview.hidden = true;
                projectPhotoPreview.removeAttribute('src');
                return;
            }
            projectPhotoUrl = URL.createObjectURL(file);
            projectPhotoPreview.src = projectPhotoUrl;
            projectPhotoPreview.alt = "Aperçu de la photo d'inspiration";
            projectPhotoPreview.hidden = false;
        });

        const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.addEventListener('load', () => resolve(reader.result));
            reader.addEventListener('error', () => reject(reader.error));
            reader.readAsDataURL(blob);
        });

        const prepareProjectPhoto = async (file) => {
            if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 15_000_000) {
                throw new Error("La photo d’inspiration doit être une image JPG, PNG ou WebP de moins de 15 Mo.");
            }
            const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
            const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
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
                    (result) => result ? resolve(result) : reject(new Error("La photo n'a pas pu être préparée.")),
                    'image/webp',
                    0.78
                );
            });
            if (blob.size > 900_000) throw new Error('La photo reste trop lourde après optimisation.');
            return {
                dataUrl: await blobToDataUrl(blob),
                width,
                height
            };
        };

        const setStatus = (message, type = '') => {
            formStatus.textContent = message;
            formStatus.className = `form-status${type ? ` is-${type}` : ''}`;
            formStatus.focus({ preventScroll: true });
        };

        const showUnavailableMessage = () => {
            const phoneLink = document.createElement('a');
            phoneLink.href = 'tel:+33478604621';
            phoneLink.textContent = '04 78 60 46 21';

            formStatus.replaceChildren(
                document.createTextNode("L'envoi en ligne n'est pas encore activé. Appelez le "),
                phoneLink,
                document.createTextNode(' pour demander votre rendez-vous.')
            );
            formStatus.className = 'form-status is-error';
            formStatus.focus();
        };

        bookingForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            formStatus.replaceChildren();
            formStatus.className = 'form-status';
            validateBookingDate();

            if (!bookingForm.checkValidity()) {
                bookingForm.reportValidity();
                setStatus('Vérifiez les champs obligatoires signalés dans le formulaire.', 'error');
                return;
            }

            if (bookingForm.elements.website?.value) return;

            const endpoint = bookingForm.dataset.endpoint?.trim();
            if (!endpoint) {
                showUnavailableMessage();
                return;
            }

            let endpointUrl;
            try {
                endpointUrl = new URL(endpoint, window.location.href);
                const localDevelopment = endpointUrl.hostname === 'localhost' || endpointUrl.hostname === '127.0.0.1';
                if (endpointUrl.protocol !== 'https:' && !localDevelopment) throw new Error('Endpoint non sécurisé');
            } catch {
                showUnavailableMessage();
                return;
            }

            submitButton.disabled = true;
            submitButton.setAttribute('aria-busy', 'true');
            setStatus('Envoi de votre demande…');

            const controller = new AbortController();
            let timeoutId;

            try {
                const formData = new FormData(bookingForm);
                const payload = Object.fromEntries(formData.entries());
                delete payload.project_photo_file;
                const selectedService = bookingForm.elements.service.selectedOptions?.[0];
                payload.service_label = selectedService?.textContent || payload.service;
                const projectPhoto = projectPhotoInput?.files?.[0];
                if (projectPhoto) {
                    setStatus('Optimisation de votre photo…');
                    payload.project_photo = await prepareProjectPhoto(projectPhoto);
                    setStatus('Envoi de votre demande…');
                }
                timeoutId = window.setTimeout(() => controller.abort(), 20000);
                const response = await fetch(endpointUrl, {
                    method: 'POST',
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload),
                    signal: controller.signal
                });

                const responsePayload = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(responsePayload.error || `Réponse HTTP ${response.status}`);

                const confirmationSent = responsePayload.confirmationSent === true;
                bookingForm.reset();
                configureBookingDates();
                if (startedAtInput) startedAtInput.value = String(Date.now());
                projectPhotoInput?.dispatchEvent(new Event('change'));
                setStatus(
                    confirmationSent
                        ? 'Votre demande a bien été transmise. Un accusé de réception vient de vous être envoyé.'
                        : 'Votre demande a bien été transmise. Le salon vous recontactera pour confirmer le créneau.',
                    'success'
                );
            } catch (error) {
                console.error('Échec de la demande de rendez-vous', error);
                setStatus(error.message || "La demande n'a pas pu être envoyée. Appelez le 04 78 60 46 21.", 'error');
            } finally {
                window.clearTimeout(timeoutId);
                submitButton.disabled = false;
                submitButton.removeAttribute('aria-busy');
            }
        });
    }

    const currentYear = document.getElementById('currentYear');
    if (currentYear) currentYear.textContent = String(new Date().getFullYear());
});
