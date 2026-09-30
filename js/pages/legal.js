/* =========================================================
   Páginas legales — PLANTILLAS que la marca debe revisar con
   un asesor legal antes de publicar la tienda. Los datos se
   toman de config.js; lo pendiente aparece resaltado.
   ========================================================= */
import { CONFIG, whatsappLink } from '../config.js';
import { initLayout } from '../core/layout.js';
import { $, esc, cop, setMeta } from '../core/util.js';

initLayout();

const c = CONFIG.contact, st = CONFIG.store;
const val = (v, label) => (v ? esc(v) : `<mark>[${esc(label)}]</mark>`);
const brand = esc(CONFIG.brand.name);
const channels = [
  c.whatsapp ? `WhatsApp ${esc(c.phone || c.whatsapp)}` : null,
  c.email ? `correo ${esc(c.email)}` : `correo <mark>[correo de atención]</mark>`
].filter(Boolean).join(' o ');
const updated = CONFIG.legalUpdatedAt ? esc(CONFIG.legalUpdatedAt) : '<mark>[fecha]</mark>';
const draft = `<div class="draft"><strong>Borrador para revisión.</strong> Este texto es una plantilla basada en la normativa colombiana de comercio electrónico y protección de datos. Complétalo y valídalo con un asesor legal antes de publicar la tienda. Los campos resaltados están pendientes.</div>`;

const PAGES = {
  'privacidad.html': {
    title: 'Política de privacidad y tratamiento de datos personales',
    body: `
      <p>En cumplimiento de la Ley 1581 de 2012 y el Decreto 1377 de 2013, ${brand} informa cómo trata los datos personales que recoge en esta tienda online.</p>
      <h2>Responsable del tratamiento</h2>
      <p>${brand} · Razón social: ${val(null, 'razón social')} · NIT: ${val(null, 'NIT')} · Dirección: ${esc(st.address)}, ${val(st.city, 'ciudad')} · Contacto: ${channels}.</p>
      <h2>Datos que recogemos</h2>
      <ul><li>Nombre, documento de identidad, correo electrónico y celular.</li>
        <li>Dirección de entrega.</li>
        <li>Información del pedido. Los datos de tu tarjeta o cuenta bancaria los procesa directamente la pasarela de pagos; ${brand} no los recibe ni los almacena.</li></ul>
      <h2>Finalidades</h2>
      <ul><li>Procesar, facturar, enviar y hacer seguimiento a tus pedidos.</li>
        <li>Atender solicitudes, cambios, devoluciones y garantías.</li>
        <li>Cumplir obligaciones legales, contables y tributarias.</li>
        <li>Enviarte novedades y promociones, solo si lo autorizas.</li></ul>
      <h2>Tus derechos</h2>
      <p>Puedes conocer, actualizar, rectificar y suprimir tus datos, revocar la autorización y presentar quejas ante la Superintendencia de Industria y Comercio. Escríbenos por ${channels}; responderemos en los plazos de ley.</p>
      <h2>Seguridad</h2>
      <p>Aplicamos medidas técnicas y administrativas para proteger tu información. Los pagos se realizan en un entorno cifrado de la pasarela de pagos.</p>
      <h2>Cookies y almacenamiento local</h2>
      <p>La tienda guarda en tu navegador el contenido del carrito y los pedidos consultados, solo para que funcione la compra.</p>
      <p class="muted">Última actualización: ${updated}.</p>`
  },
  'terminos.html': {
    title: 'Términos y condiciones',
    body: `
      <p>Estos términos regulan las compras en la tienda online de ${brand}, conforme a la Ley 1480 de 2011 (Estatuto del Consumidor) y la Ley 527 de 1999.</p>
      <h2>Precios y disponibilidad</h2>
      <p>Los precios están en pesos colombianos (COP) e incluyen IVA cuando aplica. El inventario se muestra por talla y se aparta al iniciar el pago; si el pago no se completa, se libera. Un pedido se confirma solo cuando la pasarela de pagos aprueba la transacción.</p>
      <h2>Medios de pago</h2>
      <p>Pagos procesados por ${CONFIG.payments.provider === 'wompi' ? 'Wompi (Bancolombia)' : esc(CONFIG.payments.provider)}: ${CONFIG.payments.methods.map(esc).join(', ')}.</p>
      <h2>Envíos</h2>
      <p>Enviamos a todo Colombia. Tiempo estimado: ${esc(CONFIG.shipping.estimatedDays)} después de confirmado el pago. Costo de envío: ${cop(CONFIG.shipping.nationalRate)}${CONFIG.shipping.freeShippingFrom != null ? `, gratis en compras desde ${cop(CONFIG.shipping.freeShippingFrom)}` : ''}${CONFIG.shipping.storePickup ? '. También puedes recoger gratis en nuestra tienda física' : ''}. <mark>[confirmar transportadora y tiempos]</mark></p>
      <h2>Derecho de retracto</h2>
      <p>Por tratarse de una venta a distancia, puedes ejercer el derecho de retracto dentro de los cinco (5) días hábiles siguientes a la entrega, con la prenda sin uso, con etiquetas y en su empaque. Los costos de devolución corren por cuenta del comprador, según la ley.</p>
      <h2>Reversión del pago</h2>
      <p>Puedes solicitar la reversión del pago en los casos del artículo 51 de la Ley 1480 de 2011, dentro de los cinco (5) días hábiles siguientes a que conozcas la situación.</p>
      <h2>Garantía</h2>
      <p>Nuestras prendas cuentan con garantía legal por defectos de fabricación. Consulta la <a href="cambios-devoluciones.html">política de cambios y devoluciones</a>.</p>
      <h2>Contacto</h2>
      <p>${channels} · Tienda física: ${esc(st.address)}, ${val(st.city, 'ciudad')}.</p>
      <p class="muted">Última actualización: ${updated}.</p>`
  },
  'cambios-devoluciones.html': {
    title: 'Cambios y devoluciones',
    body: `
      <p>Queremos que ames tus jeans ${brand}. Si necesitas un cambio, estas son las condiciones:</p>
      <h2>Cambios por talla o referencia</h2>
      <ul><li>Plazo: <mark>[número]</mark> días calendario desde que recibes tu pedido.</li>
        <li>La prenda debe estar sin uso, sin lavar, con etiquetas y en su empaque original.</li>
        <li>Sujeto a disponibilidad de inventario. Si la talla no está disponible, puedes elegir otra referencia.</li>
        <li>Costo del envío del cambio: <mark>[quién lo asume]</mark>.</li></ul>
      <h2>Garantía por defectos</h2>
      <p>Si la prenda presenta un defecto de fabricación, escríbenos con fotos y el número de pedido. Te ofreceremos reparación, cambio o devolución del dinero según la ley.</p>
      <h2>Derecho de retracto</h2>
      <p>Tienes cinco (5) días hábiles desde la entrega para retractarte de la compra online (Ley 1480 de 2011, art. 47). Devolvemos el dinero en máximo treinta (30) días calendario.</p>
      <h2>Prendas sin cambio</h2>
      <p><mark>[Ej.: prendas en promoción final, bodies o prendas íntimas, si aplica]</mark></p>
      <h2>¿Cómo solicitarlo?</h2>
      <p>Escríbenos por ${channels} con tu número de pedido, o visítanos en ${esc(st.address)}, ${val(st.city, 'ciudad')}.</p>
      ${whatsappLink() ? `<p><a class="btn btn-dark" href="${esc(whatsappLink('Hola TUHAN COUTURE, quiero solicitar un cambio de mi pedido.'))}" target="_blank" rel="noopener">Solicitar cambio por WhatsApp</a></p>` : ''}
      <p class="muted">Última actualización: ${updated}.</p>`
  }
};

const page = PAGES[location.pathname.split('/').pop()] || PAGES['terminos.html'];
setMeta({ title: `${page.title} · ${CONFIG.brand.name}` });
$('#legalRoot').innerHTML = `
  <div class="page-head"><nav class="breadcrumbs" aria-label="Ruta"><a href="index.html">Inicio</a> / ${esc(page.title)}</nav>
  <h1>${esc(page.title)}</h1></div>
  ${draft}
  ${page.body}`;
