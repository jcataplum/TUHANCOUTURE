# TUHAN COUTURE · Tienda online

Tienda online de jeans de la marca colombiana **TUHAN COUTURE**. Está hecha con HTML, CSS y JavaScript (módulos ES), sin compilación, y usa Supabase como base de datos y Wompi (Bancolombia) como pasarela de pagos.

La identidad visual sigue el Instagram [@tuhan__couture](https://www.instagram.com/tuhan__couture/): negro y dorado del logo, títulos en serif elegante y acento en letra cursiva ("Nueva Colección").

## Ver la tienda

```
py -m http.server 5520
```

→ http://localhost:5520 (tienda) · http://localhost:5520/admin.html (panel)

Por defecto funciona en **modo demostración**: el catálogo de ejemplo, el inventario y los pedidos se guardan en el navegador, y el pago es una pasarela de prueba en la que se elige aprobar o rechazar. No se cobra nada.

## Páginas

| Página | Contenido |
|---|---|
| `index.html` | Banner principal, destacados, nueva colección, tienda física |
| `catalogo.html` | Catálogo con filtros (categoría, colección, talla, color, disponibilidad), orden y guía de tallas |
| `producto.html?p=slug` | Galería, precio, referencia, colores, tallas con disponibilidad, cantidad, guía de tallas, compra por WhatsApp |
| `carrito.html` | Productos, talla, cantidad, código de descuento, subtotal, envío y total |
| `checkout.html` | Datos, entrega (domicilio o recoger en tienda), aceptación de términos y datos, pago |
| `pedido.html` | Estado del pedido (confirmado solo con el pago verificado) |
| `cuenta.html` | Consulta de pedidos por número y correo |
| `privacidad.html`, `terminos.html`, `cambios-devoluciones.html` | Plantillas legales (**revisar con un asesor antes de publicar**) |
| `admin.html` | Panel: resumen, productos, fotos, inventario, pedidos, clientes y promociones |

## Datos que debe completar la marca

Todo está en [`js/config.js`](js/config.js). Lo que dice `null` se oculta en la tienda (en modo demostración aparece "por configurar"):

- **Facebook**: enlace oficial.
- **Correo** de atención.
- **Horario** de la tienda física.
- **Ciudad**: se dejó "Bello, Antioquia" (C.C. Estación Niquía); confirmar.
- **WhatsApp**: se usó el número publicado en Instagram (311 673 3231); confirmar.
- **Envíos**: tarifa (15.000) y envío gratis desde 250.000 son **valores de ejemplo**.
- **Guía de tallas**: las medidas son de referencia; ajustarlas a los moldes de la marca.
- **Dominio** (`siteUrl`) para SEO.
- Textos legales: razón social, NIT, plazos de cambio, etc. (resaltados en amarillo).
- **Fotografías**: los productos de ejemplo usan una silueta provisional; las fotos reales se suben desde el panel (Productos → Editar → Subir fotos).

## Inventario

- El stock se lleva por **producto + color + talla** (SKU).
- Estados: **Disponible**, **Últimas unidades** (≤ `lowStockThreshold`, 3 por defecto) y **Agotado**.
- Las tallas agotadas no se pueden seleccionar y el carrito no permite superar las unidades disponibles.
- Al crear el pedido el inventario se **aparta** por 30 minutos. Si el pago se rechaza o vence, vuelve al inventario automáticamente.

## Pasar a producción

### 1. Supabase (base de datos)

Proyecto creado: **TUHAN COUTURE** (`vfyqwgrywcmxddutwhur`, región us-east-1, plan gratuito) con la migración [`supabase/migrations/20260930000000_tuhan_store.sql`](supabase/migrations/20260930000000_tuhan_store.sql) ya aplicada. En el plan gratuito el proyecto se pausa tras 7 días sin actividad; se reactiva desde el panel de Supabase.

1. ~~Crear un proyecto en Supabase~~ ✔
2. ~~Ejecutar la migración~~ ✔
3. ~~Cuenta de administración~~ ✔ (jenifer.duque@gmail.com). Para agregar otra: *Authentication → Users → Add user* y darle permisos:
   ```sql
   insert into public.admins (user_id) select id from auth.users where email = 'correo-admin@...';
   ```
4. En *Authentication → Settings*, **desactivar el registro público** ("Allow new users to sign up"): solo el equipo usa cuentas.
5. Ajustar envío en la tabla `store_settings` para que coincida con `js/config.js`.
6. En `js/config.js` ya están `supabaseUrl` y `supabaseAnonKey`. El **panel** ya usa Supabase (`backend.adminMode = 'supabase'`); la **tienda** sigue en demostración hasta cambiar `backend.mode` a `'supabase'`, cuando haya productos y pagos configurados.
7. Cargar los productos reales desde `admin.html`.

### 2. Wompi (pagos: tarjetas, PSE, Nequi, Botón Bancolombia, etc.)

1. Crear la cuenta de comercio en [comercios.wompi.co](https://comercios.wompi.co) y obtener las llaves (primero las de **pruebas**).
2. Guardar los secretos y desplegar la función:
   ```
   supabase secrets set WOMPI_PUBLIC_KEY=pub_test_... WOMPI_INTEGRITY_SECRET=test_integrity_... WOMPI_EVENTS_SECRET=test_events_... ALLOWED_ORIGINS=https://tudominio.com
   supabase functions deploy wompi --no-verify-jwt
   ```
3. En el panel de Wompi, configurar la **URL de eventos**: `https://<proyecto>.supabase.co/functions/v1/wompi`.
4. Poner la llave pública en `js/config.js` (`payments.wompiPublicKey`).
5. Probar con las tarjetas y datos de prueba de Wompi; luego cambiar a las llaves de producción.

**Cómo se valida el pago:** la firma de integridad se calcula en el servidor (el secreto nunca llega al navegador). El pedido solo pasa a **Pagado** cuando la función consulta la transacción directamente a Wompi, o cuando recibe un evento con firma válida, **y** el monto coincide con el total calculado en la base de datos. Si no coincide, el pedido queda marcado para revisión.

### 3. Publicar

Es un sitio estático: sirve en GitHub Pages, Netlify, Vercel, Cloudflare Pages o cualquier hosting con HTTPS. Después de publicar, completar `siteUrl` y la línea `Sitemap` de `robots.txt`.

## Seguridad

- Las tablas no son accesibles desde el navegador: todo pasa por funciones RPC que validan datos y permisos.
- Precios, descuentos, envío e inventario se recalculan en el servidor al crear el pedido.
- El panel exige una cuenta registrada en `admins`; las fotos solo las pueden subir administradores.
- Política de seguridad de contenido (CSP) en cada página, sin scripts en línea.
- La consulta de pedidos usa un token aleatorio en el enlace, no datos personales.

## Estructura

```
index.html, catalogo.html, producto.html, ...   Páginas
css/styles.css, css/admin.css                     Estilos (mobile-first)
js/config.js                                      Datos configurables de la marca
js/core/api.js                                    Capa de datos: modo demo o Supabase
js/core/cart.js, pricing.js, layout.js, ...       Carrito, precios, encabezado/pie, utilidades
js/core/demo-data.js                              Catálogo de ejemplo (modo demo)
js/pages/*.js                                     Lógica de cada página
supabase/migrations/                              Esquema, reglas y permisos
supabase/functions/wompi/                         Edge Function de pagos
```
