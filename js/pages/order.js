import { CONFIG, whatsappLink } from '../config.js';
import { initLayout } from '../core/layout.js';
import { api, isDemo } from '../core/api.js';
import { Cart } from '../core/cart.js';
import { icon, statusBadge } from '../core/components.js';
import { PROMO_KEY } from '../core/pricing.js';
import { $, cop, esc, fmtDateTime, param, productImage } from '../core/util.js';

initLayout();

const root = $('#orderRoot');
const number = param('n');
const token = param('t');
const transactionId = param('id'); // Wompi lo agrega al volver del checkout

(async () => {
  if (!number || !token) return notFound();
  try {
    // Nunca se confía en la redirección: el servidor consulta la transacción en Wompi.
    if (!isDemo && transactionId) await api.verifyPayment(transactionId).catch(e => console.warn(e));
    let order = await api.getOrder(number, token);
    if (!order) return notFound();
    render(order);
    // Mientras Wompi confirma (PSE puede tardar), se consulta de nuevo unos minutos
    let tries = 0;
    while (order.status === 'pending_payment' && !isDemo && tries < 30) {
      await new Promise(r => setTimeout(r, 5000));
      tries++;
      order = await api.getOrder(number, token);
      render(order);
    }
  } catch (ex) {
    console.error(ex);
    root.innerHTML = `<div class="empty-state"><h1>No pudimos cargar tu pedido</h1><p>${esc(ex.message)}</p></div>`;
  }
})();

function notFound() {
  root.innerHTML = `<div class="empty-state"><h1>Pedido no encontrado</h1><p>Revisa el enlace o consulta tu pedido con el número y tu correo.</p>
    <a class="btn btn-dark" href="cuenta.html">Consultar pedido</a></div>`;
}

function render(o) {
  const paid = ['paid', 'preparing', 'shipped', 'ready_pickup', 'delivered'].includes(o.status);
  if (paid) { Cart.clear(); sessionStorage.removeItem(PROMO_KEY); }
  const failed = ['declined', 'expired', 'cancelled'].includes(o.status);
  const wa = whatsappLink(`Hola TUHAN COUTURE, tengo una consulta sobre mi pedido ${o.number}.`);

  const hero = paid
    ? { cls: 'status-ok', ico: icon.shield, title: '¡Gracias por tu compra!', text: `Tu pago fue aprobado. Pronto te contactaremos para coordinar ${o.delivery.method === 'pickup' ? 'la entrega en tienda' : 'el envío'}.` }
    : failed
      ? { cls: 'status-bad', ico: icon.close, title: o.status === 'declined' ? 'El pago no fue aprobado' : 'El pedido no se completó', text: 'No se realizó ningún cobro y liberamos las prendas apartadas. Puedes intentarlo de nuevo.' }
      : { cls: 'status-wait', ico: icon.clock, title: 'Estamos confirmando tu pago', text: 'Esto puede tardar unos minutos (por ejemplo con PSE). Esta página se actualiza sola.' };

  root.innerHTML = `
    <section class="order-hero">
      <div class="status-icon ${hero.cls}">${hero.ico}</div>
      <p class="eyebrow">Pedido ${esc(o.number)}</p>
      <h1>${hero.title}</h1>
      <p class="muted" style="max-width:560px;margin:0 auto 20px">${hero.text}</p>
      <div class="hero-actions" style="justify-content:center">
        ${failed ? '<a class="btn btn-gold" href="checkout.html">Intentar de nuevo</a>' : '<a class="btn btn-dark" href="catalogo.html">Seguir comprando</a>'}
        ${wa ? `<a class="btn btn-line" href="${esc(wa)}" target="_blank" rel="noopener">${icon.whatsapp} Ayuda por WhatsApp</a>` : ''}
      </div>
      ${isDemo ? '<p class="small muted" style="margin-top:14px">Modo demostración: este pedido y su pago son de prueba.</p>' : ''}
    </section>

    <div class="cart-layout" style="padding-bottom:72px">
      <section class="form-section" aria-label="Detalle del pedido">
        <div class="row-between"><h2 style="margin:0">Detalle</h2>${statusBadge(o.status)}</div>
        <ul class="summary-lines" style="max-height:none">${o.items.map(it => `
          <li>
            <span class="thumb"><img src="${esc(it.image || productImage({ images: [], colors: [] }))}" alt="" width="56" height="74"><b>${it.qty}</b></span>
            <span><strong>${esc(it.name)}</strong><small>Ref. ${esc(it.ref)} · ${esc(it.color)} · Talla ${esc(it.size)}</small></span>
            <span>${cop(it.unitPrice * it.qty)}</span>
          </li>`).join('')}</ul>
        <div class="row-between"><span>Fecha</span><span>${fmtDateTime(o.createdAt)}</span></div>
        <div class="row-between"><span>Entrega</span><span>${o.delivery.method === 'pickup'
          ? `Recoger en tienda · ${esc(CONFIG.store.address)}`
          : esc([o.delivery.address, o.delivery.details, o.delivery.city, o.delivery.department].filter(Boolean).join(', '))}</span></div>
        ${o.payment && o.payment.method ? `<div class="row-between"><span>Medio de pago</span><span>${esc(o.payment.method)}</span></div>` : ''}
      </section>
      <aside class="summary" aria-label="Totales">
        <h2>Total</h2>
        <div class="row-between"><span>Subtotal</span><span>${cop(o.subtotal)}</span></div>
        ${o.discount ? `<div class="row-between discount"><span>Descuento${o.promoCode ? ' (' + esc(o.promoCode) + ')' : ''}</span><span>− ${cop(o.discount)}</span></div>` : ''}
        <div class="row-between"><span>Envío</span><span>${o.shipping ? cop(o.shipping) : 'Gratis'}</span></div>
        <div class="row-between total"><span>Total</span><span>${cop(o.total)}</span></div>
        <p class="small muted">Guarda el número <strong>${esc(o.number)}</strong> para consultar tu pedido en “Mi cuenta”.</p>
      </aside>
    </div>`;
}
