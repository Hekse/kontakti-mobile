-- Kontakti: field trips, expenses and private original-image receipts.
-- No changes to legacy Ajo or Kontakti sales objects.
begin;

alter table public.kontakti_customers
  add constraint kontakti_customers_id_workspace_key unique (id, workspace_id);

create table public.kontakti_trips (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.kontakti_workspaces(id),
  created_by uuid not null references auth.users(id),
  trip_date date not null,
  route_text text not null check (length(btrim(route_text)) between 2 and 500),
  kilometers numeric(10,2) not null check (kilometers >= 0),
  rate_per_km numeric(10,4) not null check (rate_per_km >= 0),
  reimbursement numeric(14,2) generated always as (round(kilometers * rate_per_km, 2)) stored,
  notes text check (length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, workspace_id)
);
create index kontakti_trips_workspace_date_idx on public.kontakti_trips(workspace_id, trip_date desc) where deleted_at is null;

create table public.kontakti_trip_customers (
  trip_id uuid not null,
  customer_id uuid not null,
  workspace_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (trip_id, customer_id),
  foreign key (trip_id, workspace_id) references public.kontakti_trips(id, workspace_id) on delete cascade,
  foreign key (customer_id, workspace_id) references public.kontakti_customers(id, workspace_id)
);
create index kontakti_trip_customers_customer_idx on public.kontakti_trip_customers(customer_id, workspace_id);

create table public.kontakti_expenses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.kontakti_workspaces(id),
  created_by uuid not null references auth.users(id),
  expense_date date not null,
  category text not null check (category in ('hotel','fuel','parking','meal','toll','transport','other')),
  amount numeric(12,2) not null check (amount >= 0),
  notes text check (length(notes) <= 2000),
  customer_id uuid,
  trip_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, workspace_id),
  foreign key (customer_id, workspace_id) references public.kontakti_customers(id, workspace_id),
  foreign key (trip_id, workspace_id) references public.kontakti_trips(id, workspace_id)
);
create index kontakti_expenses_workspace_date_idx on public.kontakti_expenses(workspace_id, expense_date desc) where deleted_at is null;
create index kontakti_expenses_trip_idx on public.kontakti_expenses(trip_id, workspace_id);

create table public.kontakti_expense_receipts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  expense_id uuid not null,
  storage_path text not null,
  image_sha256 text not null check (image_sha256 ~ '^[0-9a-f]{64}$'),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  file_size bigint not null check (file_size between 1 and 5242880),
  created_at timestamptz not null default now(),
  unique (workspace_id, image_sha256),
  unique (workspace_id, storage_path),
  foreign key (expense_id, workspace_id) references public.kontakti_expenses(id, workspace_id) on delete cascade,
  check (storage_path ~ ('^' || workspace_id::text || '/[0-9a-f]{64}\.(jpg|png|webp)$')),
  check (split_part(split_part(storage_path, '/', 2), '.', 1) = image_sha256),
  check ((mime_type = 'image/jpeg' and right(storage_path,4) = '.jpg')
      or (mime_type = 'image/png' and right(storage_path,4) = '.png')
      or (mime_type = 'image/webp' and right(storage_path,5) = '.webp'))
);
create index kontakti_receipts_expense_idx on public.kontakti_expense_receipts(expense_id, workspace_id);

alter table public.kontakti_trips enable row level security;
alter table public.kontakti_trip_customers enable row level security;
alter table public.kontakti_expenses enable row level security;
alter table public.kontakti_expense_receipts enable row level security;

create policy kontakti_trips_owner_all on public.kontakti_trips for all to authenticated
  using (exists(select 1 from public.kontakti_workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid())))
  with check (created_by=(select auth.uid()) and exists(select 1 from public.kontakti_workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid())));
create policy kontakti_trip_customers_owner_all on public.kontakti_trip_customers for all to authenticated
  using (exists(select 1 from public.kontakti_workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid())))
  with check (exists(select 1 from public.kontakti_workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid())));
create policy kontakti_expenses_owner_all on public.kontakti_expenses for all to authenticated
  using (exists(select 1 from public.kontakti_workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid())))
  with check (created_by=(select auth.uid()) and exists(select 1 from public.kontakti_workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid())));
create policy kontakti_receipts_owner_all on public.kontakti_expense_receipts for all to authenticated
  using (exists(select 1 from public.kontakti_workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid())))
  with check (exists(select 1 from public.kontakti_workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid())));

revoke all on public.kontakti_trips, public.kontakti_trip_customers, public.kontakti_expenses, public.kontakti_expense_receipts from anon;
grant select,insert,update,delete on public.kontakti_trips, public.kontakti_trip_customers, public.kontakti_expenses, public.kontakti_expense_receipts to authenticated;

-- A trip and its customer links are one database transaction. The caller supplies
-- a stable UUID; an uncertain response can be retried without creating a second trip.
create function public.kontakti_create_trip(
  p_id uuid, p_workspace uuid, p_date date, p_route text, p_km numeric,
  p_rate numeric, p_notes text, p_customers uuid[] default '{}'
) returns uuid language plpgsql security invoker set search_path='' as $$
declare v_existing public.kontakti_trips%rowtype;
begin
  if p_id is null or p_workspace is null or p_customers is null then raise exception 'Missing trip fields'; end if;
  insert into public.kontakti_trips(id,workspace_id,created_by,trip_date,route_text,kilometers,rate_per_km,notes)
  values(p_id,p_workspace,auth.uid(),p_date,p_route,p_km,p_rate,p_notes)
  on conflict (id) do nothing;
  select * into v_existing from public.kontakti_trips where id=p_id and workspace_id=p_workspace;
  if not found or v_existing.created_by is distinct from auth.uid()
     or v_existing.trip_date is distinct from p_date or v_existing.route_text is distinct from p_route
     or v_existing.kilometers is distinct from p_km or v_existing.rate_per_km is distinct from p_rate
     or v_existing.notes is distinct from p_notes or v_existing.deleted_at is not null then
    raise exception 'Trip id already belongs to different data';
  end if;
  if exists(select 1 from public.kontakti_trip_customers tc where tc.trip_id=p_id)
     and (select coalesce(array_agg(customer_id order by customer_id),'{}'::uuid[]) from public.kontakti_trip_customers where trip_id=p_id)
         is distinct from (select coalesce(array_agg(distinct x order by x),'{}'::uuid[]) from unnest(p_customers) x) then
    raise exception 'Trip customer selection differs from saved trip';
  end if;
  insert into public.kontakti_trip_customers(trip_id,customer_id,workspace_id)
    select p_id,x,p_workspace from (select distinct unnest(p_customers) x) s
    on conflict (trip_id,customer_id) do nothing;
  return p_id;
end $$;
revoke all on function public.kontakti_create_trip(uuid,uuid,date,text,numeric,numeric,text,uuid[]) from public,anon;
grant execute on function public.kontakti_create_trip(uuid,uuid,date,text,numeric,numeric,text,uuid[]) to authenticated;

-- Expense and receipt metadata are inserted atomically after the content-addressed
-- upload. The same UUID makes retry safe after a lost response.
create function public.kontakti_create_expense(
  p_id uuid, p_workspace uuid, p_date date, p_category text, p_amount numeric,
  p_notes text, p_customer uuid, p_trip uuid, p_sha text default null,
  p_path text default null, p_mime text default null, p_size bigint default null
) returns uuid language plpgsql security invoker set search_path='' as $$
declare v_existing public.kontakti_expenses%rowtype; v_receipt public.kontakti_expense_receipts%rowtype;
begin
  if p_id is null or p_workspace is null then raise exception 'Missing expense fields'; end if;
  insert into public.kontakti_expenses(id,workspace_id,created_by,expense_date,category,amount,notes,customer_id,trip_id)
  values(p_id,p_workspace,auth.uid(),p_date,p_category,p_amount,p_notes,p_customer,p_trip)
  on conflict (id) do nothing;
  select * into v_existing from public.kontakti_expenses where id=p_id and workspace_id=p_workspace;
  if not found or v_existing.created_by is distinct from auth.uid()
    or v_existing.expense_date is distinct from p_date or v_existing.category is distinct from p_category
    or v_existing.amount is distinct from p_amount or v_existing.notes is distinct from p_notes
    or v_existing.customer_id is distinct from p_customer or v_existing.trip_id is distinct from p_trip
    or v_existing.deleted_at is not null then raise exception 'Expense id already belongs to different data'; end if;
  if p_sha is not null then
    insert into public.kontakti_expense_receipts(workspace_id,expense_id,storage_path,image_sha256,mime_type,file_size)
      values(p_workspace,p_id,p_path,p_sha,p_mime,p_size)
      on conflict (workspace_id,image_sha256) do nothing;
    select * into v_receipt from public.kontakti_expense_receipts where workspace_id=p_workspace and image_sha256=p_sha;
    if not found or v_receipt.expense_id is distinct from p_id or v_receipt.storage_path is distinct from p_path
       or v_receipt.mime_type is distinct from p_mime or v_receipt.file_size is distinct from p_size then
      raise exception 'Receipt already registered for another expense';
    end if;
  elsif p_path is not null or p_mime is not null or p_size is not null then
    raise exception 'Incomplete receipt metadata';
  end if;
  return p_id;
end $$;
revoke all on function public.kontakti_create_expense(uuid,uuid,date,text,numeric,text,uuid,uuid,text,text,text,bigint) from public,anon;
grant execute on function public.kontakti_create_expense(uuid,uuid,date,text,numeric,text,uuid,uuid,text,text,text,bigint) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('expense-receipts','expense-receipts',false,5242880,array['image/jpeg','image/png','image/webp']);

create policy expense_receipts_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id='expense-receipts'
    and name ~ '^[0-9a-f-]{36}/[0-9a-f]{64}\.(jpg|png|webp)$'
    and exists(select 1 from public.kontakti_workspaces w
      where w.id::text=(storage.foldername(name))[1] and w.owner_id=(select auth.uid())));
create policy expense_receipts_owner_select on storage.objects for select to authenticated
  using (bucket_id='expense-receipts'
    and exists(select 1 from public.kontakti_workspaces w
      where w.id::text=(storage.foldername(name))[1] and w.owner_id=(select auth.uid())));
create policy expense_receipts_owner_delete on storage.objects for delete to authenticated
  using (bucket_id='expense-receipts'
    and exists(select 1 from public.kontakti_workspaces w
      where w.id::text=(storage.foldername(name))[1] and w.owner_id=(select auth.uid())));
commit;
