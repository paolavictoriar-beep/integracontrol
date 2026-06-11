create extension if not exists "pgcrypto";

create table if not exists public.app_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'operador',
  created_at timestamptz not null default now()
);

create table if not exists public.empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cnpj text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo_integracao text not null default 'inPerson',
  validade_integracao integer,
  configuracoes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.treinamentos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  validade_padrao integer,
  unidade_validade text not null default 'months',
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.colaboradores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cpf text,
  rg text,
  data_nascimento date,
  funcao text,
  empresa_id uuid references public.empresas(id) on delete set null,
  data_admissao date,
  data_demissao date,
  status text not null default 'ativo',
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.treinamentos_colaborador (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references public.colaboradores(id) on delete cascade,
  treinamento_id uuid not null references public.treinamentos(id) on delete cascade,
  data_realizacao date,
  data_vencimento date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.integracoes_colaborador (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references public.colaboradores(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  data_integracao date,
  data_vencimento date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agenda (
  id uuid primary key default gen_random_uuid(),
  titulo text not null default 'Integração',
  data date,
  horario time,
  observacoes text,
  cliente_id uuid references public.clientes(id) on delete set null,
  colaborador_id uuid references public.colaboradores(id) on delete set null,
  status text not null default 'Agendada',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_empresas_updated_at on public.empresas;
create trigger set_empresas_updated_at before update on public.empresas for each row execute function public.set_updated_at();

drop trigger if exists set_clientes_updated_at on public.clientes;
create trigger set_clientes_updated_at before update on public.clientes for each row execute function public.set_updated_at();

drop trigger if exists set_treinamentos_updated_at on public.treinamentos;
create trigger set_treinamentos_updated_at before update on public.treinamentos for each row execute function public.set_updated_at();

drop trigger if exists set_colaboradores_updated_at on public.colaboradores;
create trigger set_colaboradores_updated_at before update on public.colaboradores for each row execute function public.set_updated_at();

drop trigger if exists set_treinamentos_colaborador_updated_at on public.treinamentos_colaborador;
create trigger set_treinamentos_colaborador_updated_at before update on public.treinamentos_colaborador for each row execute function public.set_updated_at();

drop trigger if exists set_integracoes_colaborador_updated_at on public.integracoes_colaborador;
create trigger set_integracoes_colaborador_updated_at before update on public.integracoes_colaborador for each row execute function public.set_updated_at();

drop trigger if exists set_agenda_updated_at on public.agenda;
create trigger set_agenda_updated_at before update on public.agenda for each row execute function public.set_updated_at();

alter table public.app_profiles enable row level security;
alter table public.empresas enable row level security;
alter table public.colaboradores enable row level security;
alter table public.clientes enable row level security;
alter table public.treinamentos enable row level security;
alter table public.treinamentos_colaborador enable row level security;
alter table public.integracoes_colaborador enable row level security;
alter table public.agenda enable row level security;

create policy "profiles_select_own" on public.app_profiles for select to authenticated using (id = auth.uid());
create policy "profiles_update_own" on public.app_profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "authenticated_select_empresas" on public.empresas for select to authenticated using (true);
create policy "authenticated_insert_empresas" on public.empresas for insert to authenticated with check (true);
create policy "authenticated_update_empresas" on public.empresas for update to authenticated using (true) with check (true);
create policy "authenticated_delete_empresas" on public.empresas for delete to authenticated using (true);

create policy "authenticated_select_colaboradores" on public.colaboradores for select to authenticated using (true);
create policy "authenticated_insert_colaboradores" on public.colaboradores for insert to authenticated with check (true);
create policy "authenticated_update_colaboradores" on public.colaboradores for update to authenticated using (true) with check (true);
create policy "authenticated_delete_colaboradores" on public.colaboradores for delete to authenticated using (true);

create policy "authenticated_select_clientes" on public.clientes for select to authenticated using (true);
create policy "authenticated_insert_clientes" on public.clientes for insert to authenticated with check (true);
create policy "authenticated_update_clientes" on public.clientes for update to authenticated using (true) with check (true);
create policy "authenticated_delete_clientes" on public.clientes for delete to authenticated using (true);

create policy "authenticated_select_treinamentos" on public.treinamentos for select to authenticated using (true);
create policy "authenticated_insert_treinamentos" on public.treinamentos for insert to authenticated with check (true);
create policy "authenticated_update_treinamentos" on public.treinamentos for update to authenticated using (true) with check (true);
create policy "authenticated_delete_treinamentos" on public.treinamentos for delete to authenticated using (true);

create policy "authenticated_select_treinamentos_colaborador" on public.treinamentos_colaborador for select to authenticated using (true);
create policy "authenticated_insert_treinamentos_colaborador" on public.treinamentos_colaborador for insert to authenticated with check (true);
create policy "authenticated_update_treinamentos_colaborador" on public.treinamentos_colaborador for update to authenticated using (true) with check (true);
create policy "authenticated_delete_treinamentos_colaborador" on public.treinamentos_colaborador for delete to authenticated using (true);

create policy "authenticated_select_integracoes_colaborador" on public.integracoes_colaborador for select to authenticated using (true);
create policy "authenticated_insert_integracoes_colaborador" on public.integracoes_colaborador for insert to authenticated with check (true);
create policy "authenticated_update_integracoes_colaborador" on public.integracoes_colaborador for update to authenticated using (true) with check (true);
create policy "authenticated_delete_integracoes_colaborador" on public.integracoes_colaborador for delete to authenticated using (true);

create policy "authenticated_select_agenda" on public.agenda for select to authenticated using (true);
create policy "authenticated_insert_agenda" on public.agenda for insert to authenticated with check (true);
create policy "authenticated_update_agenda" on public.agenda for update to authenticated using (true) with check (true);
create policy "authenticated_delete_agenda" on public.agenda for delete to authenticated using (true);
