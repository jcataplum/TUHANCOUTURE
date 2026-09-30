/* =========================================================
   util.js — utilidades compartidas
   ========================================================= */
import { CONFIG } from '../config.js';

const copFmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

/** $ 189.900 */
export function cop(value) {
  return copFmt.format(Math.round(Number(value) || 0));
}

export function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function param(name) {
  return new URLSearchParams(location.search).get(name);
}

/** Quita tildes y mayúsculas para buscar */
export function fold(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function fmtDateTime(iso) {
  return iso ? new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

/* ---------- Inventario ---------- */
export const STOCK = { AVAILABLE: 'available', LOW: 'low', OUT: 'out' };

export function stockState(qty) {
  if (!qty || qty <= 0) return STOCK.OUT;
  if (qty <= CONFIG.inventory.lowStockThreshold) return STOCK.LOW;
  return STOCK.AVAILABLE;
}

export function stockLabel(qty) {
  return { available: 'Disponible', low: 'Últimas unidades', out: 'Agotado' }[stockState(qty)];
}

export function stockBadge(qty) {
  const s = stockState(qty);
  return `<span class="stock stock-${s}">${stockLabel(qty)}</span>`;
}

export function totalStock(product) {
  return (product.variants || []).reduce((s, v) => s + Math.max(0, v.stock || 0), 0);
}

/** Tallas en orden numérico (4, 6, 8…) y luego alfabético (S, M, L…) */
const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'ÚNICA'];
export function sortSizes(sizes) {
  return sizes.slice().sort((a, b) => {
    const na = parseFloat(a), nb = parseFloat(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    if (!isNaN(na)) return -1;
    if (!isNaN(nb)) return 1;
    return SIZE_ORDER.indexOf(String(a).toUpperCase()) - SIZE_ORDER.indexOf(String(b).toUpperCase());
  });
}

/* ---------- Imagen provisional ---------- */
// Silueta de jean en el tono del color del producto, mientras se cargan las fotos reales.
export function placeholderImage(hex = '#5B7A99', label = '') {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4efe7"/><stop offset="1" stop-color="#e7dfd2"/></linearGradient>
      <linearGradient id="d" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hex}" stop-opacity=".95"/><stop offset="1" stop-color="${hex}" stop-opacity=".7"/></linearGradient>
    </defs>
    <rect width="600" height="800" fill="url(#bg)"/>
    <path d="M205 150h190l8 40-6 70 38 430h-112l-23-360-23 360H165l38-430-6-70z" fill="url(#d)"/>
    <path d="M205 150h190l3 18H202z" fill="#000" opacity=".18"/>
    <path d="M300 168v120" stroke="#000" stroke-opacity=".2" stroke-width="3"/>
    <circle cx="300" cy="160" r="4" fill="#c9a45c"/>
    <text x="300" y="752" text-anchor="middle" font-family="Georgia, serif" font-size="22" letter-spacing="6" fill="#8a7a5e">${esc(label || 'TUHAN COUTURE')}</text>
  </svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

export function productImage(product, index = 0) {
  const img = (product.images || [])[index];
  if (img) return img;
  const color = (product.colors || [])[0];
  return placeholderImage(color ? color.hex : undefined, 'FOTO PRÓXIMAMENTE');
}

/* ---------- Avisos ---------- */
let toastTimer;
export function toast(msg, type = '') {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.className = 'toast';
    t.setAttribute('role', 'status');
    t.setAttribute('aria-live', 'polite');
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.className = 'toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 3200);
}

/** Bloquea el botón mientras corre la tarea y muestra los errores como aviso. */
export async function busy(btn, task) {
  if (btn) { if (btn.disabled) return undefined; btn.disabled = true; btn.setAttribute('aria-busy', 'true'); }
  try {
    return await task();
  } catch (ex) {
    console.error(ex);
    toast(ex.message || 'Ocurrió un error. Intenta de nuevo.', 'error');
    return undefined;
  } finally {
    if (btn) { btn.disabled = false; btn.removeAttribute('aria-busy'); }
  }
}

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/** Revela elementos con la clase .reveal al entrar en pantalla (animación sutil). */
export function observeReveal(root = document) {
  const els = $$('.reveal:not(.is-visible)', root);
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    els.forEach(el => el.classList.add('is-visible'));
    return;
  }
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -8% 0px' });
  els.forEach(el => io.observe(el));
}

export function setMeta({ title, description, image }) {
  if (title) document.title = title;
  const set = (sel, attr, val) => { const el = document.querySelector(sel); if (el && val) el.setAttribute(attr, val); };
  set('meta[name="description"]', 'content', description);
  set('meta[property="og:title"]', 'content', title);
  set('meta[property="og:description"]', 'content', description);
  if (image && !image.startsWith('data:')) set('meta[property="og:image"]', 'content', image);
  if (CONFIG.siteUrl) {
    let link = document.querySelector('link[rel="canonical"]');
    if (!link) { link = document.createElement('link'); link.rel = 'canonical'; document.head.appendChild(link); }
    link.href = CONFIG.siteUrl.replace(/\/$/, '') + location.pathname + location.search;
  }
}

export function jsonLd(data, id) {
  let el = id && document.getElementById(id);
  if (!el) {
    el = document.createElement('script');
    el.type = 'application/ld+json';
    if (id) el.id = id;
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}
