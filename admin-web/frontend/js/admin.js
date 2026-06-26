'use strict';

const API = '/api/mwt';
const token = () => localStorage.getItem('mwt_admin_token') || '';
const auth  = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` });

// ── Router ──────────────────────────────────────────────────────────────────
function activateTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
  document.getElementById(`tab-${name}`)?.classList.add('active');
  document.querySelector(`.nav-links a[data-tab="${name}"]`)?.classList.add('active');
  ({ billing: loadBilling, vat: loadOss, availability: loadAvailability, gdpr: loadGdpr, legal: loadLegal }[name] || (() => {}))();
}

document.querySelectorAll('.nav-links a[data-tab]').forEach(a => {
  a.addEventListener('click', e => { e.preventDefault(); activateTab(a.dataset.tab); });
});

// ── Helpers ─────────────────────────────────────────────────────────────────
const fmt = {
  money: (cents, cur = 'EUR') =>
    new Intl.NumberFormat('nl-NL', { style: 'currency', currency: cur }).format((cents ?? 0) / 100),
  date: d => d ? new Date(d).toLocaleDateString('nl-NL') : '—',
  tier: t => {
    const map = { pigeon: ['Pigeon','badge-tier-pigeon'], tits: ['Tits','badge-tier-tits'],
                  flock_of_geese: ['Flock','badge-tier-flock'],
                  sustainability: ['Sustainability','badge-tier-sust'], business: ['Business','badge-tier-business'] };
    const [label, cls] = map[t] || [t, ''];
    return `<span class="badge ${cls}">${label}</span>`;
  },
  status: s => {
    const map = { pending: 'badge-status-pending', in_progress: 'badge-status-progress',
                  completed: 'badge-status-completed', rejected: 'badge-status-rejected' };
    return `<span class="badge ${map[s] || ''}">${s}</span>`;
  },
};

// ── Billing ─────────────────────────────────────────────────────────────────
async function loadBilling() {
  const rows = await fetch(`${API}/billing`, { headers: auth() }).then(r => r.json());

  const total = rows.reduce((s, r) => s + Number(r.total_paid_cents || 0), 0);
  const paid  = rows.filter(r => r.payment_count > 0).length;
  document.getElementById('billing-stats').innerHTML = `
    <div class="stat-card"><div class="label">Total customers</div><div class="value">${rows.length}</div></div>
    <div class="stat-card"><div class="label">Paying customers</div><div class="value">${paid}</div></div>
    <div class="stat-card"><div class="label">Total revenue</div><div class="value">${fmt.money(total)}</div></div>`;

  document.getElementById('customers-body').innerHTML = rows.map(r => `
    <tr>
      <td><code>${r.account_pin}</code></td>
      <td>${fmt.tier(r.tier)}</td>
      <td>${r.email}</td>
      <td style="text-align:right">${r.payment_count}</td>
      <td style="text-align:right">${fmt.money(r.total_paid_cents)}</td>
      <td>${fmt.date(r.created_at)}</td>
      <td><button class="btn-link" onclick="showCustomer(${r.id})">events</button></td>
    </tr>`).join('');
}

window.showCustomer = async (id) => {
  const events = await fetch(`${API}/billing/${id}/events`, { headers: auth() }).then(r => r.json());
  alert(events.map(e =>
    `${fmt.date(e.created_at)}  ${e.invoice_number}  ${e.product}  ${fmt.money(e.amount_cents)}  ${e.multisafepay_status}`
  ).join('\n') || 'No events');
};

// ── Availability & waitlist ───────────────────────────────────────────────────
async function loadAvailability() {
  const [flags, waitlist] = await Promise.all([
    fetch(`${API}/admin/flags`,    { headers: auth() }).then(r => r.json()),
    fetch(`${API}/admin/waitlist`, { headers: auth() }).then(r => r.json()),
  ]);

  // Index waitlist by country for quick lookup
  const wlMap = Object.fromEntries(waitlist.map(w => [w.country_code, w]));

  document.getElementById('flags-body').innerHTML = flags.map(f => {
    const wl = wlMap[f.country_code] || {};
    const pending = Number(wl.pending || 0);
    return `<tr>
      <td><b>${f.country_code}</b></td>
      <td>
        <label class="toggle" title="${f.notes || ''}">
          <input type="checkbox" ${f.paid_available ? 'checked' : ''}
            onchange="toggleFlag('${f.country_code}', this.checked)">
          <span class="badge ${f.paid_available ? 'badge-status-completed' : 'badge-status-pending'}">
            ${f.paid_available ? 'Live' : 'Free only'}
          </span>
        </label>
      </td>
      <td>${pending > 0 ? `<span class="badge badge-tier-business">${pending}</span>` : '—'}</td>
      <td>${f.launch_date ? fmt.date(f.launch_date) : '—'}</td>
      <td>
        ${!f.paid_available && pending > 0
          ? `<button class="btn-link" onclick="setLaunchDate('${f.country_code}')">set date</button>`
          : ''}
      </td>
    </tr>`;
  }).join('');

  document.getElementById('waitlist-body').innerHTML = waitlist.map(w => `
    <tr>
      <td><b>${w.country_code}</b></td>
      <td style="text-align:right">${w.pending}</td>
      <td style="text-align:right;color:var(--muted)">${w.notified}</td>
      <td>
        ${Number(w.pending) > 0
          ? `<button class="btn btn-sm" onclick="notifyWaitlist('${w.country_code}', ${w.pending})">
               Notify ${w.pending}
             </button>`
          : '—'}
      </td>
    </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--muted)">No waitlist entries</td></tr>';
}

window.toggleFlag = async (cc, enabled) => {
  await fetch(`${API}/admin/flags/${cc}`, {
    method: 'PATCH', headers: auth(),
    body: JSON.stringify({ paid_available: enabled }),
  });
  loadAvailability();
};

window.setLaunchDate = async (cc) => {
  const d = prompt(`Planned launch date for ${cc} (YYYY-MM-DD):`);
  if (!d) return;
  await fetch(`${API}/admin/flags/${cc}`, {
    method: 'PATCH', headers: auth(),
    body: JSON.stringify({ launch_date: d }),
  });
  loadAvailability();
};

window.notifyWaitlist = async (cc, count) => {
  if (!confirm(`Send launch email to ${count} waitlist entries for ${cc}?\n\nMake sure paid is toggled ON first.`)) return;
  const r = await fetch(`${API}/admin/waitlist/${cc}/notify`, { method: 'POST', headers: auth() }).then(r => r.json());
  alert(`Sent: ${r.notified} / ${r.total}`);
  loadAvailability();
};

// ── VAT OSS ──────────────────────────────────────────────────────────────────
function loadOss() {
  const now  = new Date();
  const year = Number(document.getElementById('oss-year').value) || now.getFullYear();
  const q    = Number(document.getElementById('oss-quarter').value) || Math.ceil((now.getMonth() + 1) / 3);
  document.getElementById('oss-year').value    = year;
  document.getElementById('oss-quarter').value = q;
  fetchOss(year, q);
}

async function fetchOss(year, quarter) {
  const qs = `year=${year}&quarter=${quarter}`;
  const [eu, uk, row] = await Promise.all([
    fetch(`${API}/billing/oss-report?${qs}`,   { headers: auth() }).then(r => r.json()),
    fetch(`${API}/billing/uk-vat-report?${qs}`, { headers: auth() }).then(r => r.json()),
    fetch(`${API}/billing/row-revenue?${qs}`,   { headers: auth() }).then(r => r.json()),
  ]);

  // EU OSS
  const banner = document.getElementById('oss-threshold-banner');
  banner.style.display = 'block';
  banner.className = eu.below_threshold ? 'oss-banner oss-banner-ok' : 'oss-banner oss-banner-warn';
  banner.textContent = eu.below_threshold
    ? 'Below €10,000 annual OSS threshold — NL 21% applies to all EU sales this quarter.'
    : 'Above threshold — country-specific OSS rates apply. Enter figures into Belastingdienst OSS portal.';

  const euNet  = (eu.by_country||[]).reduce((s,r) => s+Number(r.net_cents||0), 0);
  const euVat  = (eu.by_country||[]).reduce((s,r) => s+Number(r.vat_cents||0), 0);
  const euGross= (eu.by_country||[]).reduce((s,r) => s+Number(r.gross_cents||0), 0);
  document.getElementById('oss-stats').innerHTML = `
    <div class="stat-card"><div class="label">EU net sales</div><div class="value">${fmt.money(euNet)}</div></div>
    <div class="stat-card"><div class="label">EU VAT to remit</div><div class="value">${fmt.money(euVat)}</div></div>
    <div class="stat-card"><div class="label">EU gross</div><div class="value">${fmt.money(euGross)}</div></div>`;

  document.getElementById('oss-body').innerHTML = (eu.by_country||[]).map(r => `
    <tr>
      <td><b>${r.country_code}</b></td>
      <td>${r.vat_rate_pct}%</td>
      <td style="text-align:right">${fmt.money(r.net_cents)}</td>
      <td style="text-align:right;font-weight:600;color:var(--green)">${fmt.money(r.vat_cents)}</td>
      <td style="text-align:right">${fmt.money(r.gross_cents)}</td>
      <td style="text-align:right">${r.transaction_count}</td>
    </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--muted)">No EU transactions this quarter</td></tr>';

  // UK VAT
  document.getElementById('uk-stats').innerHTML = `
    <div class="stat-card"><div class="label">UK net sales</div><div class="value">${fmt.money(uk.net_cents||0, 'GBP')}</div></div>
    <div class="stat-card"><div class="label">UK VAT 20% to remit</div><div class="value">${fmt.money(uk.vat_cents||0, 'GBP')}</div></div>
    <div class="stat-card"><div class="label">UK gross</div><div class="value">${fmt.money(uk.gross_cents||0, 'GBP')}</div></div>`;

  // ROW
  const rowGross = Number(row.total_gross_cents||0);
  document.getElementById('row-stats').innerHTML = `
    <div class="stat-card"><div class="label">ROW gross (no tax)</div><div class="value">${fmt.money(rowGross)}</div></div>
    <div class="stat-card"><div class="label">Countries</div><div class="value">${(row.by_country||[]).length}</div></div>`;

  document.getElementById('row-body').innerHTML = (row.by_country||[]).map(r => `
    <tr>
      <td><b>${r.country_code}</b></td>
      <td style="text-align:right;color:var(--muted)">${fmt.money(r.gross_cents)}</td>
      <td style="text-align:right">${r.transaction_count}</td>
    </tr>`).join('') || '<tr><td colspan="3" style="text-align:center;color:var(--muted)">No ROW transactions this quarter</td></tr>';
}

// Initialise year/quarter on tab open
document.getElementById('oss-year').value = new Date().getFullYear();
document.getElementById('oss-quarter').value = Math.ceil((new Date().getMonth() + 1) / 3);

// ── GDPR ────────────────────────────────────────────────────────────────────
async function loadGdpr() {
  const rows = await fetch(`${API}/gdpr`, { headers: auth() }).then(r => r.json());
  const overdue = rows.filter(r => r.overdue).length;
  const badge = document.getElementById('gdpr-overdue-count');
  badge.textContent = overdue > 0 ? `${overdue} overdue` : '';
  badge.className   = overdue > 0 ? 'badge badge-overdue' : 'badge';

  document.getElementById('gdpr-body').innerHTML = rows.map(r => `
    <tr style="${r.overdue ? 'background:#fff5f5' : ''}">
      <td>#${r.id}</td>
      <td>${r.request_type}</td>
      <td><code>${r.account_pin || '—'}</code></td>
      <td>${r.email}</td>
      <td>${fmt.status(r.status)}</td>
      <td style="${r.overdue ? 'color:var(--danger);font-weight:600' : ''}">${fmt.date(r.due_at)}</td>
      <td><button class="btn-link" onclick="openGdprModal(${r.id},'${r.status}')">update</button></td>
    </tr>`).join('');
}

window.openGdprModal = (id, status) => {
  document.getElementById('gdpr-modal-id').value = id;
  document.getElementById('gdpr-modal-status').value = status;
  document.getElementById('gdpr-modal-handler').value = '';
  document.getElementById('gdpr-modal-notes').value = '';
  document.getElementById('gdpr-modal').showModal();
};

document.getElementById('gdpr-modal-save')?.addEventListener('click', async () => {
  const id      = document.getElementById('gdpr-modal-id').value;
  const status  = document.getElementById('gdpr-modal-status').value;
  const handler = document.getElementById('gdpr-modal-handler').value;
  const notes   = document.getElementById('gdpr-modal-notes').value;
  await fetch(`${API}/gdpr/${id}`, {
    method: 'PATCH', headers: auth(),
    body: JSON.stringify({ status, handler, notes }),
  });
  document.getElementById('gdpr-modal').close();
  loadGdpr();
});

document.getElementById('gdpr-modal-cancel')?.addEventListener('click', () => {
  document.getElementById('gdpr-modal').close();
});

// ── Legal ────────────────────────────────────────────────────────────────────
let currentLegalPage = 'terms_of_service';

async function loadLegal() {
  await showLegalPage(currentLegalPage);
}

async function showLegalPage(type) {
  currentLegalPage = type;
  document.querySelectorAll('.legal-nav .btn-sm').forEach(b =>
    b.classList.toggle('active', b.dataset.page === type));
  const data = await fetch(`${API}/legal/current/${type}`).then(r => r.ok ? r.json() : null);
  document.getElementById('legal-current').textContent =
    data ? `Version ${data.version} — effective ${data.effective_at}\n\n${data.content_md}`
         : 'No version published yet.';
}

document.querySelectorAll('.legal-nav .btn-sm').forEach(b =>
  b.addEventListener('click', () => showLegalPage(b.dataset.page)));

document.getElementById('legal-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  await fetch(`${API}/legal/${currentLegalPage}`, {
    method: 'POST', headers: auth(),
    body: JSON.stringify(Object.fromEntries(fd)),
  });
  e.target.reset();
  showLegalPage(currentLegalPage);
});

// ── Boot ─────────────────────────────────────────────────────────────────────
// In production, the token is set by the shared tax-portal login session.
// For dev, set it manually: localStorage.setItem('mwt_admin_token', '...')
activateTab('billing');
