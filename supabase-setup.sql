-- Haise Design: run this once in Supabase > SQL Editor > New query > Run.

-- Customer orders
create table if not exists public.orders (
  id uuid primary key,
  order_no text not null,
  created_at timestamptz not null default now(),
  status text not null default 'new',
  customer jsonb not null,
  details jsonb not null,
  files jsonb not null default '[]'
);
alter table public.orders enable row level security;
-- Customers (not logged in) can only ADD orders, never read them.
create policy "customers submit orders" on public.orders
  for insert to anon, authenticated with check (status = 'new');
create policy "admin reads orders"   on public.orders for select to authenticated using (true);
create policy "admin updates orders" on public.orders for update to authenticated using (true);
create policy "admin deletes orders" on public.orders for delete to authenticated using (true);

-- Saved invoices and receipts (admin only)
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  doc_no text not null,
  doc_type text not null,
  order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz not null default now(),
  data jsonb not null
);
alter table public.documents enable row level security;
create policy "admin manages documents" on public.documents
  for all to authenticated using (true) with check (true);

-- Business settings (admin only)
create table if not exists public.settings (
  id int primary key default 1,
  data jsonb not null
);
alter table public.settings enable row level security;
create policy "admin manages settings" on public.settings
  for all to authenticated using (true) with check (true);

-- Private bucket for customer attachments (15 MB per file)
insert into storage.buckets (id, name, public, file_size_limit)
values ('order-files', 'order-files', false, 15728640)
on conflict (id) do nothing;
create policy "customers upload files" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'order-files');
create policy "admin reads files" on storage.objects
  for select to authenticated using (bucket_id = 'order-files');
create policy "admin deletes files" on storage.objects
  for delete to authenticated using (bucket_id = 'order-files');
