import { CONFIG, whatsappLink } from '../config.js';
import { initLayout, loadProducts } from '../core/layout.js';
import { api, isDemo, ORDERS_KEY } from '../core/api.js';
import { Cart } from '../core/cart.js';
import { icon } from '../core/components.js';
import { quote, PROMO_KEY } from '../core/pricing.js';
import { $, $$, cop, esc, productImage, toast } from '../core/util.js';

initLayout();


const DEPARTMENTS = ['Amazonas', 'Antioquia', 'Arauca', 'Atlántico', 'Bogotá D.C.', 'Bolívar', 'Boyacá', 'Caldas', 'Caquetá', 'Casanare',
  'Cauca', 'Cesar', 'Chocó', 'Córdoba', 'Cundinamarca', 'Guainía', 'Guaviare', 'Huila', 'La Guajira', 'Magdalena', 'Meta', 'Nariño',
  'Norte de Santander', 'Putumayo', 'Quindío', 'Risaralda', 'San Andrés y Providencia', 'Santander', 'Sucre', 'Tolima',
  'Valle del Cauca', 'Vaupés', 'Vichada'];

const root = $('#checkoutRoot');
let products = [];
let promo = null;
let method = 'shipping';

(async () => {
  try { products = await loadProducts(); } catch (e) {
    root.innerHTML = '<p class="empty-state">No pudimos cargar tu carrito. Intenta de nuevo.</p>';
    return;
  }
  const lines = Cart.resolve(products);
  if (!lines.length) {
    root.innerHTML = `<div class="empty-state">${icon.bag}<h2>Tu carrito está vacío</h2><a class="btn btn-dark" href="catalogo.html">Ver catálogo</a></div>`;
    return;
  }
  if (lines.some(l => l.unavailable)) { location.replace('carrito.html'); return; }
  const code = sessionStorage.getItem(PROMO_KEY);
  if (code) {
    const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
    promo = await api.findPromotion(code, subtotal).catch(() => null);
  }
  renderForm(lines);
})();

function field(id, label, input, hint = '') {
  return `<div class="field"><label for="${id}">${label}</label>${input}${hint ? `<span class="hint">${hint}</span>` : ''}<span class="err" id="${id}-err" role="alert"></span></div>`;
}

function renderForm(lines) {
  root.innerHTML = `
    <div class="checkout-layout">
      <form class="form" id="checkoutForm" novalidate>
        <section class="form-section" aria-labelledby="s1">
          <h2 id="s1"><span class="step">1</span> Tus datos</h2>
          ${field('name', 'Nombre completo', '<input class="input" id="name" name="name" autocomplete="name" required maxlength="120">')}
          <div class="form-row r-doc">
            ${field('docType', 'Documento', `<select class="select" id="docType" name="docType" required>
                <option value="CC">Cédula de ciudadanía</option><option value="CE">Cédula de extranjería</option>
                <option value="PP">Pasaporte</option><option value="NIT">NIT</option></select>`)}
            ${field('docNumber', 'Número de documento', '<input class="input" id="docNumber" name="docNumber" inputmode="numeric" required maxlength="15">')}
          </div>
          <div class="form-row">
            ${field('email', 'Correo electrónico', '<input class="input" id="email" name="email" type="email" autocomplete="email" required maxlength="120">', 'Te enviaremos la confirmación del pedido.')}
            ${field('phone', 'Celular', '<input class="input" id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel-national" required maxlength="15" placeholder="3001234567">')}
          </div>
        </section>

        <section class="form-section" aria-labelledby="s2">
          <h2 id="s2"><span class="step">2</span> Entrega</h2>
          <div class="radio-cards" role="radiogroup" aria-label="Método de entrega">
            <label class="radio-card"><input type="radio" name="method" value="shipping" checked>
              <span><strong>Envío a domicilio</strong><small>Todo Colombia · ${esc(CONFIG.shipping.estimatedDays)}</small></span></label>
            ${CONFIG.shipping.storePickup ? `<label class="radio-card"><input type="radio" name="method" value="pickup">
              <span><strong>Recoger en tienda · gratis</strong><small>${esc(CONFIG.store.address)}${CONFIG.store.city ? ', ' + esc(CONFIG.store.city) : ''}</small></span></label>` : ''}
          </div>
          <div id="addressFields" class="form">
            <div class="form-row">
              ${field('department', 'Departamento', `<select class="select" id="department" name="department" required>
                  <option value="">Selecciona…</option>${DEPARTMENTS.map(d => `<option>${d}</option>`).join('')}</select>`)}
              ${field('city', 'Ciudad o municipio', '<input class="input" id="city" name="city" autocomplete="address-level2" required maxlength="80">')}
            </div>
            ${field('address', 'Dirección', '<input class="input" id="address" name="address" autocomplete="street-address" required maxlength="160" placeholder="Calle 00 # 00 - 00">')}
            ${field('details', 'Barrio, apartamento o indicaciones (opcional)', '<input class="input" id="details" name="details" maxlength="160">')}
          </div>
          ${field('notes', 'Notas del pedido (opcional)', '<textarea class="input" id="notes" name="notes" maxlength="500"></textarea>')}
        </section>

        <section class="form-section" aria-labelledby="s3">
          <h2 id="s3"><span class="step">3</span> Pago</h2>
          ${isDemo
            ? '<p class="notice">Modo demostración: al pagar verás una pasarela <strong>de prueba</strong> para aprobar o rechazar el pago. No se cobra nada.</p>'
            : `<p class="notice">Al continuar te llevaremos a <strong>Wompi (Bancolombia)</strong>, la pasarela segura donde eliges tu medio de pago. Tu pedido se confirma solo cuando Wompi aprueba el pago.</p>`}
          <ul class="pay-list" style="margin:0">${CONFIG.payments.methods.map(m => `<li style="border-color:var(--line);background:var(--cream)">${esc(m)}</li>`).join('')}</ul>
          ${(CONFIG.payments.credit || []).length && whatsappLink() ? `
            <p class="small muted" style="margin:0">¿Prefieres comprar a crédito con ${esc(CONFIG.payments.credit.join(', ').replace(/, ([^,]*)$/, ' o $1'))}?
              <a href="${esc(whatsappLink('Hola TUHAN COUTURE, quiero comprar a crédito con ' + CONFIG.payments.credit.join(', ') + '. ¿Cómo lo hago?'))}" target="_blank" rel="noopener">Escríbenos por WhatsApp</a>.</p>` : ''}
          <label class="check"><input type="checkbox" id="terms" required>
            <span>Acepto los <a href="terminos.html" target="_blank">términos y condiciones</a> y la <a href="cambios-devoluciones.html" target="_blank">política de cambios y devoluciones</a>.</span></label>
          <label class="check"><input type="checkbox" id="privacy" required>
            <span>Autorizo el tratamiento de mis datos personales según la <a href="privacidad.html" target="_blank">política de privacidad</a> (Ley 1581 de 2012).</span></label>
          <span class="err" id="consent-err" role="alert"></span>
        </section>
      </form>

      <aside class="summary" aria-label="Resumen del pedido" id="summary"></aside>
    </div>

    <dialog class="modal" id="demoPay" aria-labelledby="demoPayTitle">
      <div class="modal-head"><h2 id="demoPayTitle">Pasarela de prueba</h2></div>
      <div class="modal-body">
        <p>Modo demostración: elige el resultado del pago para ver cómo responde la tienda.</p>
        <p class="notice" id="demoPayInfo"></p>
      </div>
      <div class="modal-foot">
        <button class="btn btn-line" type="button" data-result="decline">Rechazar pago</button>
        <button class="btn btn-gold" type="button" data-result="approve">Aprobar pago</button>
      </div>
    </dialog>`;

  const form = $('#checkoutForm');
  form.addEventListener('change', e => {
    if (e.target.name === 'method') {
      method = e.target.value;
      $('#addressFields').hidden = method === 'pickup';
      drawSummary(lines);
    }
  });
  form.addEventListener('input', e => {
    if (e.target.getAttribute('aria-invalid') === 'true') setError(e.target.id, '');
  });
  drawSummary(lines);
}

function drawSummary(lines) {
  const totals = quote(lines.map(l => ({ unitPrice: l.unitPrice, qty: l.qty })), { method, promo });
  $('#summary').innerHTML = `
    <h2>Tu pedido</h2>
    <ul class="summary-lines">${lines.map(l => `
      <li>
        <span class="thumb"><img src="${esc(productImage(l.product))}" alt="" width="56" height="74"><b>${l.qty}</b></span>
        <span><strong>${esc(l.product.name)}</strong><small>Ref. ${esc(l.product.ref)} · ${esc(l.variant.color)} · Talla ${esc(l.variant.size)}</small></span>
        <span>${cop(l.unitPrice * l.qty)}</span>
      </li>`).join('')}</ul>
    <div class="row-between"><span>Subtotal</span><span>${cop(totals.subtotal)}</span></div>
    ${totals.discount ? `<div class="row-between discount"><span>Descuento (${esc(promo.code)})</span><span>− ${cop(totals.discount)}</span></div>` : ''}
    <div class="row-between"><span>${method === 'pickup' ? 'Recoger en tienda' : 'Envío'}</span><span>${totals.shipping ? cop(totals.shipping) : 'Gratis'}</span></div>
    <div class="row-between total"><span>Total</span><span>${cop(totals.total)}</span></div>
    <button class="btn btn-gold btn-block" type="submit" form="checkoutForm" id="payBtn">${icon.shield} Pagar ${cop(totals.total)}</button>
    <p class="secure-note">${icon.shield} Tu inventario queda apartado mientras completas el pago.</p>
    <a class="btn btn-ghost btn-sm" href="carrito.html">← Editar carrito</a>`;

  $('#checkoutForm').onsubmit = e => { e.preventDefault(); submit(lines); };
}

function setError(id, msg) {
  const el = document.getElementById(id);
  const err = document.getElementById(id + '-err');
  if (el) el.setAttribute('aria-invalid', msg ? 'true' : 'false');
  if (err) err.textContent = msg;
  return !msg;
}

function validate() {
  const v = id => ($('#' + id).value || '').trim();
  let ok = true;
  const check = (id, cond, msg) => { if (!setError(id, cond ? '' : msg)) ok = false; };
  check('name', v('name').length >= 5 && /\s/.test(v('name')), 'Escribe tu nombre y apellido.');
  check('docNumber', /^[0-9A-Za-z-]{5,15}$/.test(v('docNumber')), 'Número de documento no válido.');
  check('email', /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v('email')), 'Correo no válido.');
  check('phone', /^3\d{9}$/.test(v('phone').replace(/\D/g, '')), 'Escribe un celular colombiano de 10 dígitos.');
  if (method === 'shipping') {
    check('department', !!v('department'), 'Selecciona el departamento.');
    check('city', v('city').length >= 3, 'Escribe la ciudad o municipio.');
    check('address', v('address').length >= 6, 'Escribe la dirección completa.');
  }
  const consent = $('#terms').checked && $('#privacy').checked;
  $('#consent-err').textContent = consent ? '' : 'Debes aceptar los términos y autorizar el tratamiento de datos para continuar.';
  if (!consent) ok = false;
  if (!ok) {
    const first = document.querySelector('[aria-invalid="true"]') || (!consent && $('#terms'));
    if (first) first.focus();
  }
  return ok;
}

async function submit(lines) {
  if (!validate()) return;
  const btn = $('#payBtn');
  if (btn.disabled) return;
  btn.disabled = true;
  const v = id => ($('#' + id).value || '').trim();
  try {
    const order = await api.createOrder({
      customer: { name: v('name'), docType: v('docType'), docNumber: v('docNumber'), email: v('email').toLowerCase(), phone: v('phone').replace(/\D/g, '') },
      delivery: method === 'pickup'
        ? { method: 'pickup' }
        : { method: 'shipping', department: v('department'), city: v('city'), address: v('address'), details: v('details') },
      items: lines.map(l => ({ sku: l.sku, qty: l.qty })),
      promoCode: promo ? promo.code : null,
      notes: v('notes')
    });
    rememberOrder(order);

    if (isDemo) {
      await demoPayment(order);
    } else {
      await api.startPayment(order); // redirige a Wompi
    }
  } catch (ex) {
    toast(ex.message, 'error');
    // El inventario pudo cambiar: recarga para mostrar lo disponible
    if (/agot|quedan|disponible/i.test(ex.message)) setTimeout(() => location.replace('carrito.html'), 1800);
  } finally {
    btn.disabled = false;
  }
}

function rememberOrder(order) {
  try {
    const list = JSON.parse(localStorage.getItem(ORDERS_KEY) || '[]').filter(x => x.number !== order.number);
    list.unshift({ number: order.number, token: order.token, createdAt: order.createdAt, total: order.total });
    localStorage.setItem(ORDERS_KEY, JSON.stringify(list.slice(0, 20)));
  } catch (e) { /* sin almacenamiento */ }
}

function demoPayment(order) {
  return new Promise(resolve => {
    const dlg = $('#demoPay');
    $('#demoPayInfo').innerHTML = `Pedido <strong>${esc(order.number)}</strong> · Total <strong>${cop(order.total)}</strong>`;
    dlg.showModal();
    dlg.addEventListener('cancel', e => e.preventDefault());
    dlg.querySelectorAll('[data-result]').forEach(b => {
      b.onclick = async () => {
        dlg.querySelectorAll('button').forEach(x => { x.disabled = true; });
        const approved = b.dataset.result === 'approve';
        await api.completeDemoPayment(order.number, order.token, approved);
        if (approved) { Cart.clear(); sessionStorage.removeItem(PROMO_KEY); }
        location.assign(`pedido.html?n=${encodeURIComponent(order.number)}&t=${encodeURIComponent(order.token)}`);
        resolve();
      };
    });
  });
}
