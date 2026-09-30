import { CONFIG } from '../config.js';
import { initLayout, loadProducts } from '../core/layout.js';
import { productCard, skeletonCards } from '../core/components.js';
import { $, esc, fold, observeReveal, setMeta, sortSizes, totalStock } from '../core/util.js';

const params = new URLSearchParams(location.search);
const NEW = 'Nueva colección';
const state = {
  q: params.get('q') || '',
  category: params.get('categoria') || '',
  collection: params.get('coleccion') === 'nueva' ? NEW : (params.get('coleccion') || ''),
  size: params.get('talla') || '',
  color: params.get('color') || '',
  available: params.get('disponible') === '1',
  sort: params.get('orden') || 'featured'
};

initLayout({ active: state.collection === NEW ? 'new' : state.category === 'Jeans' ? 'jeans' : 'catalog' });

const grid = $('#catalogGrid');
grid.innerHTML = skeletonCards(6);
renderSizeGuide();

let products = [];
loadProducts().then(list => {
  products = list;
  buildFilters();
  render();
}).catch(() => {
  grid.innerHTML = '<p class="empty-state">No pudimos cargar el catálogo. Intenta de nuevo en un momento.</p>';
});

function chip(group, value, label, checked, extra = '') {
  return `<label class="chip"><input type="radio" name="${group}" value="${esc(value)}" ${checked ? 'checked' : ''}><span>${extra}${esc(label)}</span></label>`;
}

function buildFilters() {
  const categories = Array.from(new Set(products.map(p => p.category).filter(Boolean))).sort();
  const collections = Array.from(new Set(products.map(p => p.collection).filter(Boolean))).sort();
  const sizes = sortSizes(Array.from(new Set(products.flatMap(p => p.variants.map(v => v.size)))));
  const colors = [];
  products.forEach(p => p.colors.forEach(c => { if (!colors.some(x => x.name === c.name)) colors.push(c); }));

  $('#fCategory').innerHTML = chip('category', '', 'Todo', !state.category) + categories.map(c => chip('category', c, c, state.category === c)).join('');
  $('#fCollection').innerHTML = chip('collection', '', 'Todas', !state.collection) + collections.map(c => chip('collection', c, c, state.collection === c)).join('');
  $('#fSize').innerHTML = chip('size', '', 'Todas', !state.size) + sizes.map(s => chip('size', s, s, state.size === s)).join('');
  $('#fColor').innerHTML = chip('color', '', 'Todos', !state.color) +
    colors.map(c => chip('color', c.name, c.name, state.color === c.name, `<i class="dot" style="--c:${esc(c.hex)}"></i>`)).join('');
  $('#fAvailable').checked = state.available;
  $('#sort').value = state.sort;

  $('#filters').addEventListener('change', e => {
    const t = e.target;
    if (t.name) state[t.name] = t.value;
    if (t.id === 'fAvailable') state.available = t.checked;
    render();
  });
  $('#sort').addEventListener('change', e => { state.sort = e.target.value; render(); });
  $('#fClear').addEventListener('click', () => {
    Object.assign(state, { q: '', category: '', collection: '', size: '', color: '', available: false });
    buildFilters();
    render();
  });
  const toggle = $('#filtersToggle');
  toggle.onclick = () => {
    const open = $('#filters').classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  };
}

function render() {
  const q = fold(state.q);
  let list = products.filter(p =>
    (!state.category || p.category === state.category) &&
    (!state.collection || p.collection === state.collection) &&
    (!state.color || p.colors.some(c => c.name === state.color)) &&
    (!state.size || p.variants.some(v => v.size === state.size && (!state.available || v.stock > 0) && (!state.color || v.color === state.color))) &&
    (!state.available || p.variants.some(v => v.stock > 0 && (!state.size || v.size === state.size) && (!state.color || v.color === state.color))) &&
    (!q || fold(`${p.name} ${p.ref} ${p.category} ${p.description} ${p.colors.map(c => c.name).join(' ')}`).includes(q)));

  const inStock = p => (totalStock(p) > 0 ? 1 : 0);
  const sorters = {
    featured: (a, b) => inStock(b) - inStock(a) || Number(!!b.featured) - Number(!!a.featured) || Number(!!b.isNew) - Number(!!a.isNew),
    new: (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)),
    'price-asc': (a, b) => a.price - b.price,
    'price-desc': (a, b) => b.price - a.price,
    name: (a, b) => a.name.localeCompare(b.name, 'es')
  };
  list = list.sort(sorters[state.sort] || sorters.featured);

  const title = state.q ? `Resultados para “${state.q}”` : state.collection || state.category || 'Catálogo';
  $('#catTitle').textContent = title;
  $('#crumb').textContent = title;
  $('#catDesc').textContent = state.collection === NEW
    ? 'Lo más nuevo de TUHAN COUTURE. No te la pierdas.'
    : 'Jeans y denim de marca 100% colombiana, con tallas e inventario en tiempo real.';
  $('#catCount').textContent = `${list.length} ${list.length === 1 ? 'producto' : 'productos'}`;
  setMeta({ title: `${title} · ${CONFIG.brand.name}` });

  grid.innerHTML = list.length
    ? list.map((p, i) => productCard(p, { eager: i < 4 })).join('')
    : `<div class="empty-state" style="grid-column:1/-1"><p>No encontramos productos con esos filtros.</p>
        <button class="btn btn-line btn-sm" type="button" id="emptyClear">Limpiar filtros</button></div>`;
  const emptyClear = $('#emptyClear');
  if (emptyClear) emptyClear.addEventListener('click', () => $('#fClear').click());
  observeReveal(grid);

  // Mantiene la URL compartible con los filtros aplicados
  const url = new URLSearchParams();
  if (state.q) url.set('q', state.q);
  if (state.category) url.set('categoria', state.category);
  if (state.collection) url.set('coleccion', state.collection === NEW ? 'nueva' : state.collection);
  if (state.size) url.set('talla', state.size);
  if (state.color) url.set('color', state.color);
  if (state.available) url.set('disponible', '1');
  if (state.sort !== 'featured') url.set('orden', state.sort);
  history.replaceState(null, '', location.pathname + (url.toString() ? '?' + url : '') + location.hash);
}

function renderSizeGuide() {
  const g = CONFIG.sizeGuide;
  $('#sizeGuide').innerHTML = `
    <table class="size-table">
      <thead><tr>${g.columns.map(c => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${g.rows.map(r => `<tr>${r.map((c, i) => i ? `<td>${esc(c)}</td>` : `<th scope="row">${esc(c)}</th>`).join('')}</tr>`).join('')}</tbody>
    </table>
    <p class="muted small">${esc(g.note)}</p>`;
}
