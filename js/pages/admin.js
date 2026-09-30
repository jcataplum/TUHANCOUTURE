/* =========================================================
   admin.js — Panel administrativo (productos, fotos, precios,
   tallas, colores, inventario, pedidos, clientes y promociones)
   ========================================================= */
import { CONFIG } from '../config.js';
import { api, isDemo, ORDER_STATUS } from '../core/api.js';
import { icon, statusBadge } from '../core/components.js';
import {
  $, $$, cop, esc, fold, fmtDateTime, productImage, sortSizes, stockBadge, stockState, totalStock, toast, busy
} from '../core/util.js';

const root = $('#adminRoot');
const SECTIONS = [
  ['resumen', 'Resumen', icon.store],
  ['productos', 'Productos', icon.bag],
  ['inventario', 'Inventario', icon.ruler],
  ['pedidos', 'Pedidos', icon.truck],
  ['clientes', 'Clientes', icon.user],
  ['promociones', 'Promociones', icon.card]
];
const PAID = ['paid', 'preparing', 'shipped', 'ready_pickup', 'delivered'];
// Cambios de estado permitidos desde el panel
const NEXT_STATUS = {
  pending_payment: ['cancelled'],
  paid: ['preparing', 'shipped', 'ready_pickup', 'delivered', 'cancelled'],
  preparing: ['shipped', 'ready_pickup', 'delivered', 'cancelled'],
  shipped: ['delivered'],
  ready_pickup: ['delivered', 'cancelled'],
  delivered: [], declined: [], expired: [], cancelled: []
};

let session = null;
let main = null;

/* ---------- Arranque y acceso ---------- */
(async () => {
  try { session = await api.adminSession(); } catch (e) { session = null; }
  if (!session) return renderLogin();
  renderShell();
  window.addEventListener('hashchange', route);
  route();
})();

function renderLogin() {
  root.innerHTML = `
    <form class="login-box form" id="loginForm" novalidate>
      <div class="logo"><img src="${esc(CONFIG.brand.logo)}" alt="${esc(CONFIG.brand.name)}"></div>
      <h1 style="font-size:1.8rem">Panel administrativo</h1>
      <div class="field"><label for="lEmail">Correo</label><input class="input" id="lEmail" type="email" autocomplete="username" required></div>
      <div class="field"><label for="lPass">Contraseña</label><input class="input" id="lPass" type="password" autocomplete="current-password" required></div>
      <p class="text-danger small" id="lErr" role="alert"></p>
      <button class="btn btn-dark btn-block" type="submit">Ingresar</button>
      <a class="small muted" href="index.html">← Volver a la tienda</a>
    </form>`;
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    $('#lErr').textContent = '';
    try {
      session = await api.adminSignIn($('#lEmail').value.trim(), $('#lPass').value);
      renderShell();
      window.addEventListener('hashchange', route);
      route();
    } catch (ex) { $('#lErr').textContent = ex.message; }
  });
}

function renderShell() {
  root.innerHTML = `
    <div class="admin-shell">
      <aside class="admin-side">
        <a class="logo" href="index.html" title="Ver tienda"><img src="${esc(CONFIG.brand.logo)}" alt="${esc(CONFIG.brand.name)}"></a>
        <nav class="admin-nav" aria-label="Secciones">
          ${SECTIONS.map(([k, l, ic]) => `<a href="#${k}" data-sec="${k}">${ic} ${l}</a>`).join('')}
          <a href="index.html" target="_blank" rel="noopener">${icon.arrow} Ver tienda</a>
        </nav>
        <div class="admin-side-foot">
          ${isDemo ? 'Modo demostración: los datos se guardan en este navegador.' : `Sesión: ${esc(session.email)}<br><button class="link-btn" type="button" id="logout" style="color:#d9d2c5">Cerrar sesión</button>`}
        </div>
      </aside>
      <main class="admin-main" id="adminMain" tabindex="-1"></main>
    </div>
    <dialog class="modal" id="adminModal" aria-labelledby="adminModalTitle" style="width:min(720px,calc(100vw - 32px))"></dialog>`;
  main = $('#adminMain');
  const lo = $('#logout');
  if (lo) lo.addEventListener('click', async () => { await api.adminSignOut(); location.reload(); });
}

function route() {
  const [sec, arg] = (location.hash.slice(1) || 'resumen').split('/');
  $$('.admin-nav a[data-sec]').forEach(a => a.classList.toggle('active', a.dataset.sec === sec || (sec === 'producto' && a.dataset.sec === 'productos')));
  const views = { resumen: viewSummary, productos: viewProducts, producto: viewProductEditor, inventario: viewInventory, pedidos: viewOrders, clientes: viewCustomers, promociones: viewPromotions };
  main.innerHTML = '<div class="spinner" style="margin:80px auto"></div>';
  (views[sec] || viewSummary)(arg).catch(ex => {
    console.error(ex);
    main.innerHTML = `<div class="panel"><h2>No se pudo cargar esta sección</h2><p class="text-danger">${esc(ex.message)}</p></div>`;
  });
  window.scrollTo(0, 0);
}

function head(title, subtitle = '', actions = '') {
  return `<div class="admin-head"><div><h1>${title}</h1>${subtitle ? `<p>${subtitle}</p>` : ''}</div><div class="btn-row" style="display:flex;gap:8px;flex-wrap:wrap">${actions}</div></div>`;
}

function modal(title, body, foot = '') {
  const dlg = $('#adminModal');
  if (dlg.open) dlg.close();
  dlg.innerHTML =`<div class="modal-head"><h2 id="adminModalTitle">${title}</h2><button class="icon-btn" type="button" data-close aria-label="Cerrar">${icon.close}</button></div>
    <div class="modal-body">${body}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}`;
  dlg.onclick = e => { if (e.target === dlg || e.target.closest('[data-close]')) dlg.close(); };
  dlg.showModal();
  return dlg;
}

function confirmDialog(message, okLabel = 'Confirmar') {
  return new Promise(resolve => {
    const dlg = modal('Confirmar', `<p>${message}</p>`,
      `<button class="btn btn-line btn-sm" type="button" data-close>Cancelar</button><button class="btn btn-dark btn-sm" type="button" id="okBtn">${okLabel}</button>`);
    const done = v => { dlg.removeEventListener('close', onClose); dlg.close(); resolve(v); };
    const onClose = () => resolve(false);
    dlg.addEventListener('close', onClose, { once: true });
    $('#okBtn', dlg).onclick = () => done(true);
  });
}

/* =========================================================
   Resumen
   ========================================================= */
async function viewSummary() {
  const [products, orders] = await Promise.all([api.adminProducts(), api.adminOrders()]);
  const paid = orders.filter(o => PAID.includes(o.status));
  const revenue = paid.reduce((s, o) => s + o.total, 0);
  const published = products.filter(p => p.published);
  const variants = published.flatMap(p => p.variants.map(v => ({ ...v, product: p })));
  const alerts = variants.filter(v => stockState(v.stock) !== 'available').sort((a, b) => a.stock - b.stock);
  const toShip = orders.filter(o => ['paid', 'preparing', 'ready_pickup'].includes(o.status));

  main.innerHTML = `
    ${head('Resumen', isDemo ? 'Modo demostración: catálogo, pedidos y pagos de prueba.' : 'Estado general de la tienda.',
      isDemo ? '<button class="btn btn-line btn-sm" type="button" id="resetDemo">Restablecer datos de ejemplo</button>' : '')}
    <div class="kpis">
      <div class="kpi"><b>${cop(revenue)}</b><span>Ventas pagadas</span></div>
      <div class="kpi"><b>${paid.length}</b><span>Pedidos pagados</span></div>
      <div class="kpi"><b>${toShip.length}</b><span>Por despachar o entregar</span></div>
      <div class="kpi"><b>${paid.length ? cop(revenue / paid.length) : '—'}</b><span>Ticket promedio</span></div>
      <div class="kpi"><b>${published.length}</b><span>Productos publicados</span></div>
      <div class="kpi"><b>${variants.reduce((s, v) => s + v.stock, 0)}</b><span>Unidades en inventario</span></div>
    </div>
    <div class="editor">
      <section class="panel">
        <h2>Alertas de inventario</h2>
        ${alerts.length ? `<div class="table-wrap"><table class="admin-table"><thead><tr><th>Producto</th><th>Color</th><th>Talla</th><th>Estado</th></tr></thead><tbody>
          ${alerts.slice(0, 12).map(v => `<tr><td>${esc(v.product.name)} <small class="muted">${esc(v.product.ref)}</small></td><td>${esc(v.color)}</td><td>${esc(v.size)}</td><td>${stockBadge(v.stock)} ${v.stock ? `(${v.stock})` : ''}</td></tr>`).join('')}
          </tbody></table></div>
          ${alerts.length > 12 ? `<p class="small muted" style="margin-top:8px">y ${alerts.length - 12} más…</p>` : ''}
          <p style="margin-top:12px"><a class="btn btn-line btn-sm" href="#inventario">Ir al inventario</a></p>`
          : '<p class="muted">Todo el inventario está en niveles normales.</p>'}
      </section>
      <section class="panel">
        <h2>Últimos pedidos</h2>
        ${orders.length ? ordersTable(orders.slice(0, 6)) : '<p class="muted">Aún no hay pedidos.</p>'}
      </section>
    </div>`;
  bindOrderLinks();
  const reset = $('#resetDemo');
  if (reset) reset.addEventListener('click', async () => {
    if (!(await confirmDialog('Se borrarán los productos, pedidos y promociones de este navegador y se cargará el catálogo de ejemplo.', 'Restablecer'))) return;
    await api.adminResetDemo();
    toast('Datos de ejemplo restablecidos', 'success');
    route();
  });
}

/* =========================================================
   Productos
   ========================================================= */
async function viewProducts() {
  const products = await api.adminProducts();
  main.innerHTML = `
    ${head('Productos', `${products.length} productos · ${products.filter(p => p.published).length} publicados`,
      '<a class="btn btn-dark btn-sm" href="#producto/nuevo">+ Nuevo producto</a>')}
    <div class="toolbar"><input class="input" id="pSearch" type="search" placeholder="Buscar por nombre o referencia" aria-label="Buscar producto"></div>
    <div class="table-wrap"><table class="admin-table">
      <thead><tr><th></th><th>Producto</th><th>Categoría</th><th class="num">Precio</th><th class="num">Stock</th><th>Estado</th><th></th></tr></thead>
      <tbody id="pRows"></tbody></table></div>`;

  const draw = () => {
    const q = fold($('#pSearch').value);
    const list = products.filter(p => !q || fold(`${p.name} ${p.ref} ${p.category}`).includes(q));
    $('#pRows').innerHTML = list.map(p => `
      <tr>
        <td><img src="${esc(productImage(p))}" alt=""></td>
        <td><strong>${esc(p.name)}</strong><br><small class="muted">Ref. ${esc(p.ref)} · ${p.colors.length} color(es) · ${p.images.length} foto(s)</small></td>
        <td>${esc(p.category || '—')}${p.collection ? `<br><small class="muted">${esc(p.collection)}</small>` : ''}</td>
        <td class="num">${cop(p.price)}${p.compareAtPrice > p.price ? `<br><small class="muted"><s>${cop(p.compareAtPrice)}</s></small>` : ''}</td>
        <td class="num">${totalStock(p)}<br>${stockBadge(totalStock(p))}</td>
        <td>${p.published ? '<span class="badge badge-ok">Publicado</span>' : '<span class="badge">Oculto</span>'}
          ${p.featured ? '<br><small class="muted">Destacado</small>' : ''}${p.isNew ? '<br><small class="muted">Nuevo</small>' : ''}</td>
        <td><div class="actions">
          <a class="btn btn-line btn-sm" href="#producto/${encodeURIComponent(p.id)}">Editar</a>
          ${p.published ? `<a class="btn btn-ghost btn-sm" href="producto.html?p=${encodeURIComponent(p.slug)}" target="_blank" rel="noopener">Ver</a>` : ''}
          <button class="btn btn-ghost btn-sm" type="button" data-del="${esc(p.id)}">Eliminar</button>
        </div></td>
      </tr>`).join('') || '<tr><td colspan="7" class="muted">No hay productos.</td></tr>';
  };
  $('#pSearch').addEventListener('input', draw);
  main.addEventListener('click', async e => {
    const b = e.target.closest('[data-del]');
    if (!b) return;
    const p = products.find(x => x.id === b.dataset.del);
    if (!(await confirmDialog(`¿Eliminar <strong>${esc(p.name)}</strong>? Los pedidos existentes se conservan. Si solo quieres dejar de venderlo, desmarca “Publicado”.`, 'Eliminar'))) return;
    if (await busy(b, () => api.adminDeleteProduct(p.id).then(() => true))) { toast('Producto eliminado', 'success'); route(); }
  });
  draw();
}

function slugify(s) {
  return fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

async function viewProductEditor(id) {
  const products = await api.adminProducts();
  const isNew = !id || id === 'nuevo';
  const source = isNew ? null : products.find(p => p.id === decodeURIComponent(id));
  if (!isNew && !source) { main.innerHTML = '<div class="panel">Producto no encontrado. <a href="#productos">Volver</a></div>'; return; }

  const d = source ? JSON.parse(JSON.stringify(source)) : {
    id: null, name: '', ref: '', slug: '', category: 'Jeans', collection: '', price: 0, compareAtPrice: null,
    description: '', composition: '', fit: '', published: false, featured: false, isNew: true,
    colors: [{ name: 'Azul medio', hex: '#5b7a99' }], sizes: ['4', '6', '8', '10', '12', '14'], images: [], variants: []
  };
  const categories = Array.from(new Set(products.map(p => p.category).filter(Boolean).concat(['Jeans', 'Tops', 'Chalecos', 'Faldas', 'Shorts'])));
  const collections = Array.from(new Set(products.map(p => p.collection).filter(Boolean).concat(['Nueva colección'])));
  let slugTouched = !!source;

  main.innerHTML = `
    ${head(isNew ? 'Nuevo producto' : esc(d.name), isNew ? '' : `Ref. ${esc(d.ref)}`, '<a class="btn btn-line btn-sm" href="#productos">← Volver</a>')}
    <form id="pForm" class="form" novalidate>
      <div class="editor">
        <section class="panel form">
          <h2>Información</h2>
          <div class="field"><label for="fName">Nombre</label><input class="input" id="fName" value="${esc(d.name)}" required maxlength="120"></div>
          <div class="form-row">
            <div class="field"><label for="fRef">Referencia</label><input class="input" id="fRef" value="${esc(d.ref)}" required maxlength="30" style="text-transform:uppercase"></div>
            <div class="field"><label for="fSlug">URL (slug)</label><input class="input" id="fSlug" value="${esc(d.slug)}" required maxlength="80"><span class="hint">producto.html?p=<span id="slugPreview">${esc(d.slug)}</span></span></div>
          </div>
          <div class="form-row">
            <div class="field"><label for="fCategory">Categoría</label><input class="input" id="fCategory" list="catList" value="${esc(d.category || '')}" maxlength="40">
              <datalist id="catList">${categories.map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
            <div class="field"><label for="fCollection">Colección</label><input class="input" id="fCollection" list="colList" value="${esc(d.collection || '')}" maxlength="60">
              <datalist id="colList">${collections.map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
          </div>
          <div class="form-row">
            <div class="field"><label for="fPrice">Precio (COP)</label><input class="input" id="fPrice" type="number" min="0" step="100" value="${d.price || ''}" required></div>
            <div class="field"><label for="fCompare">Precio antes (opcional)</label><input class="input" id="fCompare" type="number" min="0" step="100" value="${d.compareAtPrice || ''}"><span class="hint">Se muestra tachado si es mayor al precio.</span></div>
          </div>
          <div class="field"><label for="fDesc">Descripción</label><textarea class="input" id="fDesc" maxlength="1200">${esc(d.description || '')}</textarea></div>
          <div class="form-row">
            <div class="field"><label for="fComp">Composición</label><input class="input" id="fComp" value="${esc(d.composition || '')}" maxlength="160" placeholder="98 % algodón, 2 % elastano"></div>
            <div class="field"><label for="fFit">Horma</label><input class="input" id="fFit" value="${esc(d.fit || '')}" maxlength="120" placeholder="Tiro alto · bota ancha"></div>
          </div>
          <div class="switches">
            <label class="check"><input type="checkbox" id="fPublished" ${d.published ? 'checked' : ''}> Publicado</label>
            <label class="check"><input type="checkbox" id="fFeatured" ${d.featured ? 'checked' : ''}> Destacado en inicio</label>
            <label class="check"><input type="checkbox" id="fNew" ${d.isNew ? 'checked' : ''}> Etiqueta “Nuevo”</label>
          </div>
        </section>

        <div class="form">
          <section class="panel">
            <h2>Fotografías</h2>
            <p class="small muted">La primera es la portada. Usa fotos verticales (3:4), idealmente de 1200 px o más. Se optimizan al subirlas.</p>
            <div class="images-edit" id="imgList"></div>
            <div class="form-row" style="margin-top:12px">
              <input class="input" id="imgUrl" type="url" placeholder="…o pega la URL de una imagen">
              <button class="btn btn-line btn-sm" type="button" id="addUrl">Agregar URL</button>
            </div>
            <input type="file" id="imgFile" accept="image/*" multiple hidden>
          </section>

          <section class="panel form">
            <h2>Colores y tallas</h2>
            <div class="list-edit" id="colorList"></div>
            <button class="btn btn-ghost btn-sm" type="button" id="addColor">+ Agregar color</button>
            <div class="field"><label for="fSizes">Tallas (separadas por coma)</label><input class="input" id="fSizes" value="${esc(d.sizes.join(', '))}"></div>
            <h3 style="margin-top:6px">Inventario por talla</h3>
            <div class="variant-grid" id="variantGrid"></div>
            <p class="small muted">Unidades disponibles por color y talla. Con 0 la talla aparece como “Agotado”; con ${CONFIG.inventory.lowStockThreshold} o menos, “Últimas unidades”.</p>
          </section>
        </div>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap">
        <a class="btn btn-line" href="#productos">Cancelar</a>
        <button class="btn btn-dark" type="submit">Guardar producto</button>
      </div>
    </form>`;

  /* --- Fotos --- */
  const drawImages = () => {
    $('#imgList').innerHTML = d.images.map((src, i) => `
      <figure><img src="${esc(src)}" alt="Foto ${i + 1}">
        <div class="img-actions">
          <button type="button" data-img-move="${i}" data-dir="-1" aria-label="Mover a la izquierda" ${i === 0 ? 'disabled' : ''}>‹</button>
          <button type="button" data-img-del="${i}" aria-label="Quitar foto">×</button>
          <button type="button" data-img-move="${i}" data-dir="1" aria-label="Mover a la derecha" ${i === d.images.length - 1 ? 'disabled' : ''}>›</button>
        </div></figure>`).join('') +
      `<button type="button" class="add-img" id="addImg">${icon.plus}<br>Subir fotos</button>`;
  };
  $('#imgList').addEventListener('click', e => {
    if (e.target.closest('#addImg')) return $('#imgFile').click();
    const del = e.target.closest('[data-img-del]');
    if (del) { d.images.splice(Number(del.dataset.imgDel), 1); drawImages(); return; }
    const mv = e.target.closest('[data-img-move]');
    if (mv) {
      const i = Number(mv.dataset.imgMove), j = i + Number(mv.dataset.dir);
      [d.images[i], d.images[j]] = [d.images[j], d.images[i]];
      drawImages();
    }
  });
  $('#imgFile').addEventListener('change', async e => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    for (const f of files) {
      const url = await busy(null, () => api.adminUploadImage(f));
      if (url) { d.images.push(url); drawImages(); }
    }
  });
  $('#addUrl').addEventListener('click', () => {
    const url = $('#imgUrl').value.trim();
    if (!/^https:\/\//.test(url)) return toast('Pega una URL que empiece por https://', 'error');
    d.images.push(url);
    $('#imgUrl').value = '';
    drawImages();
  });

  /* --- Colores, tallas e inventario --- */
  const stockOf = (color, size) => (d.variants.find(v => v.color === color && v.size === size) || {}).stock || 0;
  const readGrid = () => {
    $$('#variantGrid input').forEach(inp => {
      const v = d.variants.find(x => x.color === inp.dataset.color && x.size === inp.dataset.size);
      const n = Math.max(0, Math.floor(Number(inp.value) || 0));
      if (v) v.stock = n; else d.variants.push({ sku: null, color: inp.dataset.color, size: inp.dataset.size, stock: n });
    });
  };
  const readColors = () => {
    const rows = $$('#colorList .row');
    const before = d.colors.map(c => c.name);
    d.colors = rows.map(r => ({ name: $('[data-cname]', r).value.trim(), hex: $('[data-chex]', r).value }));
    // Si se renombra un color, sus existencias lo siguen
    d.colors.forEach((c, i) => { if (before[i] && before[i] !== c.name) d.variants.forEach(v => { if (v.color === before[i]) v.color = c.name; }); });
  };
  const drawColors = () => {
    $('#colorList').innerHTML = d.colors.map((c, i) => `
      <div class="row color">
        <input type="color" data-chex value="${esc(c.hex || '#5b7a99')}" aria-label="Tono del color ${i + 1}">
        <input class="input" data-cname value="${esc(c.name)}" placeholder="Nombre del color (ej. Azul claro)" aria-label="Nombre del color ${i + 1}">
        <button class="btn btn-ghost btn-sm" type="button" data-cdel="${i}" ${d.colors.length <= 1 ? 'disabled' : ''}>Quitar</button>
      </div>`).join('');
  };
  const drawGrid = () => {
    const sizes = d.sizes;
    $('#variantGrid').innerHTML = d.colors.length && sizes.length ? `
      <table><thead><tr><th>Color \\ Talla</th>${sizes.map(s => `<th>${esc(s)}</th>`).join('')}</tr></thead>
      <tbody>${d.colors.map(c => `<tr><th>${esc(c.name || '—')}</th>${sizes.map(s =>
        `<td><input class="input" type="number" min="0" step="1" data-color="${esc(c.name)}" data-size="${esc(s)}" value="${stockOf(c.name, s)}" aria-label="${esc(c.name)} talla ${esc(s)}"></td>`).join('')}</tr>`).join('')}</tbody></table>`
      : '<p class="muted small">Agrega al menos un color y una talla.</p>';
  };
  $('#colorList').addEventListener('change', () => { readGrid(); readColors(); drawGrid(); });
  $('#colorList').addEventListener('click', e => {
    const b = e.target.closest('[data-cdel]');
    if (!b) return;
    readGrid(); readColors();
    const [removed] = d.colors.splice(Number(b.dataset.cdel), 1);
    d.variants = d.variants.filter(v => v.color !== removed.name);
    drawColors(); drawGrid();
  });
  $('#addColor').addEventListener('click', () => { readGrid(); readColors(); d.colors.push({ name: '', hex: '#8fa9c4' }); drawColors(); drawGrid(); });
  $('#fSizes').addEventListener('change', () => {
    readGrid();
    d.sizes = sortSizes(Array.from(new Set($('#fSizes').value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean))));
    $('#fSizes').value = d.sizes.join(', ');
    drawGrid();
  });

  /* --- Nombre → slug --- */
  $('#fName').addEventListener('input', () => { if (!slugTouched) { $('#fSlug').value = slugify($('#fName').value); $('#slugPreview').textContent = $('#fSlug').value; } });
  $('#fSlug').addEventListener('input', () => { slugTouched = true; $('#slugPreview').textContent = $('#fSlug').value; });

  drawImages(); drawColors(); drawGrid();

  /* --- Guardar --- */
  $('#pForm').addEventListener('submit', async e => {
    e.preventDefault();
    readGrid(); readColors();
    const ref = $('#fRef').value.trim().toUpperCase();
    const product = {
      ...d,
      name: $('#fName').value.trim(),
      ref,
      slug: slugify($('#fSlug').value || $('#fName').value),
      category: $('#fCategory').value.trim(),
      collection: $('#fCollection').value.trim() || null,
      price: Math.round(Number($('#fPrice').value)),
      compareAtPrice: Number($('#fCompare').value) > 0 ? Math.round(Number($('#fCompare').value)) : null,
      description: $('#fDesc').value.trim(),
      composition: $('#fComp').value.trim(),
      fit: $('#fFit').value.trim(),
      published: $('#fPublished').checked,
      featured: $('#fFeatured').checked,
      isNew: $('#fNew').checked
    };
    if (product.name.length < 2) return toast('Escribe el nombre del producto.', 'error');
    if (!/^[A-Z0-9-]{2,30}$/.test(ref)) return toast('La referencia solo admite letras, números y guiones.', 'error');
    if (!product.slug) return toast('Revisa la URL del producto.', 'error');
    if (!(product.price > 0)) return toast('Escribe un precio válido.', 'error');
    if (!product.colors.length || product.colors.some(c => !c.name)) return toast('Cada color necesita un nombre.', 'error');
    if (new Set(product.colors.map(c => fold(c.name))).size !== product.colors.length) return toast('Hay colores repetidos.', 'error');
    if (!product.sizes.length) return toast('Agrega al menos una talla.', 'error');
    if (product.published && !product.images.length) toast('Aviso: el producto se publica sin fotos (se verá una imagen provisional).');

    // Solo quedan las combinaciones color × talla actuales; los SKU existentes se conservan
    const colorCode = name => fold(name).replace(/[^a-z0-9]/g, '').slice(0, 3).toUpperCase() || 'COL';
    product.variants = product.colors.flatMap(c => product.sizes.map(s => {
      const prev = d.variants.find(v => v.color === c.name && v.size === s);
      return { sku: (prev && prev.sku) || `${ref}-${colorCode(c.name)}-${fold(s).replace(/[^a-z0-9]/g, '').toUpperCase() || 'U'}`, color: c.name, size: s, stock: prev ? prev.stock : 0 };
    }));
    const skus = product.variants.map(v => v.sku);
    if (new Set(skus).size !== skus.length) return toast('Dos colores generan el mismo código (SKU). Cambia el nombre de uno de ellos.', 'error');

    const saved = await busy(e.submitter, () => api.adminSaveProduct(product));
    if (!saved) return;
    toast('Producto guardado', 'success');
    location.hash = '#productos';
  });
}

/* =========================================================
   Inventario
   ========================================================= */
async function viewInventory() {
  const products = await api.adminProducts();
  const rows = products.flatMap(p => sortSizes(p.sizes).flatMap(size => p.variants.filter(v => v.size === size).map(v => ({ ...v, product: p }))));
  main.innerHTML = `
    ${head('Inventario', 'Existencias por producto, color y talla.', '<button class="btn btn-dark btn-sm" type="button" id="saveStock" disabled>Guardar cambios</button>')}
    <div class="toolbar">
      <input class="input" id="iSearch" type="search" placeholder="Buscar producto, referencia o SKU" aria-label="Buscar">
      <select class="select" id="iFilter" aria-label="Filtrar por estado">
        <option value="">Todos los estados</option><option value="available">Disponible</option><option value="low">Últimas unidades</option><option value="out">Agotado</option>
      </select>
    </div>
    <div class="table-wrap"><table class="admin-table">
      <thead><tr><th>Producto</th><th>Color</th><th>Talla</th><th>SKU</th><th>Estado</th><th class="num">Unidades</th></tr></thead>
      <tbody id="iRows"></tbody></table></div>`;

  const changes = new Map();
  const draw = () => {
    const q = fold($('#iSearch').value);
    const f = $('#iFilter').value;
    $('#iRows').innerHTML = rows.filter(r => (!q || fold(`${r.product.name} ${r.product.ref} ${r.sku}`).includes(q)) && (!f || stockState(r.stock) === f))
      .map(r => {
        const val = changes.has(r.sku) ? changes.get(r.sku) : r.stock;
        return `<tr>
          <td><strong>${esc(r.product.name)}</strong><br><small class="muted">Ref. ${esc(r.product.ref)}${r.product.published ? '' : ' · oculto'}</small></td>
          <td>${esc(r.color)}</td><td>${esc(r.size)}</td><td><code>${esc(r.sku)}</code></td>
          <td>${stockBadge(val)}</td>
          <td class="num"><input class="input stock-input ${changes.has(r.sku) ? 'changed' : ''}" type="number" min="0" step="1" value="${val}" data-sku="${esc(r.sku)}" aria-label="Unidades de ${esc(r.sku)}"></td>
        </tr>`;
      }).join('') || '<tr><td colspan="6" class="muted">Sin resultados.</td></tr>';
  };
  $('#iSearch').addEventListener('input', draw);
  $('#iFilter').addEventListener('change', draw);
  $('#iRows').addEventListener('input', e => {
    const inp = e.target.closest('[data-sku]');
    if (!inp) return;
    const original = rows.find(r => r.sku === inp.dataset.sku).stock;
    const n = Math.max(0, Math.floor(Number(inp.value) || 0));
    if (n === original) changes.delete(inp.dataset.sku); else changes.set(inp.dataset.sku, n);
    inp.classList.toggle('changed', changes.has(inp.dataset.sku));
    $('#saveStock').disabled = !changes.size;
    $('#saveStock').textContent = changes.size ? `Guardar ${changes.size} cambio(s)` : 'Guardar cambios';
  });
  $('#saveStock').addEventListener('click', async e => {
    const ok = await busy(e.currentTarget, async () => {
      for (const [sku, n] of changes) await api.adminSetStock(sku, n);
      return true;
    });
    if (ok) { toast('Inventario actualizado', 'success'); route(); }
  });
  draw();
}

/* =========================================================
   Pedidos
   ========================================================= */
function ordersTable(orders) {
  return `<div class="table-wrap"><table class="admin-table">
    <thead><tr><th>Pedido</th><th>Fecha</th><th>Cliente</th><th>Entrega</th><th class="num">Total</th><th>Estado</th><th></th></tr></thead>
    <tbody>${orders.map(o => `<tr>
      <td><strong>${esc(o.number)}</strong></td>
      <td>${fmtDateTime(o.createdAt)}</td>
      <td>${esc(o.customer.name)}<br><small class="muted">${esc(o.customer.email)}</small></td>
      <td>${o.delivery.method === 'pickup' ? 'Recoge en tienda' : esc(`${o.delivery.city || ''}, ${o.delivery.department || ''}`)}</td>
      <td class="num">${cop(o.total)}</td>
      <td>${statusBadge(o.status)}</td>
      <td><button class="btn btn-line btn-sm" type="button" data-order="${esc(o.id)}">Ver</button></td>
    </tr>`).join('')}</tbody></table></div>`;
}

let ordersCache = [];
function bindOrderLinks() {
  main.onclick = e => {
    const b = e.target.closest('[data-order]');
    if (b) openOrder(ordersCache.find(o => o.id === b.dataset.order));
  };
}

async function viewOrders() {
  ordersCache = await api.adminOrders();
  main.innerHTML = `
    ${head('Pedidos', `${ordersCache.length} pedidos en total`, '<button class="btn btn-line btn-sm" type="button" id="exportOrders">Descargar CSV</button>')}
    <div class="toolbar">
      <input class="input" id="oSearch" type="search" placeholder="Buscar número, cliente o correo" aria-label="Buscar pedido">
      <select class="select" id="oFilter" aria-label="Filtrar por estado"><option value="">Todos los estados</option>
        ${Object.entries(ORDER_STATUS).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select>
    </div>
    <div id="oTable"></div>`;
  const draw = () => {
    const q = fold($('#oSearch').value);
    const f = $('#oFilter').value;
    const list = ordersCache.filter(o => (!f || o.status === f) && (!q || fold(`${o.number} ${o.customer.name} ${o.customer.email} ${o.customer.phone}`).includes(q)));
    $('#oTable').innerHTML = list.length ? ordersTable(list) : '<div class="panel muted">No hay pedidos con esos filtros.</div>';
  };
  $('#oSearch').addEventListener('input', draw);
  $('#oFilter').addEventListener('change', draw);
  $('#exportOrders').addEventListener('click', () => exportOrdersCsv(ordersCache));
  bindOrderLinks();
  draw();
}

function openOrder(o) {
  if (!o) return;
  const next = NEXT_STATUS[o.status] || [];
  const dlg = modal(`Pedido ${esc(o.number)}`, `
    <div class="order-detail">
      <p>${statusBadge(o.status)} <span class="small muted">· ${fmtDateTime(o.createdAt)}</span></p>
      <dl>
        <dt>Cliente</dt><dd>${esc(o.customer.name)}</dd>
        <dt>Documento</dt><dd>${esc(o.customer.docType)} ${esc(o.customer.docNumber)}</dd>
        <dt>Correo</dt><dd><a href="mailto:${esc(o.customer.email)}">${esc(o.customer.email)}</a></dd>
        <dt>Celular</dt><dd><a href="https://wa.me/57${esc(o.customer.phone)}" target="_blank" rel="noopener">${esc(o.customer.phone)}</a></dd>
        <dt>Entrega</dt><dd>${o.delivery.method === 'pickup' ? 'Recoge en tienda' : esc([o.delivery.address, o.delivery.details, o.delivery.city, o.delivery.department].filter(Boolean).join(', '))}</dd>
        ${o.notes ? `<dt>Notas</dt><dd>${esc(o.notes)}</dd>` : ''}
        <dt>Pago</dt><dd>${esc(o.payment ? `${o.payment.provider} · ${o.payment.status}${o.payment.method ? ' · ' + o.payment.method : ''}${o.payment.transactionId ? ' · ' + o.payment.transactionId : ''}` : '—')}</dd>
      </dl>
      <div class="table-wrap" style="margin:16px 0"><table class="admin-table"><thead><tr><th>Producto</th><th>Color / talla</th><th class="num">Cant.</th><th class="num">Subtotal</th></tr></thead>
        <tbody>${o.items.map(it => `<tr><td>${esc(it.name)}<br><small class="muted">${esc(it.sku)}</small></td><td>${esc(it.color)} · ${esc(it.size)}</td><td class="num">${it.qty}</td><td class="num">${cop(it.unitPrice * it.qty)}</td></tr>`).join('')}</tbody></table></div>
      <dl>
        <dt>Subtotal</dt><dd>${cop(o.subtotal)}</dd>
        ${o.discount ? `<dt>Descuento</dt><dd>− ${cop(o.discount)} ${o.promoCode ? `(${esc(o.promoCode)})` : ''}</dd>` : ''}
        <dt>Envío</dt><dd>${cop(o.shipping)}</dd>
        <dt><strong>Total</strong></dt><dd><strong>${cop(o.total)}</strong></dd>
      </dl>
    </div>`,
    next.length ? `<label class="visually-hidden" for="newStatus">Nuevo estado</label>
      <select class="select" id="newStatus" style="width:auto">${next.map(s => `<option value="${s}">${esc(ORDER_STATUS[s])}</option>`).join('')}</select>
      <button class="btn btn-dark btn-sm" type="button" id="saveStatus">Actualizar estado</button>` : '<span class="small muted">Este pedido ya no admite cambios de estado.</span>');
  const save = $('#saveStatus', dlg);
  if (save) save.addEventListener('click', async () => {
    const status = $('#newStatus', dlg).value;
    if (status === 'cancelled' && !(await confirmDialog('Al cancelar, las prendas vuelven al inventario. Si el pedido estaba pagado, gestiona el reembolso en Wompi.', 'Cancelar pedido'))) return;
    const updated = await busy(save, () => api.adminSetOrderStatus(o.id, status));
    if (!updated) return;
    toast('Estado actualizado', 'success');
    $('#adminModal').close();
    route();
  });
}

function exportOrdersCsv(orders) {
  const rows = [['Pedido', 'Fecha', 'Estado', 'Cliente', 'Documento', 'Correo', 'Celular', 'Entrega', 'Ciudad', 'Departamento', 'Dirección', 'Productos', 'Subtotal', 'Descuento', 'Envío', 'Total', 'Código']];
  orders.forEach(o => rows.push([
    o.number, fmtDateTime(o.createdAt), ORDER_STATUS[o.status] || o.status, o.customer.name, `${o.customer.docType} ${o.customer.docNumber}`,
    o.customer.email, o.customer.phone, o.delivery.method === 'pickup' ? 'Tienda' : 'Domicilio', o.delivery.city || '', o.delivery.department || '',
    [o.delivery.address, o.delivery.details].filter(Boolean).join(' '), o.items.map(i => `${i.qty}x ${i.name} ${i.color} T${i.size}`).join(' | '),
    o.subtotal, o.discount, o.shipping, o.total, o.promoCode || ''
  ]));
  const cell = v => {
    let s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const blob = new Blob(['﻿' + rows.map(r => r.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `pedidos-tuhan-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* =========================================================
   Clientes (a partir de los pedidos)
   ========================================================= */
async function viewCustomers() {
  const orders = await api.adminOrders();
  const map = new Map();
  orders.forEach(o => {
    const key = o.customer.email.toLowerCase();
    const c = map.get(key) || { name: o.customer.name, email: key, phone: o.customer.phone, orders: 0, paid: 0, spent: 0, last: o.createdAt };
    c.orders++;
    if (PAID.includes(o.status)) { c.paid++; c.spent += o.total; }
    if (o.createdAt > c.last) { c.last = o.createdAt; c.name = o.customer.name; c.phone = o.customer.phone; }
    map.set(key, c);
  });
  const customers = Array.from(map.values()).sort((a, b) => b.spent - a.spent || b.last.localeCompare(a.last));
  main.innerHTML = `
    ${head('Clientes', `${customers.length} clientes con pedidos`)}
    <div class="toolbar"><input class="input" id="cSearch" type="search" placeholder="Buscar nombre, correo o celular" aria-label="Buscar cliente"></div>
    <div class="table-wrap"><table class="admin-table">
      <thead><tr><th>Cliente</th><th>Celular</th><th class="num">Pedidos</th><th class="num">Pagados</th><th class="num">Total comprado</th><th>Último pedido</th></tr></thead>
      <tbody id="cRows"></tbody></table></div>`;
  const draw = () => {
    const q = fold($('#cSearch').value);
    $('#cRows').innerHTML = customers.filter(c => !q || fold(`${c.name} ${c.email} ${c.phone}`).includes(q)).map(c => `
      <tr><td><strong>${esc(c.name)}</strong><br><small class="muted">${esc(c.email)}</small></td>
        <td><a href="https://wa.me/57${esc(c.phone)}" target="_blank" rel="noopener">${esc(c.phone)}</a></td>
        <td class="num">${c.orders}</td><td class="num">${c.paid}</td><td class="num">${cop(c.spent)}</td><td>${fmtDateTime(c.last)}</td></tr>`).join('')
      || '<tr><td colspan="6" class="muted">Aún no hay clientes.</td></tr>';
  };
  $('#cSearch').addEventListener('input', draw);
  draw();
}

/* =========================================================
   Promociones
   ========================================================= */
async function viewPromotions() {
  const promos = await api.adminPromotions();
  main.innerHTML = `
    ${head('Promociones', 'Códigos de descuento para el carrito.', '<button class="btn btn-dark btn-sm" type="button" id="newPromo">+ Nueva promoción</button>')}
    <div class="table-wrap"><table class="admin-table">
      <thead><tr><th>Código</th><th>Descuento</th><th>Condiciones</th><th>Vigencia</th><th class="num">Usos</th><th>Estado</th><th></th></tr></thead>
      <tbody>${promos.map(p => `<tr>
        <td><strong>${esc(p.code)}</strong>${p.description ? `<br><small class="muted">${esc(p.description)}</small>` : ''}</td>
        <td>${p.type === 'percent' ? `${p.value} %` : cop(p.value)}</td>
        <td>${p.minSubtotal ? `Desde ${cop(p.minSubtotal)}` : 'Sin mínimo'}</td>
        <td>${p.startsAt || p.endsAt ? `${p.startsAt ? fmtDateTime(p.startsAt) : '—'} → ${p.endsAt ? fmtDateTime(p.endsAt) : '—'}` : 'Siempre'}</td>
        <td class="num">${p.uses || 0}${p.maxUses != null ? ` / ${p.maxUses}` : ''}</td>
        <td>${p.active ? '<span class="badge badge-ok">Activa</span>' : '<span class="badge">Inactiva</span>'}</td>
        <td><div class="actions"><button class="btn btn-line btn-sm" type="button" data-edit="${esc(p.id)}">Editar</button>
          <button class="btn btn-ghost btn-sm" type="button" data-del="${esc(p.id)}">Eliminar</button></div></td>
      </tr>`).join('') || '<tr><td colspan="7" class="muted">No hay promociones.</td></tr>'}</tbody></table></div>`;

  $('#newPromo').addEventListener('click', () => promoForm(null));
  main.onclick = async e => {
    const ed = e.target.closest('[data-edit]');
    if (ed) return promoForm(promos.find(p => p.id === ed.dataset.edit));
    const del = e.target.closest('[data-del]');
    if (del) {
      const p = promos.find(x => x.id === del.dataset.del);
      if (!(await confirmDialog(`¿Eliminar el código <strong>${esc(p.code)}</strong>?`, 'Eliminar'))) return;
      if (await busy(del, () => api.adminDeletePromotion(p.id).then(() => true))) { toast('Promoción eliminada', 'success'); route(); }
    }
  };
}

function promoForm(p) {
  const local = iso => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
  const dlg = modal(p ? 'Editar promoción' : 'Nueva promoción', `
    <form class="form" id="promoForm" novalidate>
      <div class="form-row">
        <div class="field"><label for="prCode">Código</label><input class="input" id="prCode" value="${esc(p ? p.code : '')}" maxlength="30" style="text-transform:uppercase" required></div>
        <div class="field"><label for="prDesc">Descripción interna</label><input class="input" id="prDesc" value="${esc(p ? p.description || '' : '')}" maxlength="120"></div>
      </div>
      <div class="form-row r-3">
        <div class="field"><label for="prType">Tipo</label><select class="select" id="prType">
          <option value="percent" ${!p || p.type === 'percent' ? 'selected' : ''}>Porcentaje</option>
          <option value="fixed" ${p && p.type === 'fixed' ? 'selected' : ''}>Valor fijo (COP)</option></select></div>
        <div class="field"><label for="prValue">Valor</label><input class="input" id="prValue" type="number" min="1" value="${p ? p.value : ''}" required></div>
        <div class="field"><label for="prMin">Compra mínima (COP)</label><input class="input" id="prMin" type="number" min="0" step="1000" value="${p ? p.minSubtotal || 0 : 0}"></div>
      </div>
      <div class="form-row r-3">
        <div class="field"><label for="prStart">Desde</label><input class="input" id="prStart" type="datetime-local" value="${local(p && p.startsAt)}"></div>
        <div class="field"><label for="prEnd">Hasta</label><input class="input" id="prEnd" type="datetime-local" value="${local(p && p.endsAt)}"></div>
        <div class="field"><label for="prMax">Máximo de usos</label><input class="input" id="prMax" type="number" min="1" value="${p && p.maxUses != null ? p.maxUses : ''}" placeholder="Sin límite"></div>
      </div>
      <label class="check"><input type="checkbox" id="prActive" ${!p || p.active ? 'checked' : ''}> Activa</label>
    </form>`,
    '<button class="btn btn-line btn-sm" type="button" data-close>Cancelar</button><button class="btn btn-dark btn-sm" type="submit" form="promoForm">Guardar</button>');

  $('#promoForm', dlg).addEventListener('submit', async e => {
    e.preventDefault();
    const code = $('#prCode', dlg).value.trim().toUpperCase();
    const type = $('#prType', dlg).value;
    const value = Math.round(Number($('#prValue', dlg).value));
    const start = $('#prStart', dlg).value, end = $('#prEnd', dlg).value;
    if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return toast('El código admite letras, números, guion y guion bajo (3 a 30).', 'error');
    if (!(value > 0) || (type === 'percent' && value > 90)) return toast(type === 'percent' ? 'El porcentaje debe estar entre 1 y 90.' : 'Escribe un valor válido.', 'error');
    if (start && end && new Date(end) <= new Date(start)) return toast('La fecha final debe ser posterior a la inicial.', 'error');
    const saved = await busy(e.submitter, () => api.adminSavePromotion({
      id: p ? p.id : null, code, type, value, description: $('#prDesc', dlg).value.trim(),
      minSubtotal: Math.max(0, Math.round(Number($('#prMin', dlg).value) || 0)),
      startsAt: start ? new Date(start).toISOString() : null,
      endsAt: end ? new Date(end).toISOString() : null,
      maxUses: $('#prMax', dlg).value ? Math.max(1, Math.round(Number($('#prMax', dlg).value))) : null,
      active: $('#prActive', dlg).checked
    }));
    if (!saved) return;
    toast('Promoción guardada', 'success');
    dlg.close();
    route();
  });
}
