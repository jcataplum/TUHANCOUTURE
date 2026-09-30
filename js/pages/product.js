import { CONFIG, whatsappLink } from '../config.js';
import { initLayout, loadProducts, openCart } from '../core/layout.js';
import { api } from '../core/api.js';
import { Cart } from '../core/cart.js';
import { productCard, icon } from '../core/components.js';
import {
  $, $$, cop, esc, param, productImage, sortSizes, stockBadge, stockLabel, stockState,
  totalStock, toast, setMeta, jsonLd, observeReveal
} from '../core/util.js';

initLayout({ active: 'catalog' });

const root = $('#productRoot');
const slug = param('p');

(async () => {
  let product = null;
  try { product = slug ? await api.getProduct(slug) : null; } catch (e) { console.error(e); }
  if (!product) {
    root.innerHTML = `<div class="empty-state"><h1>Producto no encontrado</h1><p>Puede que ya no esté disponible.</p>
      <a class="btn btn-dark" href="catalogo.html">Ver catálogo</a></div>`;
    return;
  }
  renderProduct(product);
  renderRelated(product);
})();

function renderProduct(p) {
  const sizes = sortSizes(Array.from(new Set(p.variants.map(v => v.size))));
  const firstColor = (p.colors.find(c => p.variants.some(v => v.color === c.name && v.stock > 0)) || p.colors[0] || {}).name;
  const st = { color: firstColor, size: null, qty: 1 };
  const images = (p.images && p.images.length) ? p.images : [productImage(p)];
  const variantOf = (color, size) => p.variants.find(v => v.color === color && v.size === size);

  $('#crumb').textContent = p.name;
  const desc = `${p.name} (Ref. ${p.ref}) de TUHAN COUTURE. ${p.description || ''}`.slice(0, 158);
  setMeta({ title: `${p.name} · Ref. ${p.ref} · ${CONFIG.brand.name}`, description: desc, image: images[0] });

  root.innerHTML = `
    <article class="product" itemscope>
      <section class="gallery" aria-label="Galería de imágenes">
        <div class="gallery-main" id="galleryMain" tabindex="0" aria-label="Fotos del producto; desliza para ver más">
          ${images.map((src, i) => `<figure data-i="${i}"><img src="${esc(src)}" alt="${esc(p.name)} — foto ${i + 1} de ${images.length}" ${i ? 'loading="lazy"' : 'fetchpriority="high"'} width="900" height="1200"></figure>`).join('')}
        </div>
        ${images.length > 1 ? `
          <div class="gallery-dots" aria-hidden="true">${images.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>
          <div class="gallery-thumbs" role="tablist" aria-label="Miniaturas">${images.map((src, i) =>
            `<button type="button" data-thumb="${i}" aria-label="Ver foto ${i + 1}" aria-current="${i === 0}"><img src="${esc(src)}" alt="" loading="lazy" width="72" height="96"></button>`).join('')}</div>` : ''}
      </section>

      <section class="buy-box" aria-label="Comprar">
        <p class="eyebrow">Ref. ${esc(p.ref)}${p.collection ? ' · ' + esc(p.collection) : ''}</p>
        <h1>${esc(p.name)}</h1>
        <p class="price">${cop(p.price)}${p.compareAtPrice > p.price ? ` <s>${cop(p.compareAtPrice)}</s>` : ''}</p>
        <p id="overallStock">${stockBadge(totalStock(p))}</p>

        <div class="opt-label">Color <span id="colorName"></span></div>
        <div class="color-options" role="group" aria-label="Color">
          ${p.colors.map(c => `<button type="button" class="color-opt" style="--c:${esc(c.hex)}" data-color="${esc(c.name)}" aria-label="${esc(c.name)}" title="${esc(c.name)}"></button>`).join('')}
        </div>

        <div class="opt-label">Talla <button class="link-btn" type="button" id="openGuide">${icon.ruler} Guía de tallas</button></div>
        <div class="size-options" role="group" aria-label="Talla" id="sizeOptions"></div>
        <p class="size-status" id="sizeStatus" aria-live="polite"></p>

        <div class="buy-actions">
          <div class="qty" aria-label="Cantidad">
            <button type="button" id="qtyMinus" aria-label="Disminuir cantidad">${icon.minus}</button>
            <span id="qtyValue" aria-live="polite">1</span>
            <button type="button" id="qtyPlus" aria-label="Aumentar cantidad">${icon.plus}</button>
          </div>
          <button class="btn btn-dark" type="button" id="addBtn">${icon.bag} Agregar al carrito</button>
          ${whatsappLink() ? `<a class="btn btn-wa btn-wa" id="waBtn" target="_blank" rel="noopener" href="#">${icon.whatsapp} Comprar por WhatsApp</a>` : ''}
        </div>

        <ul class="buy-perks">
          <li>${icon.truck} Envíos a todo Colombia · ${esc(CONFIG.shipping.estimatedDays)}${CONFIG.shipping.freeShippingFrom != null ? ` · gratis desde ${cop(CONFIG.shipping.freeShippingFrom)}` : ''}</li>
          ${CONFIG.shipping.storePickup ? `<li>${icon.store} Recoge gratis en tienda: ${esc(CONFIG.store.address.replace('Centro Comercial', 'C.C.'))}</li>` : ''}
          <li>${icon.shield} Pago seguro con tarjetas, PSE, Nequi y más</li>
        </ul>

        <div class="accordion">
          <details open><summary>Disponibilidad por talla</summary><div class="acc-body" id="availability"></div></details>
          <details><summary>Descripción</summary><div class="acc-body"><p>${esc(p.description || 'Pronto agregaremos la descripción de este producto.')}</p>${p.fit ? `<p><strong>Horma:</strong> ${esc(p.fit)}</p>` : ''}</div></details>
          <details><summary>Composición y cuidados</summary><div class="acc-body">
            <p><strong>Composición:</strong> ${esc(p.composition || 'Por confirmar')}</p>
            <p>Lava al revés con agua fría y colores similares. No uses blanqueador. Seca a la sombra para conservar el color.</p></div></details>
          <details><summary>Guía de tallas</summary><div class="acc-body">${sizeGuideHtml()}</div></details>
          <details><summary>Envíos y cambios</summary><div class="acc-body">
            <p>Enviamos a todo el país en ${esc(CONFIG.shipping.estimatedDays)}. Consulta nuestra <a href="cambios-devoluciones.html">política de cambios y devoluciones</a>.</p></div></details>
        </div>
      </section>
    </article>

    <dialog class="modal" id="guideModal" aria-labelledby="guideTitle">
      <div class="modal-head"><h2 id="guideTitle">Guía de tallas</h2><button class="icon-btn" type="button" data-close aria-label="Cerrar">${icon.close}</button></div>
      <div class="modal-body">${sizeGuideHtml()}</div>
    </dialog>`;

  /* ---------- Selección de color y talla ---------- */
  function draw() {
    $$('.color-opt').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.color === st.color)));
    $('#colorName').textContent = st.color || '';

    $('#sizeOptions').innerHTML = sizes.map(size => {
      const v = variantOf(st.color, size);
      const qty = v ? v.stock : 0;
      const s = stockState(qty);
      return `<button type="button" class="size-opt ${s === 'low' ? 'low' : ''}" data-size="${esc(size)}"
        aria-pressed="${st.size === size}" ${s === 'out' ? 'disabled' : ''}
        aria-label="Talla ${esc(size)}: ${stockLabel(qty)}" title="${stockLabel(qty)}">${esc(size)}</button>`;
    }).join('');

    const v = st.size ? variantOf(st.color, st.size) : null;
    const status = $('#sizeStatus');
    if (!v) {
      status.innerHTML = sizes.some(s => (variantOf(st.color, s) || {}).stock > 0)
        ? '<span class="muted small">Selecciona tu talla.</span>'
        : '<span class="stock stock-out">Agotado en este color</span>';
    } else {
      status.innerHTML = stockBadge(v.stock) + (stockState(v.stock) === 'low' ? ` <span class="small muted">· quedan ${v.stock}</span>` : '');
    }

    const max = v ? v.stock : 1;
    st.qty = Math.min(st.qty, Math.max(1, max));
    $('#qtyValue').textContent = st.qty;
    $('#qtyMinus').disabled = st.qty <= 1;
    $('#qtyPlus').disabled = !v || st.qty >= max;
    const add = $('#addBtn');
    add.disabled = !!v && v.stock <= 0;
    add.innerHTML = v && v.stock <= 0 ? 'Agotado' : `${icon.bag} Agregar al carrito`;

    $('#availability').innerHTML = `
      <table class="availability">
        <thead><tr><th scope="col">Talla</th><th scope="col">${esc(st.color || 'Color')}</th></tr></thead>
        <tbody>${sizes.map(size => {
          const vv = variantOf(st.color, size);
          return `<tr><th scope="row">${esc(size)}</th><td>${stockBadge(vv ? vv.stock : 0)}</td></tr>`;
        }).join('')}</tbody>
      </table>`;

    const wa = $('#waBtn');
    if (wa) {
      wa.href = whatsappLink(`Hola TUHAN COUTURE, quiero comprar: ${p.name} (Ref. ${p.ref})` +
        `${st.color ? `, color ${st.color}` : ''}${st.size ? `, talla ${st.size}` : ''}. ¿Está disponible?`);
    }
  }

  root.addEventListener('click', e => {
    const c = e.target.closest('.color-opt');
    if (c) {
      st.color = c.dataset.color;
      const v = st.size && variantOf(st.color, st.size);
      if (!v || v.stock <= 0) st.size = null;
      draw();
      return;
    }
    const s = e.target.closest('.size-opt');
    if (s && !s.disabled) { st.size = s.dataset.size; draw(); }
  });
  $('#qtyMinus').addEventListener('click', () => { st.qty = Math.max(1, st.qty - 1); draw(); });
  $('#qtyPlus').addEventListener('click', () => { st.qty += 1; draw(); });

  $('#addBtn').addEventListener('click', () => {
    if (!st.size) {
      $('#sizeStatus').innerHTML = '<span class="text-danger small">Selecciona una talla para continuar.</span>';
      $('#sizeOptions').querySelector('.size-opt:not(:disabled)')?.focus();
      return;
    }
    const v = variantOf(st.color, st.size);
    try {
      const added = Cart.add(p, v.sku, st.qty);
      toast(added < st.qty ? `Agregamos ${added}: es todo lo disponible en talla ${st.size}.` : 'Agregado al carrito', 'success');
      openCart();
    } catch (ex) {
      toast(ex.message, 'error');
    }
  });

  /* ---------- Galería ---------- */
  const main = $('#galleryMain');
  const dots = $$('.gallery-dots i');
  const thumbs = $$('[data-thumb]');
  const setActive = i => {
    dots.forEach((d, k) => d.classList.toggle('on', k === i));
    thumbs.forEach((t, k) => t.setAttribute('aria-current', String(k === i)));
  };
  main.addEventListener('scroll', () => setActive(Math.round(main.scrollLeft / main.clientWidth)), { passive: true });
  thumbs.forEach(t => t.addEventListener('click', () => {
    main.scrollTo({ left: main.clientWidth * Number(t.dataset.thumb), behavior: 'smooth' });
  }));
  // Zoom al hacer clic (escritorio): sigue el cursor
  $$('figure', main).forEach(fig => {
    fig.addEventListener('click', () => fig.classList.toggle('zoom'));
    fig.addEventListener('mousemove', e => {
      if (!fig.classList.contains('zoom')) return;
      const r = fig.getBoundingClientRect();
      fig.querySelector('img').style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
    });
    fig.addEventListener('mouseleave', () => fig.classList.remove('zoom'));
  });

  /* ---------- Guía de tallas ---------- */
  const guide = $('#guideModal');
  $('#openGuide').addEventListener('click', () => guide.showModal());
  guide.addEventListener('click', e => { if (e.target === guide || e.target.closest('[data-close]')) guide.close(); });

  draw();

  /* ---------- SEO ---------- */
  const total = totalStock(p);
  jsonLd({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    sku: p.ref,
    description: p.description,
    image: images.filter(src => !src.startsWith('data:')),
    brand: { '@type': 'Brand', name: CONFIG.brand.name },
    material: p.composition || undefined,
    color: p.colors.map(c => c.name).join(', '),
    offers: {
      '@type': 'Offer',
      priceCurrency: 'COP',
      price: p.price,
      availability: total > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: CONFIG.siteUrl ? CONFIG.siteUrl.replace(/\/$/, '') + '/producto.html?p=' + encodeURIComponent(p.slug) : undefined
    }
  }, 'ld-product');
}

function sizeGuideHtml() {
  const g = CONFIG.sizeGuide;
  return `<table class="size-table">
      <thead><tr>${g.columns.map(c => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${g.rows.map(r => `<tr>${r.map((c, i) => i ? `<td>${esc(c)}</td>` : `<th scope="row">${esc(c)}</th>`).join('')}</tr>`).join('')}</tbody>
    </table><p class="small muted">${esc(g.note)}</p>`;
}

async function renderRelated(p) {
  const all = await loadProducts().catch(() => []);
  const related = all.filter(x => x.id !== p.id && x.category === p.category && totalStock(x) > 0).slice(0, 4);
  if (!related.length) return;
  $('#relatedGrid').innerHTML = related.map(x => productCard(x)).join('');
  $('#related').hidden = false;
  observeReveal($('#related'));
}
