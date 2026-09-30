import { CONFIG, whatsappLink, mapsLink } from '../config.js';
import { initLayout, loadProducts } from '../core/layout.js';
import { productCard, skeletonCards, icon } from '../core/components.js';
import { $, $$, cop, esc, observeReveal, jsonLd, productImage } from '../core/util.js';
import { isDemo } from '../core/api.js';

initLayout({ active: 'home' });

$$('[data-icon]').forEach(el => { el.outerHTML = icon[el.dataset.icon] || ''; });

const s = CONFIG.shipping;
$('#valShipping').textContent = s.freeShippingFrom != null
  ? `Envío gratis desde ${cop(s.freeShippingFrom)}. Entrega en ${s.estimatedDays}.`
  : `Entrega en ${s.estimatedDays}.`;
$('#valStore').textContent = `${CONFIG.store.address.replace('Centro Comercial', 'C.C.')}${CONFIG.store.city ? ', ' + CONFIG.store.city : ''}.`;

/* ---------- Tienda física ---------- */
const st = CONFIG.store;
const wa = whatsappLink('Hola TUHAN COUTURE, quiero visitar la tienda. ¿Me confirman el horario?');
$('#storeInfo').innerHTML = `
  <p style="font-size:1.1rem;color:#fff;margin-bottom:.4em">${icon.pin} ${esc(st.address)}</p>
  ${st.city ? `<p class="muted" style="color:#b9b1a4">${esc(st.city)}</p>` : ''}
  <div class="hours" style="margin-top:18px">${icon.clock}
    ${st.hours && st.hours.length ? `<ul>${st.hours.map(h => `<li>${esc(h)}</li>`).join('')}</ul>`
      : isDemo ? '<span class="pending">Horario de atención · por configurar</span>' : '<span>Consulta el horario por WhatsApp.</span>'}
  </div>`;
$('#storeCta').innerHTML = `
  <p style="color:#d9d2c5">Ven a medirte tus jeans favoritos y recibe asesoría personalizada de nuestro equipo.</p>
  <div class="hero-actions">
    ${mapsLink() ? `<a class="btn btn-gold" href="${esc(mapsLink())}" target="_blank" rel="noopener">${icon.pin} Cómo llegar</a>` : ''}
    ${wa ? `<a class="btn btn-line-light" href="${esc(wa)}" target="_blank" rel="noopener">${icon.whatsapp} Escríbenos</a>` : ''}
  </div>`;

/* ---------- Productos ---------- */
const featuredGrid = $('#featuredGrid');
const newGrid = $('#newGrid');
featuredGrid.innerHTML = skeletonCards(4);
newGrid.innerHTML = skeletonCards(3);

loadProducts().then(products => {
  const available = p => p.variants.some(v => v.stock > 0);
  const byAvail = (a, b) => Number(available(b)) - Number(available(a));
  const featured = products.filter(p => p.featured).sort(byAvail).slice(0, 8);
  const fresh = products.filter(p => p.isNew || p.collection === 'Nueva colección').sort(byAvail).slice(0, 3);

  featuredGrid.innerHTML = featured.length
    ? featured.map((p, i) => productCard(p, { eager: i < 2 })).join('')
    : '<p class="muted">Pronto verás aquí nuestros destacados.</p>';
  newGrid.innerHTML = fresh.length
    ? fresh.map(p => productCard(p)).join('')
    : '<p class="muted">La nueva colección llega muy pronto.</p>';

  // Foto del banner de la colección: la del primer producto nuevo que tenga fotografía real
  const withPhoto = fresh.find(p => (p.images || []).length);
  if (withPhoto) {
    const img = document.createElement('img');
    img.src = productImage(withPhoto);
    img.alt = '';
    img.loading = 'lazy';
    $('#newBanner').prepend(img);
  }
  observeReveal();
}).catch(() => {
  featuredGrid.innerHTML = '<p class="muted">No pudimos cargar los productos. Intenta de nuevo en un momento.</p>';
  newGrid.innerHTML = '';
});

/* ---------- SEO: datos estructurados de la tienda ---------- */
jsonLd({
  '@context': 'https://schema.org',
  '@type': 'ClothingStore',
  name: CONFIG.brand.name,
  description: CONFIG.brand.description,
  image: CONFIG.siteUrl ? CONFIG.siteUrl.replace(/\/$/, '') + '/' + CONFIG.brand.logo : undefined,
  url: CONFIG.siteUrl || undefined,
  telephone: CONFIG.contact.phone ? '+57 ' + CONFIG.contact.phone : undefined,
  email: CONFIG.contact.email || undefined,
  address: {
    '@type': 'PostalAddress',
    streetAddress: st.address,
    addressLocality: st.city || undefined,
    addressCountry: 'CO'
  },
  sameAs: [CONFIG.social.instagram, CONFIG.social.facebook, CONFIG.social.tiktok].filter(Boolean)
}, 'ld-store');
