document.addEventListener("DOMContentLoaded", () => {
    // --- 1. MOBILE MENU ---
    const menuToggle = document.querySelector('.menu-toggle');
    const nav = document.querySelector('nav ul');
    if (menuToggle) {
        menuToggle.addEventListener('click', () => nav.classList.toggle('active'));
    }

    // --- 2. RELIABILITY SLIDER ---
    const sliderContainers = document.querySelectorAll('.slider-container');
    
    sliderContainers.forEach(container => {
        const slides = container.querySelectorAll('.slide');
        const dotsContainer = container.querySelector('.slider-dots');
        let currentSlide = 0;
        let slideInterval;

        if (slides.length > 0 && dotsContainer) {
            // Create dots
            slides.forEach((_, i) => {
                const dot = document.createElement('div');
                dot.classList.add('dot');
                if (i === 0) dot.classList.add('active');
                dot.addEventListener('click', () => goToSlide(i));
                dotsContainer.appendChild(dot);
            });

            function goToSlide(n) {
                const dots = dotsContainer.querySelectorAll('.dot');
                slides[currentSlide].classList.remove('active');
                if (dots[currentSlide]) dots[currentSlide].classList.remove('active');
                currentSlide = (n + slides.length) % slides.length;
                slides[currentSlide].classList.add('active');
                if (dots[currentSlide]) dots[currentSlide].classList.add('active');
            }

            function nextSlide() {
                goToSlide(currentSlide + 1);
            }

            // Auto play slider every 5 seconds
            const startAutoPlay = () => slideInterval = setInterval(nextSlide, 5000);
            startAutoPlay();

            // Pause on hover
            container.addEventListener('mouseenter', () => clearInterval(slideInterval));
            container.addEventListener('mouseleave', startAutoPlay);
        }
    });

    // --- 3. SCROLL REVEAL ANIMATION ---
    const revealElements = document.querySelectorAll('.reveal');
    
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                // Once revealed, no need to track anymore
                revealObserver.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.15
    });

    revealElements.forEach(el => revealObserver.observe(el));
    
    // Immediately reveal first section
    if (revealElements[0]) revealElements[0].classList.add('active');
});