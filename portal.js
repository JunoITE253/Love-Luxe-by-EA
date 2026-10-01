let selectedOrderView = 'orders';
const productPageNavigation = showProductPage;

function setPortalGroup(name, expanded) {
    document.getElementById(name + 'Menu').hidden = !expanded;
    document.getElementById(name + 'Toggle').textContent = expanded ? '−' : '+';
    document.getElementById(name + 'Nav').setAttribute('aria-expanded', expanded ? 'true' : 'false');
}

function clearOrderIndicators() {
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

function sendOrderView() {
    const frame = document.getElementById('orderFrame');
    frame.contentWindow.postMessage({ type: 'love-luxe-view', view: selectedOrderView }, '*');
}

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
    const salesView = view === 'history' || view === 'analytics';
    document.getElementById(salesView ? 'salesNav' : 'orderNav').classList.add('active');
    setPortalGroup(salesView ? 'sales' : 'order', true);
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
    const expanded = document.getElementById('orderMenu').hidden;
    openOrderView('orders', event);
    setPortalGroup('order', expanded);
}

function openSalesGroup(event) {
    const expanded = document.getElementById('salesMenu').hidden;
    openOrderView('history', event);
    setPortalGroup('sales', expanded);
}
