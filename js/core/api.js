/* =========================================================
   api.js — Capa de datos de la tienda.
   Dos implementaciones con la misma interfaz:
   · DemoApi     → datos de ejemplo en localStorage (sin servidor).
   · SupabaseApi → base de datos real + Edge Function de Wompi.
   Las páginas solo usan `api` y no saben cuál está activa.
   ========================================================= */
import { CONFIG } from '../config.js';
import { DEMO_PRODUCTS, DEMO_PROMOTIONS } from './demo-data.js';
import { quote, promoProblem } from './pricing.js';

const RESERVATION_MINUTES = 30; // tiempo que se aparta el inventario mientras se paga
/** Pedidos hechos en este dispositivo (número y token de consulta), para "Mis pedidos". */
export const ORDERS_KEY = 'tuhan.orders';

export const ORDER_STATUS = {
  pending_payment: 'Pendiente de pago',
  paid: 'Pagado',
  preparing: 'En preparación',
  shipped: 'Enviado',
  ready_pickup: 'Listo para recoger',
  delivered: 'Entregado',
  declined: 'Pago rechazado',
  expired: 'Vencido sin pago',
  cancelled: 'Cancelado'
};
// Estados en los que el inventario ya no está apartado
const RELEASED = ['declined', 'expired', 'cancelled'];

function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

function randomToken(bytes = 16) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
}

/* =========================================================
   Modo demostración
   ========================================================= */
const DEMO_KEY = 'tuhan.demo.v1';

class DemoApi {
  constructor() { this.mode = 'demo'; }

  _load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(DEMO_KEY)); } catch (e) { /* sin almacenamiento */ }
    if (!s || !Array.isArray(s.products)) {
      s = { products: clone(DEMO_PRODUCTS), promotions: clone(DEMO_PROMOTIONS), orders: [], seq: 0 };
    }
    this._releaseExpired(s);
    return s;
  }

  _save(s) {
    try { localStorage.setItem(DEMO_KEY, JSON.stringify(s)); }
    catch (e) { throw new Error('El navegador no permitió guardar los datos (¿imágenes muy pesadas o modo privado?).'); }
  }

  _releaseExpired(s) {
    const now = Date.now();
    s.orders.forEach(o => {
      if (o.status === 'pending_payment' && o.expiresAt && Date.parse(o.expiresAt) < now) {
        o.status = 'expired';
        this._restock(s, o);
      }
    });
  }

  _restock(s, order) {
    order.items.forEach(it => {
      const p = s.products.find(x => x.id === it.productId);
      const v = p && p.variants.find(x => x.sku === it.sku);
      if (v) v.stock += it.qty;
    });
  }

  /* ---------- Tienda ---------- */
  async listProducts() {
    return clone(this._load().products.filter(p => p.published));
  }

  async getProduct(slug) {
    const p = this._load().products.find(x => (x.slug === slug || x.id === slug) && x.published);
    return clone(p || null);
  }

  async findPromotion(code, subtotal) {
    const s = this._load();
    const promo = s.promotions.find(p => p.code.toUpperCase() === String(code || '').trim().toUpperCase());
    const problem = promoProblem(promo, subtotal);
    if (problem) throw new Error(problem);
    return clone(promo);
  }

  /**
   * Crea el pedido apartando inventario. Recalcula precios con el catálogo
   * (no confía en los del navegador). payload: { customer, delivery, items:[{sku, qty}], promoCode, notes }
   */
  async createOrder(payload) {
    const s = this._load();
    if (!payload.items || !payload.items.length) throw new Error('Tu carrito está vacío.');

    const lines = payload.items.map(it => {
      const p = s.products.find(x => x.published && x.variants.some(v => v.sku === it.sku));
      const v = p && p.variants.find(x => x.sku === it.sku);
      if (!v) throw new Error('Uno de los productos ya no está disponible.');
      const qty = Math.floor(it.qty);
      if (!(qty > 0)) throw new Error('Cantidad no válida.');
      if (v.stock < qty) {
        throw new Error(v.stock
          ? `Solo quedan ${v.stock} unidad(es) de ${p.name} talla ${v.size} (${v.color}).`
          : `${p.name} talla ${v.size} (${v.color}) se agotó.`);
      }
      return { p, v, qty };
    });

    let promo = null;
    const subtotal = lines.reduce((sum, l) => sum + l.p.price * l.qty, 0);
    if (payload.promoCode) {
      promo = s.promotions.find(x => x.code.toUpperCase() === payload.promoCode.trim().toUpperCase());
      const problem = promoProblem(promo, subtotal);
      if (problem) throw new Error(problem);
    }
    const method = payload.delivery.method === 'pickup' && CONFIG.shipping.storePickup ? 'pickup' : 'shipping';
    const totals = quote(lines.map(l => ({ unitPrice: l.p.price, qty: l.qty })), { method, promo });

    lines.forEach(l => { l.v.stock -= l.qty; });
    s.seq += 1;
    const now = new Date();
    const order = {
      id: 'o-' + randomToken(6),
      number: 'TC-' + String(s.seq).padStart(6, '0'),
      token: randomToken(),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + RESERVATION_MINUTES * 60000).toISOString(),
      status: 'pending_payment',
      customer: payload.customer,
      delivery: Object.assign({}, payload.delivery, { method }),
      notes: payload.notes || '',
      items: lines.map(l => ({
        productId: l.p.id, sku: l.v.sku, name: l.p.name, ref: l.p.ref, color: l.v.color, size: l.v.size,
        qty: l.qty, unitPrice: l.p.price, image: (l.p.images || [])[0] || null
      })),
      promoCode: promo ? promo.code : null,
      ...totals,
      payment: { provider: 'demo', status: 'PENDING', reference: null, transactionId: null }
    };
    order.payment.reference = order.number;
    s.orders.push(order);
    this._save(s);
    return clone(order);
  }

  /** Demostración: simula la respuesta de la pasarela. */
  async startPayment(order) {
    return { demo: true, order };
  }

  async completeDemoPayment(number, token, approved) {
    const s = this._load();
    const o = s.orders.find(x => x.number === number && x.token === token);
    if (!o) throw new Error('Pedido no encontrado.');
    if (o.status !== 'pending_payment') return clone(o);
    o.payment.status = approved ? 'APPROVED' : 'DECLINED';
    o.payment.transactionId = 'demo-' + randomToken(4);
    o.payment.method = 'Pago de prueba';
    o.status = approved ? 'paid' : 'declined';
    if (!approved) this._restock(s, o);
    // El uso del código solo cuenta cuando el pago se aprueba
    const promo = approved && o.promoCode && s.promotions.find(x => x.code === o.promoCode);
    if (promo) promo.uses = (promo.uses || 0) + 1;
    this._save(s);
    return clone(o);
  }

  async getOrder(number, token) {
    const o = this._load().orders.find(x => x.number === number && x.token === token);
    return clone(o || null);
  }

  async lookupOrder(number, email) {
    const o = this._load().orders.find(x => x.number === String(number).trim().toUpperCase() &&
      x.customer.email.toLowerCase() === String(email).trim().toLowerCase());
    return clone(o || null);
  }

  /* ---------- Administración ---------- */
  async adminSession() { return { email: 'demo', demo: true }; }
  async adminSignIn() { return this.adminSession(); }
  async adminSignOut() { /* sin sesión en demostración */ }

  async adminProducts() { return clone(this._load().products); }

  async adminSaveProduct(product) {
    const s = this._load();
    const p = clone(product);
    if (!p.id) p.id = 'p-' + randomToken(5);
    if (s.products.some(x => x.id !== p.id && x.slug === p.slug)) throw new Error('Ya existe un producto con esa URL (slug).');
    if (s.products.some(x => x.id !== p.id && x.ref.toUpperCase() === p.ref.toUpperCase())) throw new Error('Ya existe un producto con esa referencia.');
    const skus = new Set();
    s.products.filter(x => x.id !== p.id).forEach(x => x.variants.forEach(v => skus.add(v.sku)));
    if (p.variants.some(v => skus.has(v.sku))) throw new Error('Hay un SKU repetido con otro producto.');
    const idx = s.products.findIndex(x => x.id === p.id);
    if (idx === -1) { p.createdAt = new Date().toISOString(); s.products.push(p); } else s.products[idx] = p;
    this._save(s);
    return clone(p);
  }

  async adminDeleteProduct(id) {
    const s = this._load();
    s.products = s.products.filter(x => x.id !== id);
    this._save(s);
  }

  async adminSetStock(sku, stock) {
    const s = this._load();
    const v = s.products.flatMap(p => p.variants).find(x => x.sku === sku);
    if (!v) throw new Error('SKU no encontrado.');
    v.stock = Math.max(0, Math.floor(stock));
    this._save(s);
  }

  async adminOrders() {
    return clone(this._load().orders).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async adminSetOrderStatus(id, status) {
    const s = this._load();
    const o = s.orders.find(x => x.id === id);
    if (!o) throw new Error('Pedido no encontrado.');
    const wasReleased = RELEASED.includes(o.status);
    const release = RELEASED.includes(status);
    if (!wasReleased && release) this._restock(s, o);
    if (wasReleased && !release) throw new Error('Este pedido ya liberó su inventario; crea un pedido nuevo.');
    o.status = status;
    this._save(s);
    return clone(o);
  }

  async adminPromotions() { return clone(this._load().promotions); }

  async adminSavePromotion(promo) {
    const s = this._load();
    const p = clone(promo);
    p.code = p.code.trim().toUpperCase();
    if (!p.id) p.id = 'promo-' + randomToken(4);
    if (s.promotions.some(x => x.id !== p.id && x.code === p.code)) throw new Error('Ya existe una promoción con ese código.');
    const idx = s.promotions.findIndex(x => x.id === p.id);
    if (idx === -1) { p.uses = 0; s.promotions.push(p); } else { p.uses = s.promotions[idx].uses; s.promotions[idx] = p; }
    this._save(s);
    return clone(p);
  }

  async adminDeletePromotion(id) {
    const s = this._load();
    s.promotions = s.promotions.filter(x => x.id !== id);
    this._save(s);
  }

  /** Reduce la foto en el navegador y la guarda como data URL (solo demostración). */
  async adminUploadImage(file) {
    return resizeImage(file, 1200, 0.82);
  }

  async adminResetDemo() {
    localStorage.removeItem(DEMO_KEY);
  }
}

/* =========================================================
   Modo Supabase
   ========================================================= */
class SupabaseApi {
  constructor() { this.mode = 'supabase'; this._client = null; }

  async client() {
    if (!this._client) {
      if (!CONFIG.backend.supabaseUrl || !CONFIG.backend.supabaseAnonKey) {
        throw new Error('Falta configurar Supabase en js/config.js.');
      }
      const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.1/+esm');
      this._client = createClient(CONFIG.backend.supabaseUrl, CONFIG.backend.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true }
      });
    }
    return this._client;
  }

  async rpc(fn, args) {
    const { data, error } = await (await this.client()).rpc(fn, args);
    if (error) throw new Error(error.message);
    return data;
  }

  async fn(body) {
    const { data, error } = await (await this.client()).functions.invoke('wompi', { body });
    if (error) {
      let message = error.message;
      try { message = (await error.context.json()).error || message; } catch (e) { /* sin JSON */ }
      throw new Error(message);
    }
    return data;
  }

  listProducts() { return this.rpc('store_products'); }
  getProduct(slug) { return this.rpc('store_product', { p_slug: slug }); }
  findPromotion(code, subtotal) { return this.rpc('store_check_promo', { p_code: code, p_subtotal: subtotal }); }
  createOrder(payload) { return this.rpc('store_create_order', { p_order: payload }); }

  /** Pide a la Edge Function la firma de integridad y redirige al checkout de Wompi. */
  async startPayment(order) {
    const { url } = await this.fn({
      action: 'checkout', number: order.number, token: order.token,
      redirectUrl: new URL(`pedido.html?n=${encodeURIComponent(order.number)}&t=${encodeURIComponent(order.token)}`, location.href).href
    });
    location.assign(url);
    return { redirecting: true };
  }

  /** Consulta la transacción directamente en Wompi (desde el servidor) y actualiza el pedido. */
  verifyPayment(transactionId) { return this.fn({ action: 'verify', id: transactionId }); }

  getOrder(number, token) { return this.rpc('store_get_order', { p_number: number, p_token: token }); }
  lookupOrder(number, email) { return this.rpc('store_lookup_order', { p_number: number, p_email: email }); }

  /* ---------- Administración ---------- */
  async adminSession() {
    const { data: { session } } = await (await this.client()).auth.getSession();
    if (!session) return null;
    const ok = await this.rpc('admin_is_admin');
    return ok ? { email: session.user.email } : null;
  }

  async adminSignIn(email, password) {
    const c = await this.client();
    const { error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw new Error('Correo o contraseña incorrectos.');
    const s = await this.adminSession();
    if (!s) { await c.auth.signOut(); throw new Error('Esta cuenta no tiene permisos de administración.'); }
    return s;
  }

  async adminSignOut() { await (await this.client()).auth.signOut(); }

  adminProducts() { return this.rpc('admin_products'); }
  adminSaveProduct(p) { return this.rpc('admin_save_product', { p_product: p }); }
  adminDeleteProduct(id) { return this.rpc('admin_delete_product', { p_id: id }); }
  adminSetStock(sku, stock) { return this.rpc('admin_set_stock', { p_sku: sku, p_stock: stock }); }
  adminOrders() { return this.rpc('admin_orders'); }
  adminSetOrderStatus(id, status) { return this.rpc('admin_set_order_status', { p_id: id, p_status: status }); }
  adminPromotions() { return this.rpc('admin_promotions'); }
  adminSavePromotion(p) { return this.rpc('admin_save_promotion', { p_promo: p }); }
  adminDeletePromotion(id) { return this.rpc('admin_delete_promotion', { p_id: id }); }

  async adminUploadImage(file) {
    const c = await this.client();
    const blob = await resizeImage(file, 1600, 0.85, true);
    const path = `productos/${Date.now()}-${randomToken(4)}.jpg`;
    const { error } = await c.storage.from('product-images').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
    if (error) throw new Error(error.message);
    return c.storage.from('product-images').getPublicUrl(path).data.publicUrl;
  }
}

/** Reduce una imagen a `max` px de lado. Devuelve data URL (o Blob si asBlob). */
function resizeImage(file, max, quality, asBlob = false) {
  return new Promise((resolve, reject) => {
    if (!/^image\//.test(file.type)) return reject(new Error('El archivo no es una imagen.'));
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * scale);
      c.height = Math.round(img.naturalHeight * scale);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      if (asBlob) c.toBlob(b => (b ? resolve(b) : reject(new Error('No se pudo procesar la imagen.'))), 'image/jpeg', quality);
      else resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen.')); };
    img.src = url;
  });
}

/** Tienda */
export const api = CONFIG.backend.mode === 'supabase' ? new SupabaseApi() : new DemoApi();
export const isDemo = api.mode === 'demo';

/** Panel administrativo: puede usar la base de datos real aunque la tienda siga en demostración */
const adminMode = CONFIG.backend.adminMode || CONFIG.backend.mode;
export const adminApi = adminMode === api.mode ? api : (adminMode === 'supabase' ? new SupabaseApi() : new DemoApi());
