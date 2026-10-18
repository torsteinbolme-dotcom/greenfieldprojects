alter table public.projects add column if not exists cover_image_url text;

create policy "org members read covers" on storage.objects
  for select to authenticated
  using (bucket_id = 'project-covers' and is_org_member(((storage.foldername(name))[1])::uuid, auth.uid()));

create policy "org editors upload covers" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'project-covers' and can_edit_org(((storage.foldername(name))[1])::uuid, auth.uid()));

create policy "org editors update covers" on storage.objects
  for update to authenticated
  using (bucket_id = 'project-covers' and can_edit_org(((storage.foldername(name))[1])::uuid, auth.uid()))
  with check (bucket_id = 'project-covers' and can_edit_org(((storage.foldername(name))[1])::uuid, auth.uid()));

create policy "org editors delete covers" on storage.objects
  for delete to authenticated
  using (bucket_id = 'project-covers' and can_edit_org(((storage.foldername(name))[1])::uuid, auth.uid()));