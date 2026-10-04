-- The initial migration used an over-escaped dot and an unqualified name in
-- the workspace subquery (resolved as the workspace's name). Correct both.
begin;

alter table public.kontakti_expense_receipts
  drop constraint kontakti_expense_receipts_check;
alter table public.kontakti_expense_receipts
  add constraint kontakti_expense_receipts_storage_path_check
  check (storage_path ~ ('^' || workspace_id::text || '/[0-9a-f]{64}[.](jpg|png|webp)$'));

alter policy expense_receipts_owner_insert on storage.objects
  with check (bucket_id='expense-receipts'
    and name ~ '^[0-9a-f-]{36}/[0-9a-f]{64}[.](jpg|png|webp)$'
    and exists(select 1 from public.kontakti_workspaces w
      where w.id::text=(storage.foldername(storage.objects.name))[1]
        and w.owner_id=(select auth.uid())));
alter policy expense_receipts_owner_select on storage.objects
  using (bucket_id='expense-receipts'
    and exists(select 1 from public.kontakti_workspaces w
      where w.id::text=(storage.foldername(storage.objects.name))[1]
        and w.owner_id=(select auth.uid())));
alter policy expense_receipts_owner_delete on storage.objects
  using (bucket_id='expense-receipts'
    and exists(select 1 from public.kontakti_workspaces w
      where w.id::text=(storage.foldername(storage.objects.name))[1]
        and w.owner_id=(select auth.uid())));

commit;
