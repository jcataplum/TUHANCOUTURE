import { initLayout } from '../core/layout.js';
import { api, ORDERS_KEY } from '../core/api.js';
import { $, cop, esc, fmtDateTime, busy } from '../core/util.js';

initLayout();

let recent = [];
try { recent = JSON.parse(localStorage.getItem(ORDERS_KEY) || '[]'); } catch (e) { recent = []; }

$('#accountRoot').innerHTML = `
  <div class="cart-layout" style="padding-bottom:72px">
    <section class="form-section" aria-labelledby="lookupTitle">
      <h2 id="lookupTitle">Consultar un pedido</h2>
      <form class="form" id="lookupForm" novalidate>
        <div class="form-row">
          <div class="field"><label for="lkNumber">Número de pedido</label>
            <input class="input" id="lkNumber" placeholder="TC-000123" required autocomplete="off" style="text-transform:uppercase"></div>
          <div class="field"><label for="lkEmail">Correo de la compra</label>
            <input class="input" id="lkEmail" type="email" required autocomplete="email"></div>
        </div>
        <p class="err" id="lkErr" role="alert" style="color:var(--danger);margin:0"></p>
        <button class="btn btn-dark" type="submit">Consultar</button>
      </form>
    </section>
    <aside class="summary" aria-labelledby="recentTitle">
      <h2 id="recentTitle">En este dispositivo</h2>
      ${recent.length ? `<ul class="link-list" style="list-style:none;padding:0;margin:0;display:grid;gap:12px">${recent.map(o => `
        <li><a href="pedido.html?n=${encodeURIComponent(o.number)}&t=${encodeURIComponent(o.token)}"><strong>${esc(o.number)}</strong></a>
          <small class="muted" style="display:block">${fmtDateTime(o.createdAt)} · ${cop(o.total)}</small></li>`).join('')}</ul>`
        : '<p class="muted small">Aquí verás los pedidos que hagas desde este navegador.</p>'}
    </aside>
  </div>`;

$('#lookupForm').addEventListener('submit', async e => {
  e.preventDefault();
  const number = $('#lkNumber').value.trim().toUpperCase();
  const email = $('#lkEmail').value.trim().toLowerCase();
  const err = $('#lkErr');
  if (!number || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { err.textContent = 'Escribe el número de pedido y un correo válido.'; return; }
  err.textContent = '';
  const order = await busy(e.submitter, () => api.lookupOrder(number, email));
  if (order === undefined) return;
  if (!order) { err.textContent = 'No encontramos un pedido con esos datos.'; return; }
  location.assign(`pedido.html?n=${encodeURIComponent(order.number)}&t=${encodeURIComponent(order.token)}`);
});
