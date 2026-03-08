// Admin Navigation Menu Handler
(function() {
    'use strict';
    
    // Load navigation HTML
    function loadNavigation() {
        fetch('../Common/admin-nav.html')
            .then(response => response.text())
            .then(data => {
                document.body.insertAdjacentHTML('afterbegin', data);
                initNav();
            })
            .catch(error => {
                console.error('Error loading navigation:', error);
            });
    }
    
    // Initialize navigation functionality
    function initNav() {
        const hamburger = document.getElementById('hamburgerMenu');
        const navPanel = document.getElementById('navPanel');
        const navOverlay = document.getElementById('navOverlay');
        const closeBtn = document.getElementById('closeNav');
        
        if (!hamburger || !navPanel || !navOverlay || !closeBtn) {
            console.error('Navigation elements not found');
            return;
        }
        
        // Keep track of hamburger position
        let hamburgerRect = null;
        
        // Open navigation
        function openNav() {
            // Store hamburger position before opening
            hamburgerRect = hamburger.getBoundingClientRect();
            
            hamburger.classList.add('active');
            navPanel.classList.add('open');
            navOverlay.classList.add('open');
            document.body.style.overflow = 'hidden'; // Prevent scrolling
        }
        
        // Close navigation
        function closeNav() {
            hamburger.classList.remove('active');
            navPanel.classList.remove('open');
            navOverlay.classList.remove('open');
            document.body.style.overflow = ''; // Restore scrolling
            hamburgerRect = null;
        }
        
        // Toggle navigation
        function toggleNav() {
            if (navPanel.classList.contains('open')) {
                closeNav();
            } else {
                openNav();
            }
        }
        
        // Event listeners
        hamburger.addEventListener('click', toggleNav);
        closeBtn.addEventListener('click', closeNav);
        
        // Close on overlay click, but check if click is on hamburger position
        navOverlay.addEventListener('click', function(e) {
            if (hamburgerRect) {
                const clickX = e.clientX;
                const clickY = e.clientY;
                
                // Check if click is within hamburger area (with some tolerance)
                const tolerance = 10;
                if (clickX >= hamburgerRect.left - tolerance &&
                    clickX <= hamburgerRect.right + tolerance &&
                    clickY >= hamburgerRect.top - tolerance &&
                    clickY <= hamburgerRect.bottom + tolerance) {
                    // Click is on hamburger, let the hamburger handler deal with it
                    return;
                }
            }
            closeNav();
        });
        
        // Close on escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && navPanel.classList.contains('open')) {
                closeNav();
            }
        });
        
        // Highlight current page
        const currentPage = window.location.pathname.split('/').pop();
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            if (item.getAttribute('href') === currentPage) {
                item.classList.add('active');
            }
        });
    }
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadNavigation);
    } else {
        loadNavigation();
    }
})();