-- Public submissions enter the existing private moderation queue. Approval and
-- featured placement remain admin/artist-only; do not bypass RLS for intake.
revoke insert, update, delete, truncate, references, trigger on public.testimonials from anon;
grant insert (name, quote, event_context, source, status, is_featured, sort_order, image_url)
  on public.testimonials to anon;

create policy "Visitors may submit pending reviews" on public.testimonials
  for insert to anon, authenticated
  with check (
    status = 'pending' and is_featured = false and sort_order = 0
    and source = 'Website review'
    and char_length(btrim(name)) between 2 and 100
    and char_length(btrim(quote)) between 20 and 4000
    and (event_context is null or char_length(event_context) <= 150)
    and role is null and title is null and content is null and avatar_url is null
    and (image_url is null or (
      char_length(image_url) <= 350000
      and image_url ~ '^data:image/webp;base64,[A-Za-z0-9+/=]+$'
    ))
  );

-- Legacy media must also respect the parent review's moderation status.
drop policy if exists "Public read testimonial_media" on public.testimonial_media;
create policy "Public read approved testimonial media" on public.testimonial_media
  for select to anon, authenticated using (
    exists (select 1 from public.testimonials t
      where t.id = testimonial_id and t.status = 'approved')
  );
