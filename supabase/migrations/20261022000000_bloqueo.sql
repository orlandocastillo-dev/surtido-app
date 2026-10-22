-- Bloqueo por intentos fallidos de contraseña

create schema if not exists privado;

create table if not exists privado.intentos (
  correo text primary key,
  fallos integer not null default 0,
  bloqueos integer not null default 0,
  bloqueado_hasta timestamptz,
  ultimo_fallo timestamptz
);
alter table privado.intentos enable row level security;

-- Segundos que le faltan al correo para poder volver a intentar (0 si no está bloqueado).
create or replace function public.bloqueo_restante(correo text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    greatest(0, ceil(extract(epoch from (i.bloqueado_hasta - now()))))::integer,
    0
  )
  from (select 1) _
  left join privado.intentos i on i.correo = lower(trim(bloqueo_restante.correo))
$$;

-- Anota una contraseña equivocada
create or replace function public.registrar_fallo(correo text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  c text := lower(trim(registrar_fallo.correo));
  fila privado.intentos;
  minutos integer;
begin
  if c is null or length(c) < 3 or length(c) > 320 then
    return 0;
  end if;

  insert into privado.intentos as i (correo, fallos, ultimo_fallo)
  values (c, 1, now())
  on conflict (correo) do update
    set fallos = case
          -- Si ya está bloqueado, no suma más (no alarga el bloqueo).
          when i.bloqueado_hasta > now() then i.fallos
          -- Fallos viejos (más de 15 minutos) no cuentan.
          when i.ultimo_fallo < now() - interval '15 minutes' then 1
          else i.fallos + 1
        end,
        ultimo_fallo = now()
  returning * into fila;

  if fila.bloqueado_hasta > now() then
    return ceil(extract(epoch from (fila.bloqueado_hasta - now())))::integer;
  end if;

  if fila.fallos >= 5 then
    minutos := least(15 * power(2, fila.bloqueos)::integer, 24 * 60);
    update privado.intentos
       set fallos = 0, bloqueos = bloqueos + 1, bloqueado_hasta = now() + make_interval(mins => minutos)
     where privado.intentos.correo = c;
    return minutos * 60;
  end if;
  return 0;
end;
$$;

-- Al entrar bien: borrón y cuenta nueva para el correo de quien entró.
create or replace function public.login_exitoso()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update privado.intentos
     set fallos = 0, bloqueos = 0, bloqueado_hasta = null
   where correo = lower(auth.email())
$$;

grant execute on function public.bloqueo_restante(text), public.registrar_fallo(text) to anon, authenticated;
grant execute on function public.login_exitoso() to authenticated;

-- Surtido: cuando el dueño le pone una contraseña nueva a un vendedor, se le quita el bloqueo
create or replace function public.desbloquear_miembro(miembro uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.soy_dueno() then
    raise exception 'Solo el dueño puede hacer esto' using errcode = '42501';
  end if;
  if not exists (select 1 from public.miembros where user_id = miembro and tienda_id = public.mi_tienda()) then
    raise exception 'Ese usuario no es de tu tienda' using errcode = '42501';
  end if;
  update privado.intentos
     set fallos = 0, bloqueos = 0, bloqueado_hasta = null
   where correo = (select lower(email) from auth.users where id = miembro);
end;
$$;

grant execute on function public.desbloquear_miembro(uuid) to authenticated;
