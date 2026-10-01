function openEmbeddedOrderView(view) {
    let title = '';
    if (view === 'orders') title = 'New Order / POS';
    else if (view === 'appointments') title = 'Appointments';
    else if (view === 'logs') title = 'Activity Logs';
    else if (view === 'history') title = 'Transaction History';
    else if (view === 'analytics') title = 'Sales Analytics';
    else return;
    const item = document.createElement('li');
    const label = document.createElement('span');
    label.innerText = title;
    item.appendChild(label);
    switchTab(view, item);
}

window.addEventListener('message', function(event) {
    if (window.parent === window || event.source !== window.parent) return;
    if (!event.data || event.data.type !== 'love-luxe-view') return;
    openEmbeddedOrderView(event.data.view);
});

if (window.parent !== window) openEmbeddedOrderView('orders');
