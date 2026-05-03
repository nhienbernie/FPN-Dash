create table if not exists pantries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  hours text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Seed with the existing hardcoded drive-thru locations
insert into pantries (name, address, hours) values
  ('Christ Cornerstone Church', '69 King Avenue, Newark, OH 43055', 'Weds: 4:30–6pm'),
  ('Marne Church', '1019 Licking Valley Rd, Newark, OH 43055', 'Tues: 9am–12pm'),
  ('Utica LEADS', '308 North Main St, Utica, OH 43080', 'Thurs: 3:30–5:30pm');
