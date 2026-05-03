create or replace function public.require_delivery_proof_for_delivered_orders()
returns trigger
language plpgsql
as $$
declare
  meta_prefix constant text := 'WORKAROUND_ORDER_META::';
  meta jsonb;
  proof_uri text;
begin
  if lower(coalesce(new.status, '')) <> 'delivered' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if lower(coalesce(old.status, '')) = 'delivered' then
      return new;
    end if;
  end if;

  if new.notes is null or left(new.notes, length(meta_prefix)) <> meta_prefix then
    raise exception 'Delivery proof is required before marking an order delivered.';
  end if;

  begin
    meta := substring(new.notes from length(meta_prefix) + 1)::jsonb;
  exception
    when others then
      raise exception 'Delivery proof metadata must be valid before marking an order delivered.';
  end;

  proof_uri := nullif(btrim(meta #>> '{deliveryProof,photoUri}'), '');

  if proof_uri is null then
    raise exception 'Delivery proof is required before marking an order delivered.';
  end if;

  if proof_uri !~* '^(https?://|data:image/)' then
    raise exception 'Delivery proof must use a shared image URL before marking an order delivered.';
  end if;

  return new;
end;
$$;

drop trigger if exists require_delivery_proof_for_delivered_orders on public.orders;

create trigger require_delivery_proof_for_delivered_orders
before insert or update of status, notes on public.orders
for each row
execute function public.require_delivery_proof_for_delivered_orders();
