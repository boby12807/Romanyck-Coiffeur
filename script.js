/* ==========================================================================
   ROMANYCK COIFFURE — INTERACTIONS ACCESSIBLES ET LÉGÈRES
   ========================================================================== */

document.documentElement.classList.add('js');

document.addEventListener('DOMContentLoaded', () => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const mobileNavigation = window.matchMedia('(max-width: 1080px)');

    // Galerie intégrée au HTML : aucune connexion à un service de stockage.
    document.querySelectorAll('.before-after-slider').forEach((comparison) => {
        const range = comparison.querySelector('.slider-range');
        if (!range) return;
        const update = () => {
            const value = Math.min(100, Math.max(0, Number(range.value)));
            comparison.style.setProperty('--clip-pos', `${value}%`);
            range.setAttribute('aria-valuetext', `${value} % de l’image avant visible`);
        };
        range.addEventListener('input', update);
        update();
    });
    const workFilters = document.getElementById('workFilters');
    const realisationsGrid = document.getElementById('realisationsGrid');
    workFilters?.querySelectorAll('.work-filter-btn').forEach((button) => {
        button.addEventListener('click', () => {
            workFilters.querySelectorAll('.work-filter-btn').forEach((candidate) => {
                const active = candidate === button;
                candidate.classList.toggle('active', active);
                candidate.setAttribute('aria-pressed', String(active));
            });
            realisationsGrid?.querySelectorAll('.realisation-card').forEach((card) => {
                card.hidden = button.dataset.filter !== 'all' && card.dataset.category !== button.dataset.filter;
            });
        });
    });

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
