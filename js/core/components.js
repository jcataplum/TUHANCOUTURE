/* =========================================================
   components.js — íconos y piezas de interfaz reutilizables
   ========================================================= */
import { cop, esc, productImage, totalStock, stockState, sortSizes } from './util.js';
import { ORDER_STATUS } from './api.js';

const svg = (body, extra = '') =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;

export const icon = {
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>'),
  bag: svg('<path d="M5 8h14l-1 13H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>'),
  menu: svg('<path d="M3 7h18M3 12h18M3 17h18"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  minus: svg('<path d="M5 12h14"/>'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  pin: svg('<path d="M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>'),
  phone: svg('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>'),
  mail: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  truck: svg('<path d="M3 6h11v10H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>'),
  card: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/>'),
  shield: svg('<path d="M12 3 5 6v6c0 4.4 3 7.8 7 9 4-1.2 7-4.6 7-9V6z"/><path d="m9 12 2 2 4-4"/>'),
  store: svg('<path d="M4 10v10h16V10M3 10l2-6h14l2 6M9 20v-5h6v5"/>'),
  ruler: svg('<path d="M3 17 17 3l4 4L7 21z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/>'),
  arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  heart: svg('<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>'),
  instagram: svg('<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8" fill="currentColor"/>'),
  facebook: svg('<path d="M14 21v-8h3l.5-3.5H14V7.8c0-1 .3-1.8 1.8-1.8H18V3a24 24 0 0 0-2.8-.1C12.4 2.9 10.5 4.6 10.5 7.6v1.9H7.5V13h3v8"/>'),
  tiktok: svg('<path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 3c.5 2.8 2.4 4.6 5 5"/>'),
  whatsapp: `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.6.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.9 11.9 0 0 0 4.5 4c1.7.7 2.4.8 3.2.6a2.8 2.8 0 0 0 1.8-1.3 2.3 2.3 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z"/></svg>`
};

/** Tarjeta de producto para grillas del catálogo */
export function productCard(p, { eager = false } = {}) {
  const stock = totalStock(p);
  const state = stockState(stock);
  const sizes = sortSizes(Array.from(new Set(p.variants.filter(v => v.stock > 0).map(v => v.size))));
  const second = (p.images || [])[1];
  return `
    <article class="card reveal ${state === 'out' ? 'is-out' : ''}">
      <a class="card-media" href="producto.html?p=${encodeURIComponent(p.slug)}" aria-label="${esc(p.name)}">
        <img src="${esc(productImage(p))}" alt="${esc(p.name)} — ${esc((p.colors[0] || {}).name || '')}" loading="${eager ? 'eager' : 'lazy'}" decoding="async" width="600" height="800">
        ${second ? `<img class="card-alt" src="${esc(second)}" alt="" loading="lazy" decoding="async" width="600" height="800">` : ''}
        <span class="card-tags">
          ${p.isNew ? '<span class="tag tag-gold">Nuevo</span>' : ''}
          ${p.compareAtPrice > p.price ? `<span class="tag">-${Math.round((1 - p.price / p.compareAtPrice) * 100)} %</span>` : ''}
          ${state === 'out' ? '<span class="tag tag-dark">Agotado</span>' : state === 'low' ? '<span class="tag tag-light">Últimas unidades</span>' : ''}
        </span>
      </a>
      <div class="card-body">
        <p class="card-ref">Ref. ${esc(p.ref)}</p>
        <h3 class="card-title"><a href="producto.html?p=${encodeURIComponent(p.slug)}">${esc(p.name)}</a></h3>
        <p class="price">${cop(p.price)}${p.compareAtPrice > p.price ? ` <s>${cop(p.compareAtPrice)}</s>` : ''}</p>
        <div class="card-meta">
          <span class="swatches" aria-label="Colores: ${esc(p.colors.map(c => c.name).join(', '))}">
            ${p.colors.map(c => `<i style="--c:${esc(c.hex)}" title="${esc(c.name)}"></i>`).join('')}
          </span>
          <span class="card-sizes">${sizes.length ? 'Tallas ' + sizes.map(esc).join(' · ') : 'Sin tallas disponibles'}</span>
        </div>
        <a class="btn btn-line btn-sm btn-block" href="producto.html?p=${encodeURIComponent(p.slug)}">${state === 'out' ? 'Ver producto' : 'Elegir talla y agregar'}</a>
      </div>
    </article>`;
}

export function skeletonCards(n = 4) {
  return Array.from({ length: n }, () => '<div class="card card-skeleton" aria-hidden="true"><div class="card-media"></div><div class="card-body"><i></i><i></i><i></i></div></div>').join('');
}

/** Etiqueta de color según el estado del pedido */
export function statusBadge(status) {
  const cls = ['paid', 'delivered'].includes(status) ? 'badge-ok'
    : ['declined', 'expired', 'cancelled'].includes(status) ? 'badge-bad'
      : status === 'pending_payment' ? 'badge-wait' : 'badge-info';
  return `<span class="badge ${cls}">${esc(ORDER_STATUS[status] || status)}</span>`;
}
