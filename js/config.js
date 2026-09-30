/* =========================================================
   config.js — Datos configurables de la tienda TUHAN COUTURE
   ---------------------------------------------------------
   Todo lo que dice `null` está PENDIENTE: la marca aún no lo
   ha confirmado y la tienda lo oculta al público hasta que se
   complete (en modo demostración se marca "por configurar").
   Los valores marcados con "AJUSTAR" son de ejemplo.
   ========================================================= */
export const CONFIG = {
  brand: {
    name: 'TUHAN COUTURE',
    shortName: 'Tuhan',
    tagline: 'Marca 100% colombiana',
    description: 'Jeans y denim de marca 100% colombiana. Envíos a todo el país y tienda física en el C.C. Estación Niquía.',
    logo: 'assets/img/logo-tuhan.jpeg'
  },

  // Dominio público final, para SEO (canonical, Open Graph, sitemap). Ej: 'https://www.tuhancouture.com'
  siteUrl: null,

  /* ---------- Backend ----------
     'demo'     → catálogo, inventario y pedidos de prueba guardados en este navegador.
     'supabase' → base de datos real (ver README: supabase/migrations y supabase/functions). */
  backend: {
    mode: 'demo',
    supabaseUrl: null,      // https://xxxx.supabase.co
    supabaseAnonKey: null   // clave pública (publishable/anon)
  },

  /* ---------- Pagos (Wompi, Bancolombia) ----------
     La llave pública va aquí; la llave de integridad y la de eventos
     SOLO en los secretos de la Edge Function `wompi` (nunca en el navegador). */
  payments: {
    provider: 'wompi',
    wompiPublicKey: null,   // pub_prod_... o pub_test_...
    // Medios que se muestran en el footer y el checkout (los habilita Wompi en tu cuenta)
    methods: ['Tarjeta crédito', 'Tarjeta débito', 'PSE', 'Nequi', 'Botón Bancolombia', 'Bancolombia QR', 'Efectivo en corresponsales']
  },

  /* ---------- Envíos (AJUSTAR: valores de ejemplo) ---------- */
  shipping: {
    nationalRate: 15000,          // costo de envío nacional (COP)
    freeShippingFrom: 250000,     // envío gratis desde este subtotal (null = nunca)
    storePickup: true,            // permitir "recoger en tienda"
    estimatedDays: '2 a 5 días hábiles'
  },

  inventory: {
    lowStockThreshold: 3          // "Últimas unidades" cuando quedan esta cantidad o menos
  },

  /* ---------- Contacto ---------- */
  contact: {
    // Número publicado en el Instagram de la marca. Confirmar que es el de WhatsApp.
    whatsapp: '573116733231',
    phone: '311 673 3231',
    email: null,                  // PENDIENTE
    whatsappMessage: 'Hola TUHAN COUTURE, quiero información sobre sus jeans.'
  },

  social: {
    instagram: 'https://www.instagram.com/tuhan__couture/',
    facebook: null,               // PENDIENTE: enlace oficial de Facebook
    tiktok: 'https://www.tiktok.com/@tuhan_couture'
  },

  /* ---------- Tienda física ---------- */
  store: {
    address: 'Centro Comercial Estación Niquía, local 107',
    city: 'Bello, Antioquia',     // confirmar
    hours: null,                  // PENDIENTE. Ej: ['Lunes a sábado: 10:00 a. m. – 8:00 p. m.', 'Domingos y festivos: 11:00 a. m. – 7:00 p. m.']
    mapsUrl: null                 // opcional: enlace exacto de Google Maps; si es null se busca por dirección
  },

  /* ---------- Guía de tallas (AJUSTAR a los moldes de la marca) ---------- */
  sizeGuide: {
    note: 'Medidas de referencia en centímetros. Verifica con tu prenda favorita o escríbenos por WhatsApp.',
    columns: ['Talla', 'Cintura', 'Cadera', 'Tiro alto'],
    rows: [
      ['4', '62 – 64', '88 – 90', '27'],
      ['6', '66 – 68', '92 – 94', '28'],
      ['8', '70 – 72', '96 – 98', '29'],
      ['10', '74 – 76', '100 – 102', '30'],
      ['12', '78 – 80', '104 – 106', '31'],
      ['14', '82 – 84', '108 – 110', '32'],
      ['16', '86 – 88', '112 – 114', '33']
    ]
  },

  // Última actualización de las políticas (se muestra en las páginas legales)
  legalUpdatedAt: null
};

/** Enlace de WhatsApp con mensaje (o null si no hay número configurado). */
export function whatsappLink(message) {
  const n = CONFIG.contact.whatsapp;
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(message || CONFIG.contact.whatsappMessage)}` : null;
}

/** Enlace "Cómo llegar" en Google Maps. */
export function mapsLink() {
  if (CONFIG.store.mapsUrl) return CONFIG.store.mapsUrl;
  const q = [CONFIG.store.address, CONFIG.store.city].filter(Boolean).join(', ');
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}
