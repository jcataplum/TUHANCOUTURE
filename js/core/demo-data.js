/* =========================================================
   demo-data.js — Catálogo DE EJEMPLO para el modo demostración.
   Nombres, precios y existencias son ilustrativos: reemplázalos
   desde el panel administrativo (o cárgalos en Supabase).
   ========================================================= */

const SIZES = ['4', '6', '8', '10', '12', '14'];

/** stock: { 'Azul claro': [4,6,8,10,12,14 → cantidades] } */
function product(p, stock) {
  const colors = Object.keys(stock).map(name => ({ name, hex: p.hex[name] }));
  const variants = [];
  Object.entries(stock).forEach(([color, qtys]) => {
    qtys.forEach((qty, i) => variants.push({
      sku: `${p.ref}-${color.slice(0, 3).toUpperCase()}-${SIZES[i]}`,
      color, size: SIZES[i], stock: qty
    }));
  });
  delete p.hex;
  return Object.assign({
    images: [], sizes: SIZES.slice(), published: true, featured: false, isNew: false,
    compareAtPrice: null, collection: null, createdAt: '2026-09-01T12:00:00.000Z'
  }, p, { colors, variants });
}

export const DEMO_PRODUCTS = [
  product({
    id: 'p-wide-clasico', slug: 'wide-leg-clasico', ref: 'TC-101', name: 'Wide Leg Clásico', category: 'Jeans',
    price: 139900, featured: true, isNew: true, collection: 'Nueva colección',
    description: 'Silueta amplia de tiro alto que alarga la figura. Bota ancha con caída fluida para looks de día o de noche.',
    composition: '98 % algodón, 2 % elastano', fit: 'Tiro alto · bota ancha',
    hex: { 'Azul claro': '#8FA9C4', 'Azul medio': '#4F6F93' }
  }, { 'Azul claro': [2, 5, 7, 6, 3, 0], 'Azul medio': [0, 4, 6, 5, 2, 1] }),

  product({
    id: 'p-baggy-destroyed', slug: 'baggy-destroyed', ref: 'TC-102', name: 'Baggy Destroyed', category: 'Jeans',
    price: 149900, featured: true, isNew: true, collection: 'Nueva colección',
    description: 'Jean baggy con rotos y desgastes hechos a mano. Relajado, cómodo y con toda la actitud.',
    composition: '100 % algodón', fit: 'Tiro medio · fit relajado',
    hex: { 'Azul medio': '#5B7A99' }
  }, { 'Azul medio': [3, 6, 8, 4, 2, 1] }),

  product({
    id: 'p-flare-oscuro', slug: 'flare-oscuro', ref: 'TC-103', name: 'Flare Oscuro', category: 'Jeans',
    price: 134900, compareAtPrice: 159900, featured: true,
    description: 'Bota campana con horma que realza la cadera. Lavado oscuro elegante, ideal con tacones.',
    composition: '92 % algodón, 6 % poliéster, 2 % elastano', fit: 'Tiro alto · bota campana',
    hex: { 'Azul oscuro': '#2E3F57' }
  }, { 'Azul oscuro': [1, 3, 5, 5, 3, 2] }),

  product({
    id: 'p-mom-tiro-alto', slug: 'mom-jean-tiro-alto', ref: 'TC-104', name: 'Mom Jean Tiro Alto', category: 'Jeans',
    price: 119900, featured: true,
    description: 'El básico que no falla: pierna recta y cintura alta que estiliza. Combina con todo.',
    composition: '99 % algodón, 1 % elastano', fit: 'Tiro alto · pierna recta',
    hex: { 'Azul claro': '#9DB4CC', 'Negro': '#23262B' }
  }, { 'Azul claro': [4, 7, 9, 8, 5, 3], 'Negro': [2, 4, 6, 4, 0, 0] }),

  product({
    id: 'p-recto-celeste', slug: 'recto-celeste', ref: 'TC-105', name: 'Recto Celeste', category: 'Jeans',
    price: 124900, isNew: true, collection: 'Nueva colección',
    description: 'Pierna recta en lavado celeste con dobladillo en crudo. Fresco y versátil.',
    composition: '100 % algodón', fit: 'Tiro medio · recto',
    hex: { 'Celeste': '#AFC4D8' }
  }, { 'Celeste': [0, 2, 3, 3, 1, 0] }),

  product({
    id: 'p-top-strapless', slug: 'top-denim-strapless', ref: 'TC-201', name: 'Top Denim Strapless', category: 'Tops',
    price: 79900, featured: true, isNew: true, collection: 'Nueva colección',
    description: 'Top strapless en denim con ajuste en la espalda. Hazlo conjunto con tu jean favorito.',
    composition: '98 % algodón, 2 % elastano', fit: 'Ajustado · largo crop',
    hex: { 'Azul claro': '#8FA9C4' },
    sizes: ['4', '6', '8', '10', '12', '14']
  }, { 'Azul claro': [2, 4, 5, 3, 1, 0] }),

  product({
    id: 'p-chaleco-crop', slug: 'chaleco-denim-crop', ref: 'TC-202', name: 'Chaleco Denim Crop', category: 'Chalecos',
    price: 99900, isNew: true, collection: 'Nueva colección',
    description: 'Chaleco corto con botones y borde deshilachado. El toque couture para tus outfits.',
    composition: '100 % algodón', fit: 'Corto · ajustado',
    hex: { 'Negro deslavado': '#3A3D44' }
  }, { 'Negro deslavado': [1, 3, 4, 2, 1, 0] }),

  product({
    id: 'p-cargo-denim', slug: 'cargo-denim', ref: 'TC-106', name: 'Cargo Denim', category: 'Jeans',
    price: 154900,
    description: 'Jean cargo con bolsillos laterales y bota amplia. Estilo urbano con acabado premium.',
    composition: '100 % algodón', fit: 'Tiro medio · bota amplia',
    hex: { 'Azul medio': '#5B7A99' }
  }, { 'Azul medio': [0, 0, 0, 0, 0, 0] })
];

export const DEMO_PROMOTIONS = [
  { id: 'promo-bienvenida', code: 'BIENVENIDA10', type: 'percent', value: 10, minSubtotal: 0,
    active: true, startsAt: null, endsAt: null, maxUses: null, uses: 0, description: 'Ejemplo: 10 % en tu primera compra' }
];
