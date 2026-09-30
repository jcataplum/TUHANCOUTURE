-- =========================================================
-- TUHAN COUTURE — esquema de la tienda en Supabase
--
-- Modelo de seguridad: las tablas NO se exponen al navegador
-- (RLS activo sin políticas y sin GRANT a anon/authenticated).
-- Todo pasa por funciones RPC `security definer` que:
--   · recalculan precios, descuentos y envío en el servidor
--   · apartan inventario por talla de forma atómica al crear el pedido
--   · solo marcan un pedido como pagado con datos verificados de Wompi
--     (la Edge Function `wompi` llama a `payment_update` con la service_role)
-- =========================================================

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

/* ---------------------------------------------------------
   Tablas
   --------------------------------------------------------- */
-- Administradores del panel (se agregan a mano: ver README)
create table public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Una sola fila: reglas de envío y reserva. Deben coincidir con js/config.js (lo que se muestra).
create table public.store_settings (
  id                  boolean primary key default true check (id),
  shipping_rate       int not null default 15000 check (shipping_rate >= 0),
  free_shipping_from  int check (free_shipping_from is null or free_shipping_from >= 0),
  store_pickup        boolean not null default true,
  reservation_minutes int not null default 30 check (reservation_minutes between 10 and 180)
);
insert into public.store_settings (id, free_shipping_from) values (true, 250000);

create table public.products (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  ref              text not null unique check (ref ~ '^[A-Z0-9-]{2,30}$'),
  name             text not null check (char_length(name) between 2 and 120),
  category         text,
  collection       text,
  price            int not null check (price > 0),
  compare_at_price int check (compare_at_price is null or compare_at_price > 0),
  description      text not null default '',
  composition      text not null default '',
  fit              text not null default '',
  colors           jsonb not null default '[]' check (jsonb_typeof(colors) = 'array'),  -- [{name, hex}]
  sizes            text[] not null default '{}',
  images           text[] not null default '{}',
  published        boolean not null default false,
  featured         boolean not null default false,
  is_new           boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Inventario por producto, color y talla
create table public.product_variants (
  sku        text primary key check (sku ~ '^[A-Z0-9-]{3,60}$'),
  product_id uuid not null references public.products (id) on delete cascade,
  color      text not null,
  size       text not null,
  stock      int not null default 0 check (stock >= 0),
  unique (product_id, color, size)
);
create index product_variants_product_idx on public.product_variants (product_id);

create table public.promotions (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique check (code ~ '^[A-Z0-9_-]{3,30}$'),
  description  text not null default '',
  type         text not null check (type in ('percent', 'fixed')),
  value        int not null check (value > 0),
  min_subtotal int not null default 0 check (min_subtotal >= 0),
  starts_at    timestamptz,
  ends_at      timestamptz,
  max_uses     int check (max_uses is null or max_uses > 0),
  uses         int not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  check (type <> 'percent' or value <= 90)
);

create sequence public.order_number_seq;

create table public.orders (
  id           uuid primary key default gen_random_uuid(),
  number       text not null unique default 'TC-' || lpad(nextval('public.order_number_seq')::text, 6, '0'),
  -- Token de consulta del pedido (va en el enlace de la página del pedido, no es un dato personal)
  token        text not null default encode(extensions.gen_random_bytes(16), 'hex'),
  status       text not null default 'pending_payment' check (status in
                 ('pending_payment', 'paid', 'preparing', 'shipped', 'ready_pickup', 'delivered', 'declined', 'expired', 'cancelled')),
  customer     jsonb not null,   -- {name, docType, docNumber, email, phone}
  delivery     jsonb not null,   -- {method, department, city, address, details}
  notes        text not null default '',
  subtotal     int not null,
  discount     int not null default 0,
  shipping     int not null default 0,
  total        int not null check (total > 0),
  promo_code   text,
  payment      jsonb not null default '{}',  -- {provider, status, reference, transactionId, method}
  needs_review boolean not null default false,  -- pago aprobado sin inventario disponible: revisar/reembolsar
  expires_at   timestamptz not null,
  paid_at      timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index orders_status_idx on public.orders (status, expires_at);
create index orders_email_idx on public.orders (lower(customer ->> 'email'));

create table public.order_items (
  id         bigint generated always as identity primary key,
  order_id   uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  sku        text not null,
  name       text not null,
  ref        text not null,
  color      text not null,
  size       text not null,
  qty        int not null check (qty > 0),
  unit_price int not null check (unit_price > 0),
  image      text
);
create index order_items_order_idx on public.order_items (order_id);

alter table public.admins           enable row level security;
alter table public.store_settings   enable row level security;
alter table public.products         enable row level security;
alter table public.product_variants enable row level security;
alter table public.promotions       enable row level security;
alter table public.orders           enable row level security;
alter table public.order_items      enable row level security;

revoke all on public.admins, public.store_settings, public.products, public.product_variants,
              public.promotions, public.orders, public.order_items from anon, authenticated;
revoke all on sequence public.order_number_seq from anon, authenticated;

/* ---------------------------------------------------------
   Utilidades privadas
   --------------------------------------------------------- */
create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create function private.require_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_admin() then
    raise exception 'Solo los administradores pueden realizar esta acción.' using errcode = '42501';
  end if;
end $$;

create function private.product_json(p public.products) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'slug', p.slug, 'ref', p.ref, 'name', p.name, 'category', p.category, 'collection', p.collection,
    'price', p.price, 'compareAtPrice', p.compare_at_price, 'description', p.description,
    'composition', p.composition, 'fit', p.fit, 'colors', p.colors, 'sizes', to_jsonb(p.sizes),
    'images', to_jsonb(p.images), 'published', p.published, 'featured', p.featured, 'isNew', p.is_new,
    'createdAt', p.created_at,
    'variants', coalesce((select jsonb_agg(jsonb_build_object('sku', v.sku, 'color', v.color, 'size', v.size, 'stock', v.stock) order by v.color, v.size)
                          from public.product_variants v where v.product_id = p.id), '[]'));
$$;

create function private.promo_json(pr public.promotions) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', pr.id, 'code', pr.code, 'description', pr.description, 'type', pr.type,
    'value', pr.value, 'minSubtotal', pr.min_subtotal, 'startsAt', pr.starts_at, 'endsAt', pr.ends_at,
    'maxUses', pr.max_uses, 'uses', pr.uses, 'active', pr.active);
$$;

-- Motivo por el que la promoción no aplica (null = aplica)
create function private.promo_problem(pr public.promotions, p_subtotal int) returns text
language sql stable set search_path = '' as $$
  select case
    when pr.id is null or not pr.active then 'El código no existe o no está activo.'
    when pr.starts_at is not null and pr.starts_at > now() then 'El código aún no está vigente.'
    when pr.ends_at is not null and pr.ends_at < now() then 'El código ya venció.'
    when pr.max_uses is not null and pr.uses >= pr.max_uses then 'El código ya alcanzó su límite de usos.'
    when p_subtotal < pr.min_subtotal then 'El código aplica para compras desde $' || to_char(pr.min_subtotal, 'FM999G999G999') || '.'
    else null
  end;
$$;

create function private.order_json(o public.orders, p_admin boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', o.id, 'number', o.number, 'token', o.token, 'status', o.status,
    'customer', case when p_admin then o.customer else jsonb_build_object('name', o.customer ->> 'name', 'email', o.customer ->> 'email') end,
    'delivery', o.delivery, 'notes', case when p_admin then o.notes else '' end,
    'subtotal', o.subtotal, 'discount', o.discount, 'shipping', o.shipping, 'total', o.total,
    'promoCode', o.promo_code,
    'payment', case when p_admin then o.payment else jsonb_build_object('status', o.payment ->> 'status', 'method', o.payment ->> 'method') end,
    'needsReview', o.needs_review,
    'createdAt', o.created_at, 'expiresAt', o.expires_at, 'paidAt', o.paid_at,
    'items', coalesce((select jsonb_agg(jsonb_build_object('productId', i.product_id, 'sku', i.sku, 'name', i.name, 'ref', i.ref,
                        'color', i.color, 'size', i.size, 'qty', i.qty, 'unitPrice', i.unit_price, 'image', i.image) order by i.id)
                       from public.order_items i where i.order_id = o.id), '[]'));
$$;

-- Devuelve al inventario las prendas de un pedido
create function private.restock(p_order_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.product_variants v set stock = v.stock + i.qty
  from public.order_items i
  where i.order_id = p_order_id and i.sku = v.sku;
$$;

-- Vence los pedidos sin pago y libera su inventario
create function private.release_expired() returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_n  int := 0;
begin
  for v_id in
    select id from public.orders
    where status = 'pending_payment' and expires_at < now()
    for update skip locked
  loop
    update public.orders set status = 'expired', updated_at = now() where id = v_id;
    perform private.restock(v_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

/* ---------------------------------------------------------
   RPC: tienda (público)
   --------------------------------------------------------- */
create function public.store_products() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(private.product_json(p) order by p.created_at desc), '[]')
  from public.products p where p.published;
$$;

create function public.store_product(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.product_json(p) from public.products p where p.published and (p.slug = p_slug or p.id::text = p_slug);
$$;

create function public.store_check_promo(p_code text, p_subtotal int) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_promo   public.promotions;
  v_problem text;
begin
  select * into v_promo from public.promotions where code = upper(btrim(coalesce(p_code, '')));
  v_problem := private.promo_problem(v_promo, coalesce(p_subtotal, 0));
  if v_problem is not null then raise exception '%', v_problem; end if;
  -- Al público solo se le devuelve lo necesario para calcular el descuento
  return jsonb_build_object('code', v_promo.code, 'type', v_promo.type, 'value', v_promo.value,
    'minSubtotal', v_promo.min_subtotal, 'active', true, 'uses', 0);
end $$;

-- Crea el pedido apartando inventario. Nunca confía en precios del navegador.
-- p_order: { customer:{name,docType,docNumber,email,phone}, delivery:{method,department,city,address,details},
--            items:[{sku, qty}], promoCode, notes }
create function public.store_create_order(p_order jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_settings public.store_settings;
  c          jsonb := coalesce(p_order -> 'customer', '{}');
  d          jsonb := coalesce(p_order -> 'delivery', '{}');
  v_method   text;
  v_items    jsonb;
  v_it       record;
  v_var      public.product_variants;
  v_prod     public.products;
  v_subtotal int := 0;
  v_discount int := 0;
  v_shipping int := 0;
  v_promo    public.promotions;
  v_problem  text;
  v_order    public.orders;
begin
  perform private.release_expired();
  select * into v_settings from public.store_settings where id;

  -- Datos del cliente
  if char_length(btrim(coalesce(c ->> 'name', ''))) not between 5 and 120 then raise exception 'Escribe tu nombre completo.'; end if;
  if coalesce(c ->> 'docType', '') not in ('CC', 'CE', 'PP', 'NIT') then raise exception 'Tipo de documento no válido.'; end if;
  if coalesce(c ->> 'docNumber', '') !~ '^[0-9A-Za-z-]{5,15}$' then raise exception 'Número de documento no válido.'; end if;
  if coalesce(c ->> 'email', '') !~* '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' or char_length(c ->> 'email') > 120 then raise exception 'Correo no válido.'; end if;
  if coalesce(c ->> 'phone', '') !~ '^3[0-9]{9}$' then raise exception 'Celular no válido.'; end if;

  -- Entrega
  v_method := case when d ->> 'method' = 'pickup' and v_settings.store_pickup then 'pickup' else 'shipping' end;
  if v_method = 'shipping' and (
       char_length(btrim(coalesce(d ->> 'department', ''))) < 3 or
       char_length(btrim(coalesce(d ->> 'city', ''))) < 3 or
       char_length(btrim(coalesce(d ->> 'address', ''))) < 6) then
    raise exception 'Completa la dirección de entrega.';
  end if;

  -- Productos: agrupa por SKU y bloquea las filas en orden (evita bloqueos cruzados)
  select coalesce(jsonb_agg(jsonb_build_object('sku', sku, 'qty', qty) order by sku), '[]') into v_items
  from (select x ->> 'sku' as sku, sum((x ->> 'qty')::int) as qty
        from jsonb_array_elements(coalesce(p_order -> 'items', '[]')) x
        where coalesce(x ->> 'sku', '') <> '' group by 1) t;
  if jsonb_array_length(v_items) = 0 then raise exception 'Tu carrito está vacío.'; end if;
  if jsonb_array_length(v_items) > 50 then raise exception 'Demasiados productos en un pedido.'; end if;

  for v_it in select x ->> 'sku' as sku, (x ->> 'qty')::int as qty from jsonb_array_elements(v_items) x loop
    if v_it.qty is null or v_it.qty < 1 or v_it.qty > 50 then raise exception 'Cantidad no válida.'; end if;
    select * into v_var from public.product_variants where sku = v_it.sku for update;
    select * into v_prod from public.products where id = v_var.product_id;
    if v_var.sku is null or v_prod.id is null or not v_prod.published then
      raise exception 'Uno de los productos ya no está disponible.';
    end if;
    if v_var.stock < v_it.qty then
      if v_var.stock = 0 then
        raise exception '% talla % (%) se agotó.', v_prod.name, v_var.size, v_var.color;
      end if;
      raise exception 'Solo quedan % unidad(es) de % talla % (%).', v_var.stock, v_prod.name, v_var.size, v_var.color;
    end if;
    v_subtotal := v_subtotal + v_prod.price * v_it.qty;
  end loop;

  -- Descuento
  if nullif(btrim(coalesce(p_order ->> 'promoCode', '')), '') is not null then
    select * into v_promo from public.promotions where code = upper(btrim(p_order ->> 'promoCode')) for update;
    v_problem := private.promo_problem(v_promo, v_subtotal);
    if v_problem is not null then raise exception '%', v_problem; end if;
    v_discount := least(v_subtotal, case when v_promo.type = 'percent' then round(v_subtotal * v_promo.value / 100.0)::int else v_promo.value end);
  end if;

  -- Envío
  if v_method = 'shipping' and not (v_settings.free_shipping_from is not null and v_subtotal - v_discount >= v_settings.free_shipping_from) then
    v_shipping := v_settings.shipping_rate;
  end if;

  insert into public.orders (customer, delivery, notes, subtotal, discount, shipping, total, promo_code, payment, expires_at)
  values (
    jsonb_build_object('name', btrim(c ->> 'name'), 'docType', c ->> 'docType', 'docNumber', c ->> 'docNumber',
                       'email', lower(btrim(c ->> 'email')), 'phone', c ->> 'phone'),
    case when v_method = 'pickup' then jsonb_build_object('method', 'pickup')
         else jsonb_build_object('method', 'shipping', 'department', left(btrim(d ->> 'department'), 60), 'city', left(btrim(d ->> 'city'), 80),
                                 'address', left(btrim(d ->> 'address'), 160), 'details', left(btrim(coalesce(d ->> 'details', '')), 160)) end,
    left(coalesce(p_order ->> 'notes', ''), 500),
    v_subtotal, v_discount, v_shipping, v_subtotal - v_discount + v_shipping,
    v_promo.code,
    jsonb_build_object('provider', 'wompi', 'status', 'PENDING'),
    now() + make_interval(mins => v_settings.reservation_minutes)
  ) returning * into v_order;

  update public.orders set payment = payment || jsonb_build_object('reference', v_order.number)
  where id = v_order.id returning * into v_order;

  -- Aparta el inventario y guarda las líneas con el precio cobrado
  for v_it in select x ->> 'sku' as sku, (x ->> 'qty')::int as qty from jsonb_array_elements(v_items) x loop
    update public.product_variants set stock = stock - v_it.qty where sku = v_it.sku returning * into v_var;
    insert into public.order_items (order_id, product_id, sku, name, ref, color, size, qty, unit_price, image)
    select v_order.id, p.id, v_var.sku, p.name, p.ref, v_var.color, v_var.size, v_it.qty, p.price, p.images[1]
    from public.products p where p.id = v_var.product_id;
  end loop;

  return private.order_json(v_order, false);
end $$;

create function public.store_get_order(p_number text, p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders;
begin
  perform private.release_expired();
  select * into v_order from public.orders where number = upper(btrim(p_number)) and token = p_token;
  if not found then return null; end if;
  return private.order_json(v_order, false);
end $$;

create function public.store_lookup_order(p_number text, p_email text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders
  where number = upper(btrim(p_number)) and lower(customer ->> 'email') = lower(btrim(p_email));
  if not found then return null; end if;
  return private.order_json(v_order, false);
end $$;

/* ---------------------------------------------------------
   RPC: pagos (solo la Edge Function con service_role)
   --------------------------------------------------------- */
-- Aplica el resultado VERIFICADO de una transacción de Wompi.
-- p_status: APPROVED | DECLINED | VOIDED | ERROR | PENDING
create function public.payment_update(p_reference text, p_transaction_id text, p_status text,
                                      p_amount_in_cents bigint, p_currency text, p_method text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders;
  v_short boolean;
begin
  select * into v_order from public.orders where number = p_reference for update;
  if not found then raise exception 'Pedido no encontrado: %', p_reference; end if;

  update public.orders set
    payment = payment || jsonb_build_object('status', p_status, 'transactionId', p_transaction_id, 'method', p_method),
    updated_at = now()
  where id = v_order.id;

  if p_status = 'APPROVED' then
    if v_order.status in ('paid', 'preparing', 'shipped', 'ready_pickup', 'delivered') then
      return jsonb_build_object('status', v_order.status);  -- notificación repetida
    end if;
    if p_currency <> 'COP' or p_amount_in_cents <> v_order.total::bigint * 100 then
      -- No se confirma: queda marcado para revisión manual (posible manipulación del monto)
      update public.orders set needs_review = true where id = v_order.id;
      return jsonb_build_object('status', v_order.status, 'review', 'amount_mismatch');
    end if;
    -- Pago tardío de un pedido vencido: intenta apartar de nuevo el inventario
    if v_order.status in ('expired', 'declined', 'cancelled') then
      select exists (
        select 1 from public.order_items i join public.product_variants v on v.sku = i.sku
        where i.order_id = v_order.id and v.stock < i.qty) into v_short;
      if v_short then
        update public.orders set needs_review = true where id = v_order.id;
      else
        update public.product_variants v set stock = v.stock - i.qty
        from public.order_items i where i.order_id = v_order.id and i.sku = v.sku;
      end if;
    end if;
    update public.orders set status = 'paid', paid_at = now() where id = v_order.id;
    if v_order.promo_code is not null then
      update public.promotions set uses = uses + 1 where code = v_order.promo_code;
    end if;
    return jsonb_build_object('status', 'paid');
  elsif p_status in ('DECLINED', 'VOIDED', 'ERROR') then
    if v_order.status = 'pending_payment' then
      update public.orders set status = 'declined' where id = v_order.id;
      perform private.restock(v_order.id);
    end if;
    return jsonb_build_object('status', 'declined');
  end if;
  return jsonb_build_object('status', v_order.status);
end $$;

-- Datos que la Edge Function necesita para abrir el checkout de Wompi
create function public.payment_checkout_data(p_number text, p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders;
begin
  perform private.release_expired();
  select * into v_order from public.orders where number = upper(btrim(p_number)) and token = p_token;
  if not found then raise exception 'Pedido no encontrado.'; end if;
  if v_order.status <> 'pending_payment' then raise exception 'Este pedido ya no está pendiente de pago.'; end if;
  return jsonb_build_object('reference', v_order.number, 'amountInCents', v_order.total::bigint * 100,
    'expiresAt', v_order.expires_at, 'customer', v_order.customer);
end $$;

/* ---------------------------------------------------------
   RPC: administración
   --------------------------------------------------------- */
create function public.admin_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and private.is_admin();
$$;

create function public.admin_products() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return (select coalesce(jsonb_agg(private.product_json(p) order by p.created_at desc), '[]') from public.products p);
end $$;

-- Crea o actualiza un producto con sus variantes (reemplaza las combinaciones color × talla).
create function public.admin_save_product(p_product jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id   uuid := nullif(p_product ->> 'id', '')::uuid;
  v_prod public.products;
  v_skus text[];
begin
  perform private.require_admin();
  if jsonb_typeof(coalesce(p_product -> 'variants', '[]')) <> 'array' then raise exception 'Formato de variantes no válido.'; end if;

  insert into public.products as p (id, slug, ref, name, category, collection, price, compare_at_price, description,
    composition, fit, colors, sizes, images, published, featured, is_new)
  values (
    coalesce(v_id, gen_random_uuid()),
    p_product ->> 'slug', upper(p_product ->> 'ref'), btrim(p_product ->> 'name'),
    nullif(btrim(coalesce(p_product ->> 'category', '')), ''), nullif(btrim(coalesce(p_product ->> 'collection', '')), ''),
    (p_product ->> 'price')::int, nullif(p_product ->> 'compareAtPrice', '')::int,
    coalesce(p_product ->> 'description', ''), coalesce(p_product ->> 'composition', ''), coalesce(p_product ->> 'fit', ''),
    coalesce(p_product -> 'colors', '[]'),
    array(select jsonb_array_elements_text(coalesce(p_product -> 'sizes', '[]'))),
    array(select jsonb_array_elements_text(coalesce(p_product -> 'images', '[]'))),
    coalesce((p_product ->> 'published')::boolean, false), coalesce((p_product ->> 'featured')::boolean, false),
    coalesce((p_product ->> 'isNew')::boolean, false))
  on conflict (id) do update set
    slug = excluded.slug, ref = excluded.ref, name = excluded.name, category = excluded.category,
    collection = excluded.collection, price = excluded.price, compare_at_price = excluded.compare_at_price,
    description = excluded.description, composition = excluded.composition, fit = excluded.fit,
    colors = excluded.colors, sizes = excluded.sizes, images = excluded.images, published = excluded.published,
    featured = excluded.featured, is_new = excluded.is_new, updated_at = now()
  returning * into v_prod;

  select coalesce(array_agg(upper(x ->> 'sku')), '{}') into v_skus from jsonb_array_elements(p_product -> 'variants') x;
  if exists (select 1 from public.product_variants where sku = any (v_skus) and product_id <> v_prod.id) then
    raise exception 'Hay un SKU repetido con otro producto.';
  end if;

  delete from public.product_variants where product_id = v_prod.id and sku <> all (v_skus);
  insert into public.product_variants (sku, product_id, color, size, stock)
  select upper(x ->> 'sku'), v_prod.id, x ->> 'color', x ->> 'size', greatest(0, coalesce((x ->> 'stock')::int, 0))
  from jsonb_array_elements(p_product -> 'variants') x
  on conflict (sku) do update set color = excluded.color, size = excluded.size, stock = excluded.stock;

  return private.product_json(v_prod);
exception
  when unique_violation then raise exception 'Ya existe un producto con esa referencia, URL o combinación color/talla.';
end $$;

create function public.admin_delete_product(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  delete from public.products where id = p_id;  -- los pedidos conservan nombre, referencia y precio
end $$;

create function public.admin_set_stock(p_sku text, p_stock int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  update public.product_variants set stock = greatest(0, p_stock) where sku = p_sku;
  if not found then raise exception 'SKU no encontrado.'; end if;
end $$;

create function public.admin_orders() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  perform private.release_expired();
  return (select coalesce(jsonb_agg(private.order_json(o, true) order by o.created_at desc), '[]') from public.orders o);
end $$;

create function public.admin_set_order_status(p_id uuid, p_status text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_order   public.orders;
  v_allowed text[];
begin
  perform private.require_admin();
  select * into v_order from public.orders where id = p_id for update;
  if not found then raise exception 'Pedido no encontrado.'; end if;
  v_allowed := case v_order.status
    when 'pending_payment' then array['cancelled']
    when 'paid'            then array['preparing', 'shipped', 'ready_pickup', 'delivered', 'cancelled']
    when 'preparing'       then array['shipped', 'ready_pickup', 'delivered', 'cancelled']
    when 'shipped'         then array['delivered']
    when 'ready_pickup'    then array['delivered', 'cancelled']
    else array[]::text[] end;
  if not (p_status = any (v_allowed)) then raise exception 'Cambio de estado no permitido.'; end if;
  update public.orders set status = p_status, updated_at = now() where id = p_id returning * into v_order;
  if p_status = 'cancelled' then perform private.restock(p_id); end if;
  return private.order_json(v_order, true);
end $$;

create function public.admin_promotions() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return (select coalesce(jsonb_agg(private.promo_json(pr) order by pr.created_at desc), '[]') from public.promotions pr);
end $$;

create function public.admin_save_promotion(p_promo jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_promo public.promotions;
begin
  perform private.require_admin();
  insert into public.promotions as pr (id, code, description, type, value, min_subtotal, starts_at, ends_at, max_uses, active)
  values (coalesce(nullif(p_promo ->> 'id', '')::uuid, gen_random_uuid()), upper(btrim(p_promo ->> 'code')),
    coalesce(p_promo ->> 'description', ''), p_promo ->> 'type', (p_promo ->> 'value')::int,
    coalesce((p_promo ->> 'minSubtotal')::int, 0), nullif(p_promo ->> 'startsAt', '')::timestamptz,
    nullif(p_promo ->> 'endsAt', '')::timestamptz, nullif(p_promo ->> 'maxUses', '')::int,
    coalesce((p_promo ->> 'active')::boolean, true))
  on conflict (id) do update set code = excluded.code, description = excluded.description, type = excluded.type,
    value = excluded.value, min_subtotal = excluded.min_subtotal, starts_at = excluded.starts_at,
    ends_at = excluded.ends_at, max_uses = excluded.max_uses, active = excluded.active
  returning * into v_promo;
  return private.promo_json(v_promo);
exception
  when unique_violation then raise exception 'Ya existe una promoción con ese código.';
end $$;

create function public.admin_delete_promotion(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  delete from public.promotions where id = p_id;
end $$;

/* ---------------------------------------------------------
   Permisos de las RPC
   (Supabase concede EXECUTE a anon por defecto en `public`)
   --------------------------------------------------------- */
do $$
declare f text;
begin
  -- Tienda: visitantes y clientes
  foreach f in array array[
    'public.store_products()', 'public.store_product(text)', 'public.store_check_promo(text, int)',
    'public.store_create_order(jsonb)', 'public.store_get_order(text, text)', 'public.store_lookup_order(text, text)'
  ] loop
    execute format('revoke execute on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;

  -- Panel: solo usuarios autenticados (cada función valida además que sea administrador)
  foreach f in array array[
    'public.admin_is_admin()', 'public.admin_products()', 'public.admin_save_product(jsonb)',
    'public.admin_delete_product(uuid)', 'public.admin_set_stock(text, int)', 'public.admin_orders()',
    'public.admin_set_order_status(uuid, text)', 'public.admin_promotions()', 'public.admin_save_promotion(jsonb)',
    'public.admin_delete_promotion(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;

  -- Pagos: solo la Edge Function (service_role)
  foreach f in array array[
    'public.payment_update(text, text, text, bigint, text, text)', 'public.payment_checkout_data(text, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

/* ---------------------------------------------------------
   Fotos de productos (Storage): lectura pública, escritura solo admin
   --------------------------------------------------------- */
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "Fotos: admins suben" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and private.is_admin());
create policy "Fotos: admins actualizan" on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and private.is_admin());
create policy "Fotos: admins borran" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and private.is_admin());

-- private.is_admin se usa en políticas de Storage: el rol authenticated necesita poder ejecutarla
grant usage on schema private to authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_admin() to authenticated;
