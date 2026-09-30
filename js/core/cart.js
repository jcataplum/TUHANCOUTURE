/* =========================================================
   cart.js — Carrito en localStorage. Guarda solo SKU y cantidad;
   precios y stock se leen siempre del catálogo actual.
   Emite el evento `cart:change` en window.
   ========================================================= */
const KEY = 'tuhan.cart.v1';

function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(v) ? v.filter(x => x && x.sku && x.qty > 0) : [];
  } catch (e) { return []; }
}

function write(items) {
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) { /* sin almacenamiento */ }
  window.dispatchEvent(new CustomEvent('cart:change', { detail: { count: count(items) } }));
}

function count(items = read()) {
  return items.reduce((s, x) => s + x.qty, 0);
}

export const Cart = {
  items: read,
  count: () => count(),

  /** Agrega respetando el stock. Devuelve la cantidad realmente agregada. */
  add(product, sku, qty = 1) {
    const variant = product.variants.find(v => v.sku === sku);
    if (!variant || variant.stock <= 0) throw new Error('Esta talla está agotada.');
    const items = read();
    const line = items.find(x => x.sku === sku);
    const current = line ? line.qty : 0;
    const allowed = Math.max(0, Math.min(qty, variant.stock - current));
    if (!allowed) throw new Error(`Ya tienes en el carrito todas las unidades disponibles (${variant.stock}).`);
    if (line) line.qty += allowed; else items.push({ sku, productId: product.id, qty: allowed });
    write(items);
    return allowed;
  },

  setQty(sku, qty) {
    const items = read();
    const line = items.find(x => x.sku === sku);
    if (!line) return;
    line.qty = Math.max(1, Math.floor(qty) || 1);
    write(items);
  },

  remove(sku) {
    write(read().filter(x => x.sku !== sku));
  },

  clear() { write([]); },

  /**
   * Une el carrito con el catálogo. Ajusta cantidades al stock actual
   * y marca las líneas que ya no se pueden comprar.
   */
  resolve(products) {
    const items = read();
    let changed = false;
    const lines = items.map(it => {
      const product = products.find(p => p.variants.some(v => v.sku === it.sku));
      const variant = product && product.variants.find(v => v.sku === it.sku);
      if (!variant) return { ...it, product: null, variant: null, unavailable: true };
      if (variant.stock > 0 && it.qty > variant.stock) { it.qty = variant.stock; changed = true; }
      return { ...it, product, variant, unitPrice: product.price, unavailable: variant.stock <= 0 };
    });
    if (changed) write(items);
    return lines;
  }
};
