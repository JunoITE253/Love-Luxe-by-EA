const dashboardPanel = document.getElementById('view-dashboard');
if (dashboardPanel) dashboardPanel.innerHTML = `
<div class="dash-section-label">Sales &amp; Revenue</div>
<div class="stats-grid">
<div class="stat-card">
<div class="label">Total Revenue (All-Time)</div>
<div class="value" id="dashTotalRevenue" style="color: var(--brand-gold);">₱0.00</div>
<small class="dash-sub">Gross sales from Sales Reports</small>
</div>
<div class="stat-card">
<div class="label">Overall Profit (All-Time)</div>
<div class="value" id="dashOverallProfit" style="color: #166534;">₱0.00</div>
<small class="dash-sub">40% operating margin</small>
</div>
<div class="stat-card">
<div class="label">Today's Sales</div>
<div class="value" id="dashTodaySales">₱0.00</div>
<small class="dash-sub" id="dashTodayCount">0 transactions today</small>
</div>
<div class="stat-card">
<div class="label">Total Orders</div>
<div class="value" id="dashTotalOrders">0</div>
<small class="dash-sub">Completed transactions</small>
</div>
<div class="stat-card">
<div class="label">Appointments Today</div>
<div class="value" id="dashAppointmentsToday">0 Scheduled</div>
<small class="dash-sub" id="dashAppointmentsTotal">0 booked overall</small>
</div>
</div>
<div class="dash-section-label">Inventory &amp; Stock</div>
<div class="stats-grid">
<div class="stat-card">
<div class="label">Total Stock (Units)</div>
<div class="value" id="dashStockUnits">0</div>
<small class="dash-sub" id="dashStockProducts">Waiting for inventory...</small>
</div>
<div class="stat-card">
<div class="label">In Stock</div>
<div class="value" id="dashInStock" style="color: #166534;">0</div>
<small class="dash-sub">Products fully available</small>
</div>
<div class="stat-card">
<div class="label">Low Stock Alerts</div>
<div class="value" id="dashLowStock" style="color: #b45309;">0 Items</div>
<small class="dash-sub">At or below threshold</small>
</div>
<div class="stat-card">
<div class="label">Out of Stock</div>
<div class="value" id="dashOutStock" style="color: var(--danger);">0 Items</div>
<small class="dash-sub">Needs restocking</small>
</div>
</div>

`;
const dashboardStyle = document.createElement('style');
dashboardStyle.textContent = '#view-dashboard .dash-section-label{font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin:4px 0 10px;}#view-dashboard .dash-sub{display:block;margin-top:4px;color:var(--text-muted);font-size:0.75rem;}';
document.head.appendChild(dashboardStyle);

let dashboardInventory = null;
function dashboardMoney(value) {
    return '₱' + value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function dashboardText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
}
function dashboardEscape(value) {
    let output = '';
    const text = '' + value;
    for (let i = 0; i < text.length; i++) {
        if (text[i] === '&') output += '&amp;';
        else if (text[i] === '<') output += '&lt;';
        else if (text[i] === '>') output += '&gt;';
        else output += text[i];
    }
    return output;
}
function renderDashboard() {
    const today = getLocalDateString(new Date());
    let revenue = 0, todaySales = 0, todayOrders = 0, todayAppointments = 0;
    for (let i = 0; i < transactionHistory.length; i++) {
        revenue += transactionHistory[i].amount;
        if (transactionHistory[i].date === today) {
            todaySales += transactionHistory[i].amount;
            todayOrders++;
        }
    }
    for (let i = 0; i < appointments.length; i++) {
        if (appointments[i].date === today) todayAppointments++;
    }
    dashboardText('dashTotalRevenue', dashboardMoney(revenue));
    dashboardText('dashOverallProfit', dashboardMoney(revenue * 40 / 100));
    dashboardText('dashTodaySales', dashboardMoney(todaySales));
    dashboardText('dashTodayCount', todayOrders + (todayOrders === 1 ? ' transaction today' : ' transactions today'));
    dashboardText('dashTotalOrders', transactionHistory.length);
    dashboardText('dashAppointmentsToday', todayAppointments + ' Scheduled');
    dashboardText('dashAppointmentsTotal', appointments.length + ' booked overall');
    if (!dashboardInventory) return;
    dashboardText('dashStockUnits', dashboardInventory.units);
    dashboardText('dashStockProducts', 'across ' + dashboardInventory.products + ' products');
    dashboardText('dashInStock', dashboardInventory.inStock);
    dashboardText('dashLowStock', dashboardInventory.low + ' Items');
    dashboardText('dashOutStock', dashboardInventory.out + ' Items');

}
const dashboardRevenueRefresh = calculateOverallRevenue;
calculateOverallRevenue = function () {
    dashboardRevenueRefresh();
    renderDashboard();
};
const dashboardAppointmentRefresh = renderAppointments;
renderAppointments = function (list) {
    dashboardAppointmentRefresh(list);
    renderDashboard();
};
const dashboardTabSwitch = switchTab;
switchTab = function (view, element) {
    dashboardTabSwitch(view, element);
    if (view === 'dashboard') renderDashboard();
};
window.addEventListener('message', function (event) {
    if (window.parent === window || event.source !== window.parent || !event.data) return;
    if (event.data.type !== 'love-luxe-stock') return;
    dashboardInventory = event.data;
    renderDashboard();
});
renderDashboard();

function openEmbeddedOrderView(view) {
    let title = '';
    if (view === 'dashboard') title = 'Dashboard Overview';
    else if (view === 'orders') title = 'New Order / POS';
    else if (view === 'appointments') title = 'Appointments';
    else if (view === 'logs') title = 'Activity Logs';
    else if (view === 'history') title = 'Transaction History';
    else if (view === 'archives') title = 'Transaction Archives';
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

if (window.parent !== window) openEmbeddedOrderView('dashboard');

if (window.parent !== window) window.parent.postMessage({ type: 'love-luxe-ready' }, '*');
