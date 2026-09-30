/* =========================================================
   layout.js — encabezado, menú, búsqueda, carrito lateral,
   pie de página y botón flotante de WhatsApp (todas las páginas)
   ========================================================= */
import { CONFIG, whatsappLink, mapsLink } from '../config.js';
import { api, isDemo } from './api.js';
import { Cart } from './cart.js';
import { icon } from './components.js';
import { $, $$, cop, esc, fold, productImage, debounce, toast, observeReveal } from './util.js';

const NAV = [
  ['index.html', 'Inicio', 'home'],
  ['catalogo.html?coleccion=nueva', 'Nueva colección', 'new'],
  ['catalogo.html?categoria=Jeans', 'Jeans', 'jeans'],
  ['catalogo.html', 'Catálogo', 'catalog'],
  ['index.html#tienda', 'Tienda física', 'store']
];

let productsPromise = null;
/** Catálogo compartido por la búsqueda y el carrito lateral (una sola carga por página) */
export function loadProducts(force = false) {
  if (!productsPromise || force) productsPromise = api.listProducts().catch(e => { productsPromise = null; throw e; });
  return productsPromise;
}

const pending = label => (isDemo ? `<span class="pending">${esc(label)} · por configurar</span>` : '');
const liPending = label => (isDemo ? `<li>${pending(label)}</li>` : '');

export function initLayout({ active = '' } = {}) {
  renderHeader(active);
  renderFooter();
  renderFloating();
  bindCartDrawer();
  bindSearch();
  observeReveal();
  updateCartCount();
  window.addEventListener('cart:change', () => { updateCartCount(); if ($('#cartDrawer').classList.contains('open')) drawCartDrawer(); });
  window.addEventListener('storage', e => { if (e.key && e.key.startsWith('tuhan.cart')) updateCartCount(); });
}

/* ---------- Encabezado ---------- */
function renderHeader(active) {
  const header = $('#site-header');
  header.className = 'site-header';
  header.innerHTML = `
    ${isDemo ? `<div class="demo-bar">Modo demostración · catálogo y pagos de prueba. <a href="admin.html">Panel</a></div>` : ''}
    <div class="announce"><span>${icon.truck} Envíos a todo Colombia</span><span class="hide-sm">Marca 100% colombiana</span><span class="hide-sm">Tienda física · ${esc(CONFIG.store.address.replace('Centro Comercial', 'C.C.'))}</span></div>
    <div class="header-bar container">
      <button class="icon-btn nav-toggle" type="button" aria-label="Abrir menú" aria-expanded="false" aria-controls="mobileNav">${icon.menu}</button>
      <nav class="main-nav" aria-label="Principal">
        ${NAV.slice(0, 4).map(([h, l, k]) => `<a href="${h}" class="${k === active ? 'active' : ''}" ${k === active ? 'aria-current="page"' : ''}>${l}</a>`).join('')}
      </nav>
      <a class="logo" href="index.html" aria-label="${esc(CONFIG.brand.name)} — inicio">
        <img src="${esc(CONFIG.brand.logo)}" alt="${esc(CONFIG.brand.name)}" width="168" height="58">
      </a>
      <div class="header-actions">
        <button class="icon-btn" type="button" data-open-search aria-label="Buscar">${icon.search}</button>
        <a class="icon-btn hide-xs" href="cuenta.html" aria-label="Mi cuenta y pedidos">${icon.user}</a>
        <button class="icon-btn cart-btn" type="button" data-open-cart aria-label="Carrito">
          ${icon.bag}<span class="cart-count" data-cart-count hidden>0</span>
        </button>
      </div>
    </div>
    <div class="mobile-nav" id="mobileNav" hidden>
      <nav aria-label="Menú móvil">
        ${NAV.map(([h, l, k]) => `<a href="${h}" class="${k === active ? 'active' : ''}">${l}</a>`).join('')}
        <a href="cuenta.html">Mi cuenta · consultar pedido</a>
      </nav>
      <div class="mobile-nav-foot">
        ${whatsappLink() ? `<a class="btn btn-gold btn-block" href="${esc(whatsappLink())}" target="_blank" rel="noopener">${icon.whatsapp} Comprar por WhatsApp</a>` : ''}
      </div>
    </div>

    <div class="search-panel" id="searchPanel" role="dialog" aria-modal="true" aria-label="Buscar productos" hidden>
      <div class="container">
        <form class="search-form" role="search" action="catalogo.html">
          ${icon.search}
          <input id="searchInput" name="q" type="search" placeholder="Busca jeans, tops, referencias…" autocomplete="off" aria-label="Buscar">
          <button class="icon-btn" type="button" data-close-search aria-label="Cerrar búsqueda">${icon.close}</button>
        </form>
        <div class="search-results" id="searchResults" aria-live="polite"></div>
      </div>
    </div>

    <div class="drawer-backdrop" data-close-cart hidden></div>
    <aside class="drawer" id="cartDrawer" aria-label="Carrito de compras" aria-hidden="true">
      <div class="drawer-head">
        <h2>Tu carrito</h2>
        <button class="icon-btn" type="button" data-close-cart aria-label="Cerrar carrito">${icon.close}</button>
      </div>
      <div class="drawer-body" id="cartDrawerBody"></div>
    </aside>`;

  const toggle = $('.nav-toggle', header);
  const mobile = $('#mobileNav');
  toggle.addEventListener('click', () => {
    const open = mobile.hidden;
    mobile.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.innerHTML = open ? icon.close : icon.menu;
    document.body.classList.toggle('no-scroll', open);
  });

  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 10);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

function updateCartCount() {
  const n = Cart.count();
  $$('[data-cart-count]').forEach(el => { el.textContent = n; el.hidden = !n; });
  const btn = $('.cart-btn');
  if (btn) btn.setAttribute('aria-label', `Carrito (${n} ${n === 1 ? 'producto' : 'productos'})`);
}

/* ---------- Búsqueda ---------- */
function bindSearch() {
  const panel = $('#searchPanel');
  const input = $('#searchInput');
  const results = $('#searchResults');
  const open = () => { panel.hidden = false; requestAnimationFrame(() => panel.classList.add('open')); input.focus(); };
  const close = () => { panel.classList.remove('open'); setTimeout(() => { panel.hidden = true; }, 200); };

  document.addEventListener('click', e => {
    if (e.target.closest('[data-open-search]')) open();
    else if (e.target.closest('[data-close-search]') || e.target === panel) close();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) close(); });

  input.addEventListener('input', debounce(async () => {
    const q = fold(input.value.trim());
    if (q.length < 2) { results.innerHTML = ''; return; }
    const products = await loadProducts().catch(() => []);
    const found = products.filter(p => fold(`${p.name} ${p.ref} ${p.category} ${p.colors.map(c => c.name).join(' ')}`).includes(q)).slice(0, 6);
    results.innerHTML = found.length
      ? found.map(p => `<a class="search-item" href="producto.html?p=${encodeURIComponent(p.slug)}">
          <img src="${esc(productImage(p))}" alt="" width="48" height="64" loading="lazy">
          <span><strong>${esc(p.name)}</strong><small>Ref. ${esc(p.ref)} · ${cop(p.price)}</small></span></a>`).join('') +
        `<a class="search-all" href="catalogo.html?q=${encodeURIComponent(input.value.trim())}">Ver todos los resultados ${icon.arrow}</a>`
      : '<p class="muted">No encontramos productos con esa búsqueda.</p>';
  }, 180));
}

/* ---------- Carrito lateral ---------- */
export function openCart() {
  const d = $('#cartDrawer');
  $('.drawer-backdrop').hidden = false;
  d.classList.add('open');
  d.setAttribute('aria-hidden', 'false');
  document.body.classList.add('no-scroll');
  drawCartDrawer();
  setTimeout(() => $('[data-close-cart]', d).focus(), 50);
}

function closeCart() {
  const d = $('#cartDrawer');
  d.classList.remove('open');
  d.setAttribute('aria-hidden', 'true');
  $('.drawer-backdrop').hidden = true;
  document.body.classList.remove('no-scroll');
}

function bindCartDrawer() {
  document.addEventListener('click', e => {
    if (e.target.closest('[data-open-cart]')) { e.preventDefault(); openCart(); return; }
    if (e.target.closest('[data-close-cart]')) { closeCart(); return; }
    const step = e.target.closest('[data-drawer-qty]');
    if (step) {
      const line = Cart.items().find(x => x.sku === step.dataset.sku);
      if (!line) return;
      const next = line.qty + Number(step.dataset.drawerQty);
      if (next < 1) return;
      loadProducts().then(ps => {
        const v = ps.flatMap(p => p.variants).find(x => x.sku === line.sku);
        if (v && next > v.stock) return toast(`Solo hay ${v.stock} unidad(es) disponibles.`, 'error');
        Cart.setQty(line.sku, next);
      });
    }
    const rm = e.target.closest('[data-drawer-remove]');
    if (rm) Cart.remove(rm.dataset.drawerRemove);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#cartDrawer').classList.contains('open')) closeCart(); });
}

export async function drawCartDrawer() {
  const body = $('#cartDrawerBody');
  if (!Cart.count()) {
    body.innerHTML = `<div class="drawer-empty">${icon.bag}<p>Tu carrito está vacío.</p><a class="btn btn-dark" href="catalogo.html">Ver catálogo</a></div>`;
    return;
  }
  let products;
  try { products = await loadProducts(); } catch (e) { body.innerHTML = `<p class="muted">No se pudo cargar el carrito.</p>`; return; }
  const lines = Cart.resolve(products);
  const valid = lines.filter(l => !l.unavailable);
  const subtotal = valid.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const free = CONFIG.shipping.freeShippingFrom;
  const missing = free != null ? free - subtotal : null;

  body.innerHTML = `
    ${missing != null ? `<div class="free-ship">
        <p>${missing > 0 ? `Te faltan <strong>${cop(missing)}</strong> para el envío gratis` : '¡Tienes <strong>envío gratis</strong>!'}</p>
        <div class="meter"><span style="width:${Math.min(100, (subtotal / free) * 100)}%"></span></div></div>` : ''}
    <ul class="drawer-lines">
      ${lines.map(l => l.product ? `
        <li class="${l.unavailable ? 'is-out' : ''}">
          <img src="${esc(productImage(l.product))}" alt="" width="72" height="96">
          <div>
            <a href="producto.html?p=${encodeURIComponent(l.product.slug)}"><strong>${esc(l.product.name)}</strong></a>
            <small>Ref. ${esc(l.product.ref)} · ${esc(l.variant.color)} · Talla ${esc(l.variant.size)}</small>
            ${l.unavailable ? '<small class="text-danger">Agotado: retíralo para continuar</small>' : `
            <div class="qty qty-sm">
              <button type="button" data-drawer-qty="-1" data-sku="${esc(l.sku)}" aria-label="Quitar una">${icon.minus}</button>
              <span aria-live="polite">${l.qty}</span>
              <button type="button" data-drawer-qty="1" data-sku="${esc(l.sku)}" aria-label="Agregar una" ${l.qty >= l.variant.stock ? 'disabled' : ''}>${icon.plus}</button>
            </div>`}
          </div>
          <div class="line-end">
            <span>${cop(l.unitPrice * l.qty)}</span>
            <button class="link-btn" type="button" data-drawer-remove="${esc(l.sku)}">Eliminar</button>
          </div>
        </li>` : `
        <li class="is-out"><div><strong>Producto no disponible</strong><small>Ya no está en el catálogo.</small></div>
          <div class="line-end"><button class="link-btn" type="button" data-drawer-remove="${esc(l.sku)}">Eliminar</button></div></li>`).join('')}
    </ul>
    <div class="drawer-foot">
      <div class="row-between"><span>Subtotal</span><strong>${cop(subtotal)}</strong></div>
      <p class="muted small">Envío y descuentos se calculan al finalizar la compra.</p>
      <a class="btn btn-gold btn-block" href="checkout.html" ${valid.length && valid.length === lines.length ? '' : 'aria-disabled="true" data-blocked'}>Finalizar compra</a>
      <a class="btn btn-line btn-block" href="carrito.html">Ver carrito</a>
    </div>`;

  const blocked = $('[data-blocked]', body);
  if (blocked) blocked.addEventListener('click', e => { e.preventDefault(); toast('Retira los productos agotados para continuar.', 'error'); });
}

/* ---------- Pie de página ---------- */
function renderFooter() {
  const f = $('#site-footer');
  const s = CONFIG.store, c = CONFIG.contact, so = CONFIG.social;
  const wa = whatsappLink();
  const maps = mapsLink();
  f.className = 'site-footer';
  f.innerHTML = `
    <div class="footer-cta">
      <div class="container footer-cta-inner reveal">
        <p class="script">Síguenos</p>
        <h2>Inspírate con nuestros outfits en Instagram</h2>
        <a class="btn btn-gold" href="${esc(so.instagram)}" target="_blank" rel="noopener">${icon.instagram} @tuhan__couture</a>
      </div>
    </div>
    <div class="container footer-grid">
      <section class="footer-brand">
        <img src="${esc(CONFIG.brand.logo)}" alt="${esc(CONFIG.brand.name)}" width="200" height="70" loading="lazy">
        <p>${esc(CONFIG.brand.tagline)}. Jeans pensados para resaltar tu figura, con envíos a todo el país.</p>
        <div class="socials">
          <a href="${esc(so.instagram)}" target="_blank" rel="noopener" aria-label="Instagram">${icon.instagram}</a>
          ${so.facebook ? `<a href="${esc(so.facebook)}" target="_blank" rel="noopener" aria-label="Facebook">${icon.facebook}</a>` : ''}
          ${so.tiktok ? `<a href="${esc(so.tiktok)}" target="_blank" rel="noopener" aria-label="TikTok">${icon.tiktok}</a>` : ''}
          ${wa ? `<a href="${esc(wa)}" target="_blank" rel="noopener" aria-label="WhatsApp">${icon.whatsapp}</a>` : ''}
        </div>
        ${so.facebook ? '' : pending('Facebook')}
      </section>

      <section id="footer-tienda">
        <h3>${icon.pin} Punto físico</h3>
        <address>
          <strong>${esc(s.address)}</strong><br>
          ${s.city ? esc(s.city) : pending('Ciudad')}
        </address>
        <div class="hours">${icon.clock}
          ${s.hours && s.hours.length ? `<ul>${s.hours.map(h => `<li>${esc(h)}</li>`).join('')}</ul>` : (pending('Horario de atención') || '<span>Consulta nuestro horario por WhatsApp</span>')}
        </div>
        ${maps ? `<a class="btn btn-line-light btn-sm" href="${esc(maps)}" target="_blank" rel="noopener">${icon.pin} Cómo llegar</a>` : ''}
      </section>

      <section>
        <h3>${icon.phone} Contáctanos</h3>
        <ul class="contact-list">
          ${wa ? `<li><a href="${esc(wa)}" target="_blank" rel="noopener">${icon.whatsapp} WhatsApp · ${esc(c.phone || c.whatsapp)}</a></li>` : ''}
          ${c.phone ? `<li><a href="tel:+57${esc(c.phone.replace(/\D/g, ''))}">${icon.phone} ${esc(c.phone)}</a></li>` : liPending('Teléfono')}
          ${c.email ? `<li><a href="mailto:${esc(c.email)}">${icon.mail} ${esc(c.email)}</a></li>` : liPending('Correo electrónico')}
          <li><a href="${esc(so.instagram)}" target="_blank" rel="noopener">${icon.instagram} Instagram</a></li>
          ${so.facebook ? `<li><a href="${esc(so.facebook)}" target="_blank" rel="noopener">${icon.facebook} Facebook</a></li>` : ''}
          ${so.tiktok ? `<li><a href="${esc(so.tiktok)}" target="_blank" rel="noopener">${icon.tiktok} TikTok</a></li>` : ''}
        </ul>
      </section>

      <section>
        <h3>${icon.shield} Ayuda</h3>
        <ul class="link-list">
          <li><a href="cuenta.html">Consultar mi pedido</a></li>
          <li><a href="catalogo.html#guia-tallas">Guía de tallas</a></li>
          <li><a href="cambios-devoluciones.html">Cambios y devoluciones</a></li>
          <li><a href="terminos.html">Términos y condiciones</a></li>
          <li><a href="privacidad.html">Política de privacidad</a></li>
        </ul>
      </section>
    </div>

    <div class="container footer-pay">
      <h3>${icon.card} Medios de pago</h3>
      <ul class="pay-list">${CONFIG.payments.methods.map(m => `<li>${esc(m)}</li>`).join('')}</ul>
      <p class="small">${icon.shield} Pagos procesados de forma segura por ${CONFIG.payments.provider === 'wompi' ? 'Wompi (Bancolombia)' : esc(CONFIG.payments.provider)}.</p>
    </div>

    <div class="footer-bottom">
      <div class="container row-between">
        <span>© ${new Date().getFullYear()} ${esc(CONFIG.brand.name)} · ${esc(CONFIG.brand.tagline)}</span>
        <span><a href="privacidad.html">Privacidad</a> · <a href="terminos.html">Términos</a> · <a href="cambios-devoluciones.html">Cambios</a></span>
      </div>
    </div>`;
}

function renderFloating() {
  const wa = whatsappLink();
  if (!wa) return;
  const a = document.createElement('a');
  a.className = 'wa-float';
  a.href = wa;
  a.target = '_blank';
  a.rel = 'noopener';
  a.setAttribute('aria-label', 'Escríbenos por WhatsApp');
  a.innerHTML = icon.whatsapp + '<span>¿Te ayudamos?</span>';
  document.body.appendChild(a);
}
