let selectedOrderView = 'dashboard';
const productPageNavigation = showProductPage;

function setPortalGroup(name, expanded) {
    document.getElementById(name + 'Menu').hidden = !expanded;
    document.getElementById(name + 'Toggle').textContent = expanded ? '−' : '+';
    document.getElementById(name + 'Nav').setAttribute('aria-expanded', expanded ? 'true' : 'false');
}

function clearOrderIndicators() {
    const dashboardNav = document.getElementById('dashboardNav');
    if (dashboardNav) dashboardNav.classList.remove('active');
    document.getElementById('orderNav').classList.remove('active');
    document.getElementById('salesNav').classList.remove('active');
    const links = document.querySelectorAll('[data-order-view]');
    for (let i = 0; i < links.length; i++) links[i].classList.remove('active');
}

showProductPage = function(page, event) {
    document.getElementById('orderFrame').hidden = true;
    document.body.classList.remove('order-module-open');
    clearOrderIndicators();
    productPageNavigation(page, event);
};

function buildStockSummary() {
    const summary = { type: 'love-luxe-stock', products: 0, units: 0, inStock: 0, low: 0, out: 0, alerts: [] };
    if (typeof inventory === 'undefined') return summary;

    const outItems = [];
    const lowItems = [];
    summary.products = inventory.length;

    for (let i = 0; i < inventory.length; i++) {
        const units = getTotalStock(inventory[i]);
        const status = getStatus(inventory[i]);
        summary.units += units;

        if (status === 'available') {
            summary.inStock++;
        } else if (status === 'low') {
            summary.low++;
            addToArray(lowItems, { name: inventory[i].name, units: units, status: 'low' });
        } else {
            summary.out++;
            addToArray(outItems, { name: inventory[i].name, units: units, status: 'out' });
        }
    }

    // Out of stock first, then low stock
    for (let i = 0; i < outItems.length; i++) addToArray(summary.alerts, outItems[i]);
    for (let i = 0; i < lowItems.length; i++) addToArray(summary.alerts, lowItems[i]);
    return summary;
}

function sendOrderView() {
    const frame = document.getElementById('orderFrame');
    if (!frame || !frame.contentWindow) return;
    frame.contentWindow.postMessage({ type: 'love-luxe-session', user: window.LoveLuxeSession ? LoveLuxeSession.read() : null }, '*');
    frame.contentWindow.postMessage({ type: 'love-luxe-view', view: selectedOrderView }, '*');
    frame.contentWindow.postMessage(buildStockSummary(), '*');
}

// Keep the dashboard stock numbers fresh while the dashboard is open
setInterval(function () {
    const frame = document.getElementById('orderFrame');
    if (frame && !frame.hidden && selectedOrderView === 'dashboard' && frame.contentWindow) {
        frame.contentWindow.postMessage(buildStockSummary(), '*');
    }
}, 2000);

function openOrderView(view, event) {
    if (event) event.preventDefault();
    selectedOrderView = view;
    const pages = ['productsPage', 'auditPage', 'archivePage', 'inventoryPage'];
    for (let i = 0; i < pages.length; i++) document.getElementById(pages[i]).style.display = 'none';
    document.getElementById('productManagementNav').classList.remove('active');
    document.getElementById('inventoryNav').classList.remove('active');
    const productLinks = document.querySelectorAll('.product-section .subnav');
    for (let i = 0; i < productLinks.length; i++) productLinks[i].classList.remove('active');
    document.getElementById('productMenu').style.display = 'none';
    document.getElementById('productToggle').textContent = '+';
    clearOrderIndicators();
    const salesView = view === 'history' || view === 'analytics' || view === 'archives';
    if (view === 'dashboard') {
        document.getElementById('dashboardNav').classList.add('active');
        setPortalGroup('order', false);
        setPortalGroup('sales', false);
    } else {
        document.getElementById(salesView ? 'salesNav' : 'orderNav').classList.add('active');
        setPortalGroup(salesView ? 'sales' : 'order', true);
    }
    const links = document.querySelectorAll('[data-order-view]');
    for (let i = 0; i < links.length; i++) {
        links[i].classList.toggle('active', links[i].getAttribute('data-order-view') === view);
    }
    document.getElementById('orderFrame').hidden = false;
    document.body.classList.add('order-module-open');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    sidebar.classList.remove('mobile-open');
    overlay.classList.remove('active');
    sendOrderView();
}

function openOrderGroup(event) {
    const expanded = !document.getElementById('orderMenu').hidden;
    openOrderView('orders', event);
    setPortalGroup('order', expanded);
}

function openSalesGroup(event) {
    const expanded = !document.getElementById('salesMenu').hidden;
    openOrderView('history', event);
    setPortalGroup('sales', expanded);
}

function togglePortalMenuOnly(name, event) {
    event.preventDefault();
    event.stopPropagation();
    setPortalGroup(name, document.getElementById(name + 'Menu').hidden);
}

function preparePortalToggle(name) {
    const toggle = document.getElementById(name + 'Toggle');
    toggle.setAttribute('role', 'button');
    toggle.setAttribute('tabindex', '0');
    toggle.setAttribute('aria-label', 'Expand or collapse ' + (name === 'order' ? 'New Order / POS' : 'Sales Reports'));
    toggle.style.cursor = 'pointer';
    toggle.addEventListener('click', function(event) {
        togglePortalMenuOnly(name, event);
    });
    toggle.addEventListener('keydown', function(event) {
        if (event.key === 'Enter' || event.key === ' ') {
            togglePortalMenuOnly(name, event);
        }
    });
}

const salesMenu = document.getElementById('salesMenu');
if (salesMenu && !document.querySelector('[data-order-view="archives"]')) {
    const archiveLink = document.createElement('a');
    archiveLink.href = '#';
    archiveLink.className = 'subnav';
    archiveLink.setAttribute('data-order-view', 'archives');
    archiveLink.textContent = 'Transaction Archives';
    archiveLink.addEventListener('click', function (event) {
        openOrderView('archives', event);
    });
    salesMenu.appendChild(archiveLink);
}

preparePortalToggle('order');
preparePortalToggle('sales');

const dashboardNav = document.querySelector('.nav');
dashboardNav.id = 'dashboardNav';
dashboardNav.addEventListener('click', function (event) {
    openOrderView('dashboard', event);
});
openOrderView('dashboard');

(function () {
    const embedded = window.parent !== window;
    const sidebar = document.querySelector(".sidebar");
    if (!sidebar || document.getElementById("systemLogoutButton")) return;
    const button = document.createElement("button");
    button.id = "systemLogoutButton";
    button.type = "button";
    button.className = "nav";
    button.textContent = "↪ Logout";
    button.style.width = "100%";
    button.style.border = "0";
    button.style.background = "transparent";
    button.style.fontFamily = "inherit";
    button.style.textAlign = "left";
    button.style.cursor = "pointer";
    button.style.marginTop = "18px";
    button.addEventListener("click", function () {
        if (window.LoveLuxeSession) LoveLuxeSession.clear();
        if (embedded) {
            window.parent.postMessage({ type: "love-luxe-system-logout" }, "*");
        } else {
            window.location.href = "login.html";
        }
    });
    sidebar.appendChild(button);
})();
window.addEventListener('message', function (event) {
    const frame = document.getElementById('orderFrame');
    if (!frame || event.source !== frame.contentWindow || !event.data) return;
    if (event.data.type === 'love-luxe-ready') sendOrderView();
});
