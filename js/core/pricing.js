/* =========================================================
   pricing.js — cálculo de totales (modo demostración y vista previa).
   En modo Supabase el servidor recalcula todo en `store_create_order`
   y ese es el valor que se cobra; esto solo sirve para mostrar.
   ========================================================= */
import { CONFIG } from '../config.js';

/** ¿La promoción aplica a este subtotal? Devuelve el motivo si no. */
export function promoProblem(promo, subtotal, now = new Date()) {
  if (!promo || !promo.active) return 'El código no existe o no está activo.';
  if (promo.startsAt && new Date(promo.startsAt) > now) return 'El código aún no está vigente.';
  if (promo.endsAt && new Date(promo.endsAt) < now) return 'El código ya venció.';
  if (promo.maxUses != null && promo.uses >= promo.maxUses) return 'El código ya alcanzó su límite de usos.';
  if (promo.minSubtotal && subtotal < promo.minSubtotal) {
    return `El código aplica para compras desde ${new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(promo.minSubtotal)}.`;
  }
  return null;
}

export function promoDiscount(promo, subtotal) {
  if (!promo || promoProblem(promo, subtotal)) return 0;
  const d = promo.type === 'percent' ? Math.round(subtotal * promo.value / 100) : promo.value;
  return Math.min(subtotal, Math.max(0, d));
}

export function shippingCost(method, subtotalAfterDiscount) {
  if (method === 'pickup') return 0;
  const s = CONFIG.shipping;
  if (s.freeShippingFrom != null && subtotalAfterDiscount >= s.freeShippingFrom) return 0;
  return s.nationalRate || 0;
}

/** lines: [{ unitPrice, qty }] */
export function quote(lines, { method = 'shipping', promo = null } = {}) {
  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const discount = promoDiscount(promo, subtotal);
  const shipping = lines.length ? shippingCost(method, subtotal - discount) : 0;
  return { subtotal, discount, shipping, total: subtotal - discount + shipping };
}

/** Código de descuento aplicado en el carrito (se conserva hasta el checkout). */
export const PROMO_KEY = 'tuhan.promo';
