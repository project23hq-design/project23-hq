-- Starter event categories. Super-admins can rename, reorder or delete them at
-- /super-admin/categories; existing slugs are left untouched.
insert into public.categories (slug, name, icon, sort_order) values
  ('music', 'Music & Concerts', 'music', 10),
  ('parties-nightlife', 'Parties & Nightlife', 'moon', 20),
  ('comedy', 'Comedy', 'laugh', 30),
  ('festivals', 'Festivals', 'sparkles', 40),
  ('arts-culture', 'Arts & Culture', 'palette', 50),
  ('theatre-performance', 'Theatre & Performance', 'drama', 60),
  ('film-screenings', 'Film & Screenings', 'film', 70),
  ('food-drink', 'Food & Drink', 'utensils', 80),
  ('business-networking', 'Business & Networking', 'briefcase', 90),
  ('conferences-summits', 'Conferences & Summits', 'presentation', 100),
  ('tech', 'Tech', 'cpu', 110),
  ('workshops-classes', 'Workshops & Classes', 'wrench', 120),
  ('faith-religion', 'Faith & Religion', 'church', 130),
  ('sports-fitness', 'Sports & Fitness', 'dumbbell', 140),
  ('fashion-beauty', 'Fashion & Beauty', 'shirt', 150),
  ('kids-family', 'Kids & Family', 'baby', 160),
  ('charity-causes', 'Charity & Causes', 'heart-handshake', 170),
  ('tours-travel', 'Tours & Travel', 'map', 180),
  ('gaming', 'Gaming', 'gamepad-2', 190),
  ('other', 'Other', 'shapes', 1000)
on conflict (slug) do nothing;
