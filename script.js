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

    // Bouton de retour en haut avec un gestionnaire de défilement limité
    const backToTop = document.getElementById('backToTop');
    const realisationsSection = document.getElementById('realisations');
    let scrollFrameRequested = false;

    const updateFloatingActions = () => {
        const isVisible = window.scrollY > 250;
        const realisationsRect = realisationsSection?.getBoundingClientRect();
        const realisationsAreVisible = Boolean(
            realisationsRect
            && realisationsRect.top < window.innerHeight * 0.9
            && realisationsRect.bottom > Number.parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-height'), 10)
        );

        backToTop?.classList.toggle('active', isVisible && !realisationsAreVisible);
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

    const currentYear = document.getElementById('currentYear');
    if (currentYear) currentYear.textContent = String(new Date().getFullYear());
});
