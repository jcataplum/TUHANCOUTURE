// =========================================================
// Edge Function `wompi` — pagos de TUHAN COUTURE con Wompi (Bancolombia)
//
// Rutas (POST):
//   { action: 'checkout', number, token, redirectUrl }  → URL firmada del Web Checkout
//   { action: 'verify', id }                            → consulta la transacción en Wompi y actualiza el pedido
//   Evento de Wompi (webhook, `transaction.updated`)    → valida la firma y actualiza el pedido
//
// Secretos (supabase secrets set ...):
//   WOMPI_PUBLIC_KEY        pub_prod_... | pub_test_...
//   WOMPI_INTEGRITY_SECRET  prod_integrity_... | test_integrity_...
//   WOMPI_EVENTS_SECRET     prod_events_... | test_events_...
//   ALLOWED_ORIGINS         https://www.tudominio.com,https://tuusuario.github.io
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase.
//
// Desplegar sin verificación JWT (Wompi no envía JWT al webhook):
//   supabase functions deploy wompi --no-verify-jwt
// =========================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const PUBLIC_KEY = Deno.env.get('WOMPI_PUBLIC_KEY') ?? '';
const INTEGRITY_SECRET = Deno.env.get('WOMPI_INTEGRITY_SECRET') ?? '';
const EVENTS_SECRET = Deno.env.get('WOMPI_EVENTS_SECRET') ?? '';
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const WOMPI_API = PUBLIC_KEY.startsWith('pub_prod_') ? 'https://production.wompi.co/v1' : 'https://sandbox.wompi.co/v1';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : (ALLOWED_ORIGINS[0] ?? ''),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } });
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Comparación en tiempo constante */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function pick(obj: unknown, path: string): unknown {
  return path.split('.').reduce((o: any, k) => (o == null ? undefined : o[k]), obj);
}

/** Aplica al pedido el estado de una transacción que ya fue verificada con Wompi */
async function applyTransaction(tx: any) {
  const { data, error } = await db.rpc('payment_update', {
    p_reference: tx.reference,
    p_transaction_id: tx.id,
    p_status: tx.status,
    p_amount_in_cents: tx.amount_in_cents,
    p_currency: tx.currency,
    p_method: tx.payment_method_type ?? null,
  });
  if (error) throw new Error(error.message);
  return data;
}

async function checkout(req: Request, body: any) {
  if (!PUBLIC_KEY || !INTEGRITY_SECRET) return json(req, { error: 'La pasarela de pagos no está configurada.' }, 500);

  // Solo se permite volver a páginas del propio sitio (evita redirecciones abiertas)
  let redirect: URL;
  try { redirect = new URL(String(body.redirectUrl)); } catch { return json(req, { error: 'URL de retorno no válida.' }, 400); }
  if (!ALLOWED_ORIGINS.includes(redirect.origin)) return json(req, { error: 'URL de retorno no permitida.' }, 400);

  const { data: order, error } = await db.rpc('payment_checkout_data', { p_number: body.number, p_token: body.token });
  if (error) return json(req, { error: error.message }, 400);

  const expiration = new Date(order.expiresAt).toISOString();
  const signature = await sha256Hex(`${order.reference}${order.amountInCents}COP${expiration}${INTEGRITY_SECRET}`);
  const c = order.customer ?? {};
  const params = new URLSearchParams({
    'public-key': PUBLIC_KEY,
    'currency': 'COP',
    'amount-in-cents': String(order.amountInCents),
    'reference': order.reference,
    'signature:integrity': signature,
    'expiration-time': expiration,
    'redirect-url': redirect.href,
    'customer-data:email': c.email ?? '',
    'customer-data:full-name': c.name ?? '',
    'customer-data:phone-number': c.phone ?? '',
    'customer-data:phone-number-prefix': '+57',
    'customer-data:legal-id': c.docNumber ?? '',
    'customer-data:legal-id-type': c.docType ?? 'CC',
  });
  return json(req, { url: `https://checkout.wompi.co/p/?${params}` });
}

async function verify(req: Request, body: any) {
  const id = String(body.id ?? '');
  if (!/^[\w-]{5,64}$/.test(id)) return json(req, { error: 'Transacción no válida.' }, 400);
  const res = await fetch(`${WOMPI_API}/transactions/${encodeURIComponent(id)}`);
  if (!res.ok) return json(req, { error: 'No se pudo consultar la transacción.' }, 502);
  const { data: tx } = await res.json();
  const result = await applyTransaction(tx);
  return json(req, { status: result?.status ?? tx.status });
}

async function webhook(req: Request, event: any) {
  if (!EVENTS_SECRET) return json(req, { error: 'Webhook sin configurar.' }, 500);
  // checksum = SHA256(valores de signature.properties + timestamp + secreto de eventos)
  const props: string[] = event?.signature?.properties ?? [];
  const concatenated = props.map((p) => String(pick(event.data, p) ?? '')).join('') + String(event.timestamp) + EVENTS_SECRET;
  const expected = await sha256Hex(concatenated);
  if (!safeEqual(expected.toLowerCase(), String(event?.signature?.checksum ?? '').toLowerCase())) {
    return json(req, { error: 'Firma no válida.' }, 401);
  }
  if (event.event === 'transaction.updated' && event.data?.transaction) {
    await applyTransaction(event.data.transaction);
  }
  return json(req, { ok: true });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return json(req, { error: 'Método no permitido.' }, 405);
  try {
    const body = await req.json();
    if (body?.event && body?.signature) return await webhook(req, body);
    if (body?.action === 'checkout') return await checkout(req, body);
    if (body?.action === 'verify') return await verify(req, body);
    return json(req, { error: 'Acción no válida.' }, 400);
  } catch (e) {
    console.error(e);
    return json(req, { error: 'Error procesando el pago.' }, 500);
  }
});
