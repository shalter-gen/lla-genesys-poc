// Admin Menu
document.addEventListener('DOMContentLoaded', () => {
    const adminLogo = document.getElementById('adminLogo');
    const adminMenu = document.getElementById('adminMenu');
    const currentPage = window.location.pathname.split('/').pop();

    // Prevent default context menu on logo
    adminLogo.addEventListener('contextmenu', (e) => {
        e.preventDefault();

        // Position menu at click coordinates
        adminMenu.style.display = 'block';
        adminMenu.style.left = `${e.pageX}px`;
        adminMenu.style.top = `${e.pageY}px`;

        // Disable current page in menu
        const menuItems = adminMenu.querySelectorAll('li');
        menuItems.forEach(item => {
            if (item.dataset.page === currentPage) {
                item.classList.add('disabled');
            } else {
                item.classList.remove('disabled');
            }
        });
    });

    // Handle menu item clicks
    adminMenu.addEventListener('click', (e) => {
        const menuItem = e.target;
        if (menuItem.tagName === 'LI' && !menuItem.classList.contains('disabled')) {
            window.location.href = menuItem.dataset.page;
        }
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!adminMenu.contains(e.target) && e.target !== adminLogo) {
            adminMenu.style.display = 'none';
        }
    });

    // Close menu when pressing Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            adminMenu.style.display = 'none';
        }
    });
});
