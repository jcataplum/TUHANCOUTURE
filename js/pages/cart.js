import { CONFIG } from '../config.js';
import { initLayout, loadProducts } from '../core/layout.js';
import { api } from '../core/api.js';
import { Cart } from '../core/cart.js';
import { icon } from '../core/components.js';
import { quote, PROMO_KEY } from '../core/pricing.js';
import { $, cop, esc, productImage, stockBadge, toast, busy } from '../core/util.js';

initLayout();

const root = $('#cartRoot');

let products = [];
let promo = null;

(async () => {
  try { products = await loadProducts(); } catch (e) {
    root.innerHTML = '<p class="empty-state">No pudimos cargar tu carrito. Intenta de nuevo.</p>';
    return;
  }
  const saved = sessionStorage.getItem(PROMO_KEY);
  if (saved) {
    const subtotal = Cart.resolve(products).filter(l => !l.unavailable).reduce((s, l) => s + l.unitPrice * l.qty, 0);
    promo = await api.findPromotion(saved, subtotal).catch(() => { sessionStorage.removeItem(PROMO_KEY); return null; });
  }
  render();
  window.addEventListener('cart:change', render);
})();

function render() {
  const lines = Cart.resolve(products);
  if (!lines.length) {
    root.innerHTML = `<div class="empty-state">${icon.bag}<h2>Tu carrito está vacío</h2><p>Descubre nuestra nueva colección.</p>
      <a class="btn btn-dark" href="catalogo.html">Ver catálogo</a></div>`;
    return;
  }
  const valid = lines.filter(l => !l.unavailable);
  const totals = quote(valid.map(l => ({ unitPrice: l.unitPrice, qty: l.qty })), { method: 'shipping', promo });
  const hasBlocked = valid.length !== lines.length;

  root.innerHTML = `
    <div class="cart-layout">
      <div>
        <table class="cart-table">
          <thead><tr><th scope="col">Producto</th><th scope="col">Precio</th><th scope="col">Cantidad</th><th scope="col">Subtotal</th><th><span class="visually-hidden">Acciones</span></th></tr></thead>
          <tbody>${lines.map(lineRow).join('')}</tbody>
        </table>
        <p style="margin-top:20px"><a class="btn btn-ghost" href="catalogo.html">← Seguir comprando</a></p>
      </div>
      <aside class="summary" aria-label="Resumen del pedido">
        <h2>Resumen</h2>
        <div class="row-between"><span>Subtotal</span><span>${cop(totals.subtotal)}</span></div>
        ${totals.discount ? `<div class="row-between discount"><span>Descuento (${esc(promo.code)}) <button class="link-btn" type="button" id="removePromo">Quitar</button></span><span>− ${cop(totals.discount)}</span></div>` : ''}
        <div class="row-between"><span>Envío nacional</span><span>${totals.shipping ? cop(totals.shipping) : 'Gratis'}</span></div>
        ${CONFIG.shipping.storePickup ? '<p class="small muted" style="margin:0">Si recoges en tienda, el envío es gratis (lo eliges al finalizar).</p>' : ''}
        <div class="row-between total"><span>Total</span><span>${cop(totals.total)}</span></div>
        ${promo ? '' : `
        <form class="promo-form" id="promoForm">
          <label class="visually-hidden" for="promoCode">Código de descuento</label>
          <input class="input" id="promoCode" placeholder="Código de descuento" autocomplete="off" maxlength="30">
          <button class="btn btn-line btn-sm" type="submit">Aplicar</button>
        </form>`}
        ${hasBlocked ? '<p class="notice notice-danger">Hay productos agotados en tu carrito. Retíralos para continuar.</p>' : ''}
        <a class="btn btn-gold btn-block" href="checkout.html" id="goCheckout" ${hasBlocked ? 'aria-disabled="true"' : ''}>Finalizar compra</a>
        <p class="secure-note">${icon.shield} Pago 100% seguro</p>
      </aside>
    </div>`;

  root.querySelectorAll('[data-qty]').forEach(b => b.addEventListener('click', () => {
    const line = lines.find(l => l.sku === b.dataset.sku);
    const next = line.qty + Number(b.dataset.qty);
    if (next < 1) return;
    if (next > line.variant.stock) return toast(`Solo hay ${line.variant.stock} unidad(es) disponibles.`, 'error');
    Cart.setQty(line.sku, next);
  }));
  root.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => {
    Cart.remove(b.dataset.remove);
    toast('Producto eliminado del carrito');
  }));
  const form = $('#promoForm');
  if (form) form.addEventListener('submit', async e => {
    e.preventDefault();
    const code = $('#promoCode').value.trim();
    if (!code) return;
    const found = await busy(form.querySelector('button'), () => api.findPromotion(code, totals.subtotal));
    if (!found) return;
    promo = found;
    sessionStorage.setItem(PROMO_KEY, found.code);
    toast('Código aplicado', 'success');
    render();
  });
  const rm = $('#removePromo');
  if (rm) rm.addEventListener('click', () => { promo = null; sessionStorage.removeItem(PROMO_KEY); render(); });
  $('#goCheckout').addEventListener('click', e => {
    if (hasBlocked) { e.preventDefault(); toast('Retira los productos agotados para continuar.', 'error'); }
  });
}

function lineRow(l) {
  if (!l.product) {
    return `<tr><td colspan="4"><strong>Producto no disponible</strong><small class="muted"> · ya no está en el catálogo</small></td>
      <td><button class="icon-btn" type="button" data-remove="${esc(l.sku)}" aria-label="Eliminar">${icon.trash}</button></td></tr>`;
  }
  const p = l.product, v = l.variant;
  return `
    <tr>
      <td>
        <div class="cart-item">
          <img src="${esc(productImage(p))}" alt="" width="84" height="112" loading="lazy">
          <div>
            <a href="producto.html?p=${encodeURIComponent(p.slug)}">${esc(p.name)}</a>
            <small>Ref. ${esc(p.ref)} · ${esc(v.color)} · Talla ${esc(v.size)}</small>
            <small>${stockBadge(v.stock)}</small>
          </div>
        </div>
      </td>
      <td data-label="Precio">${cop(l.unitPrice)}</td>
      <td data-label="Cantidad">${l.unavailable ? '<span class="text-danger small">Agotado</span>' : `
        <div class="qty">
          <button type="button" data-qty="-1" data-sku="${esc(l.sku)}" aria-label="Quitar una unidad" ${l.qty <= 1 ? 'disabled' : ''}>${icon.minus}</button>
          <span aria-live="polite">${l.qty}</span>
          <button type="button" data-qty="1" data-sku="${esc(l.sku)}" aria-label="Agregar una unidad" ${l.qty >= v.stock ? 'disabled' : ''}>${icon.plus}</button>
        </div>`}</td>
      <td data-label="Subtotal"><strong>${l.unavailable ? '—' : cop(l.unitPrice * l.qty)}</strong></td>
      <td><button class="icon-btn" type="button" data-remove="${esc(l.sku)}" aria-label="Eliminar ${esc(p.name)} talla ${esc(v.size)}">${icon.trash}</button></td>
    </tr>`;
}
