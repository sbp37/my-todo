-- 의뢰서 마감 트래커 1단계 (Supabase에 create_deadline_tracker 마이그레이션으로 적용됨)
create table public.tracker_seasons (
  id text primary key,
  name text not null,
  deadline date,
  review_days integer not null default 1,
  start_date date not null default (now() at time zone 'Asia/Seoul')::date,
  holidays jsonb not null default '[]'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tracker_concepts (
  id text primary key,
  season_id text not null references public.tracker_seasons(id) on delete cascade,
  name text not null,
  target integer,
  sort integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tracker_concepts_season_idx on public.tracker_concepts(season_id);

create table public.tracker_items (
  id text primary key,
  season_id text not null references public.tracker_seasons(id) on delete cascade,
  concept_id text not null references public.tracker_concepts(id) on delete cascade,
  code text not null,
  item_type text,
  file_name text,
  difficulty text not null default 'M' check (difficulty in ('S','M','L')),
  important boolean not null default false,
  pinned_at timestamptz,
  status text not null default 'todo' check (status in ('todo','done')),
  auto_done boolean,
  auto_score real,
  confirmed boolean not null default false,
  completed_at timestamptz,
  thumb_path text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tracker_items_season_idx on public.tracker_items(season_id);
create index tracker_items_concept_idx on public.tracker_items(concept_id);

create table public.tracker_sessions (
  id text primary key,
  item_id text not null references public.tracker_items(id) on delete cascade,
  season_id text not null references public.tracker_seasons(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  paused_ms bigint not null default 0,
  pause_started_at timestamptz,
  focus_sec integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tracker_sessions_item_idx on public.tracker_sessions(item_id);
create index tracker_sessions_season_idx on public.tracker_sessions(season_id);

create table public.tracker_days (
  id text primary key,
  season_id text not null references public.tracker_seasons(id) on delete cascade,
  date date not null,
  goal integer not null default 0,
  carry integer not null default 0,
  share integer not null default 0,
  picks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, date)
);

do $$
declare t text;
begin
  foreach t in array array['tracker_seasons','tracker_concepts','tracker_items','tracker_sessions','tracker_days'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated_at', t);
  end loop;
end $$;

-- 썸네일 전용 비공개 버킷 (JPG만, 1MB 제한)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tracker-thumbs', 'tracker-thumbs', false, 1048576, array['image/jpeg'])
on conflict (id) do nothing;

-- 갤러리 수동 정렬(드래그) 순서 (tracker_items_sort_order 마이그레이션)
alter table public.tracker_items add column sort_order double precision;

-- 같은 참고 자료를 쓰는 의뢰서 묶음 (tracker_groups 마이그레이션)
create table public.tracker_groups (
  id text primary key,
  season_id text not null references public.tracker_seasons(id) on delete cascade,
  name text not null,
  sort double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tracker_groups_season_idx on public.tracker_groups(season_id);
alter table public.tracker_groups enable row level security;
create trigger tracker_groups_updated_at before update on public.tracker_groups for each row execute function public.set_updated_at();

alter table public.tracker_items add column group_id text references public.tracker_groups(id) on delete set null;
create index tracker_items_group_idx on public.tracker_items(group_id);
