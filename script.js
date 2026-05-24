/* ==========================================================================
   ROMANYCK COIFFURE - INTERACTIVE UX SCRIPTS
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

    // 1. MOBILE NAVIGATION TOGGLE
    const mobileToggle = document.getElementById('mobileToggle');
    const navMenu = document.getElementById('navMenu');
    
    if (mobileToggle && navMenu) {
        mobileToggle.addEventListener('click', () => {
            navMenu.classList.toggle('open');
            mobileToggle.classList.toggle('active');
            
            // Toggle hamburger animation
            const bars = mobileToggle.querySelectorAll('.bar');
            if (mobileToggle.classList.contains('active')) {
                bars[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
                bars[1].style.opacity = '0';
                bars[2].style.transform = 'rotate(-45deg) translate(7px, -7px)';
            } else {
                bars[0].style.transform = 'none';
                bars[1].style.opacity = '1';
                bars[2].style.transform = 'none';
            }
        });

        // Close menu when clicking a link
        const navLinks = navMenu.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                navMenu.classList.remove('open');
                mobileToggle.classList.remove('active');
                const bars = mobileToggle.querySelectorAll('.bar');
                bars.forEach(bar => bar.style.transform = 'none');
                bars[1].style.opacity = '1';
            });
        });
    }

    // 2. PRICING TABS SYSTEM
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all buttons and panes
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabPanes.forEach(pane => {
                pane.classList.remove('active');
                pane.style.display = 'none';
            });

            // Add active class to clicked button
            button.classList.add('active');

            // Find and activate the matching pane
            const targetTabId = button.getAttribute('data-tab');
            const targetPane = document.getElementById(targetTabId);
            
            if (targetPane) {
                targetPane.style.display = 'block';
                // Trigger reflow to restart animation
                void targetPane.offsetWidth;
                targetPane.classList.add('active');
            }
        });
    });

    // 3. SCROLL SPY (Highlight nav items on scroll)
    const sections = document.querySelectorAll('section');
    const navItems = document.querySelectorAll('.nav-link');

    window.addEventListener('scroll', () => {
        let current = '';
        const scrollPosition = window.pageYOffset + 200; // Offset to trigger early

        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.clientHeight;
            if (scrollPosition >= sectionTop && scrollPosition < sectionTop + sectionHeight) {
                current = section.getAttribute('id');
            }
        });

        navItems.forEach(item => {
            item.classList.remove('active');
            if (item.getAttribute('href') === `#${current}`) {
                item.classList.add('active');
            }
        });
    });

    // 4. PREVENT SUNDAYS AND MONDAYS ON THE BOOKING CALENDAR (UX BEST PRACTICE)
    const dateInput = document.getElementById('date-pref');
    if (dateInput) {
        // Set minimum date to today
        const today = new Date();
        const yyyy = today.getFullYear();
        let mm = today.getMonth() + 1; // Months start at 0
        let dd = today.getDate();

        if (dd < 10) dd = '0' + dd;
        if (mm < 10) mm = '0' + mm;

        const formattedToday = yyyy + '-' + mm + '-' + dd;
        dateInput.setAttribute('min', formattedToday);

        // Alert user if they choose a Sunday (0) or Monday (1)
        dateInput.addEventListener('change', (e) => {
            const day = new Date(e.target.value).getUTCDay();
            if ([0, 1].includes(day)) {
                alert("Le studio Romanyck Coiffure est fermé le dimanche et le lundi. Veuillez choisir un jour d'ouverture (du mardi au samedi).");
                e.target.value = '';
            }
        });
    }

    // 5. SUBTLE HERO IMAGE PARALLAX ON MOUSEMOVE
    const heroImageWrapper = document.querySelector('.hero-image-wrapper');
    const heroImg = document.querySelector('.hero-img');
    
    if (heroImageWrapper && heroImg) {
        heroImageWrapper.addEventListener('mousemove', (e) => {
            const rect = heroImageWrapper.getBoundingClientRect();
            const x = e.clientX - rect.left - (rect.width / 2);
            const y = e.clientY - rect.top - (rect.height / 2);
            
            // Move image slightly in opposite direction
            heroImg.style.transform = `scale(1.05) translate(${x * -0.03}px, ${y * -0.03}px)`;
        });

        heroImageWrapper.addEventListener('mouseleave', () => {
            heroImg.style.transform = 'scale(1) translate(0px, 0px)';
        });
    }

    // 6. BACK TO TOP & FLOATING BOOKING BUTTONS ACTIVE STATE
    const backToTop = document.getElementById('backToTop');
    const floatingBooking = document.getElementById('floatingBooking');
    
    const handleScroll = () => {
        const scrollY = window.scrollY !== undefined ? window.scrollY : window.pageYOffset;
        
        if (scrollY > 400) {
            if (backToTop) backToTop.classList.add('active');
            if (floatingBooking) floatingBooking.classList.add('active');
        } else {
            if (backToTop) backToTop.classList.remove('active');
            if (floatingBooking) floatingBooking.classList.remove('active');
        }
    };

    window.addEventListener('scroll', handleScroll);
    
    if (backToTop) {
        backToTop.addEventListener('click', (e) => {
            e.preventDefault();
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }

    // 7. SCROLL TRIGGER ANIMATIONS (FADE IN UP)
    const animateElements = document.querySelectorAll('.fade-in-up, .step-card, .testimonial-card, .testimonial-slide');
    
    const triggerAnimations = () => {
        animateElements.forEach(element => {
            const elementTop = element.getBoundingClientRect().top;
            const elementBottom = element.getBoundingClientRect().bottom;
            
            // Check if element is visible inside window height
            if (elementTop < window.innerHeight - 50 && elementBottom > 0) {
                element.classList.add('animate-in');
            }
        });
    };

    // Run once on load
    triggerAnimations();
    // Run on scroll
    window.addEventListener('scroll', triggerAnimations);


    // ==========================================================================
    // LOGIQUE DES COMPOSANTS INTERACTIFS DE PRESTIGE
    // ==========================================================================

    // A. SLIDER AVANT/APRÈS (BALAYAGE EN MOUVEMENT)
    const slider = document.getElementById('balayageSlider');
    const handle = document.getElementById('sliderHandle');
    
    if (slider && handle) {
        const moveSlider = (clientX) => {
            const rect = slider.getBoundingClientRect();
            const x = clientX - rect.left;
            let percentage = (x / rect.width) * 100;
            
            // Contenir le pourcentage entre 0% et 100%
            if (percentage < 0) percentage = 0;
            if (percentage > 100) percentage = 100;
            
            // Appliquer la propriété personnalisée CSS
            slider.style.setProperty('--clip-pos', `${percentage}%`);
        };

        const handleMove = (e) => {
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            moveSlider(clientX);
        };

        let isDragging = false;

        const startDragging = (e) => {
            isDragging = true;
            handleMove(e);
            slider.classList.add('dragging');
        };

        const stopDragging = () => {
            isDragging = false;
            slider.classList.remove('dragging');
        };

        handle.addEventListener('mousedown', startDragging);
        window.addEventListener('mouseup', stopDragging);
        window.addEventListener('mousemove', (e) => {
            if (isDragging) handleMove(e);
        });

        handle.addEventListener('touchstart', startDragging, { passive: true });
        window.addEventListener('touchend', stopDragging);
        window.addEventListener('touchmove', (e) => {
            if (isDragging) handleMove(e);
        }, { passive: true });

        // Un clic sur le slider repositionne également la barre
        slider.addEventListener('click', (e) => {
            if (e.target !== handle && !handle.contains(e.target)) {
                handleMove(e);
            }
        });
    }

    // B. FILTRAGE DYNAMIQUE DE LA GALERIE
    const filterButtons = document.querySelectorAll('.filter-btn');
    const galleryItems = document.querySelectorAll('.gallery-item');

    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Permuter la classe active
            filterButtons.forEach(button => button.classList.remove('active'));
            btn.classList.add('active');

            const filterValue = btn.getAttribute('data-filter');

            galleryItems.forEach(item => {
                const itemCat = item.getAttribute('data-category');
                
                if (filterValue === 'all' || itemCat === filterValue) {
                    item.style.display = 'block';
                    setTimeout(() => {
                        item.classList.remove('hide');
                    }, 20);
                } else {
                    item.classList.add('hide');
                    setTimeout(() => {
                        if (item.classList.contains('hide')) {
                            item.style.display = 'none';
                        }
                    }, 600); // Correspond à la durée de la transition CSS
                }
            });
        });
    });

    // C. CARROUSEL DE TÉMOIGNAGES (LIVRE D'OR)
    const testimonialsSlider = document.getElementById('testimonialsSlider');
    const testimonialSlides = document.querySelectorAll('.testimonial-slide');
    const testimonialDots = document.querySelectorAll('.slider-dots .dot');
    const prevBtn = document.getElementById('prevSlide');
    const nextBtn = document.getElementById('nextSlide');
    
    if (testimonialsSlider && testimonialSlides.length > 0) {
        let currentSlide = 0;
        let autoplayTimer = null;
        
        const updateSlider = (index) => {
            currentSlide = index;
            
            // Bouclage des index
            if (currentSlide < 0) currentSlide = testimonialSlides.length - 1;
            if (currentSlide >= testimonialSlides.length) currentSlide = 0;
            
            // Appliquer la translation horizontale
            testimonialsSlider.style.transform = `translateX(-${currentSlide * 100}%)`;
            
            // Mettre à jour l'opacité et l'échelle de la slide active
            testimonialSlides.forEach((slide, idx) => {
                if (idx === currentSlide) {
                    slide.classList.add('active');
                } else {
                    slide.classList.remove('active');
                }
            });
            
            // Mettre à jour l'état des points de contrôle
            testimonialDots.forEach((dot, idx) => {
                if (idx === currentSlide) {
                    dot.classList.add('active');
                } else {
                    dot.classList.remove('active');
                }
            });
        };
        
        const startAutoplay = () => {
            stopAutoplay();
            autoplayTimer = setInterval(() => {
                updateSlider(currentSlide + 1);
            }, 5000);
        };
        
        const stopAutoplay = () => {
            if (autoplayTimer) {
                clearInterval(autoplayTimer);
                autoplayTimer = null;
            }
        };
        
        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                updateSlider(currentSlide - 1);
                startAutoplay(); // Réinitialise la minuterie
            });
        }
        
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                updateSlider(currentSlide + 1);
                startAutoplay(); // Réinitialise la minuterie
            });
        }
        
        testimonialDots.forEach(dot => {
            dot.addEventListener('click', (e) => {
                const index = parseInt(e.target.getAttribute('data-index'));
                updateSlider(index);
                startAutoplay(); // Réinitialise la minuterie
            });
        });
        
        // Mettre en pause le défilement automatique au survol
        const wrapper = document.querySelector('.testimonials-slider-wrapper');
        if (wrapper) {
            wrapper.addEventListener('mouseenter', stopAutoplay);
            wrapper.addEventListener('mouseleave', startAutoplay);
        }
        
        // Initialisation du carrousel
        updateSlider(0);
        startAutoplay();
    }

});
