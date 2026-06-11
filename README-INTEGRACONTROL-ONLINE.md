# IntegraControl Online

Esta atualização mantém a interface atual e adiciona Supabase Auth, banco online Supabase e preparação para deploy na Vercel.

## 1. Supabase

1. Crie um projeto no Supabase Free.
2. No SQL Editor, execute o arquivo `supabase-schema.sql`.
3. Em Authentication, crie usuários por e-mail e senha.
4. Em Project Settings > API, copie:
   - Project URL
   - anon public key

As tabelas usam RLS. Apenas usuários autenticados conseguem ler e alterar dados.

## 2. Vercel

1. Publique este diretório na Vercel.
2. Configure as variáveis de ambiente:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
3. Faça o deploy.

O arquivo `vercel.json` direciona a aplicação para `outputs/` e mantém `/api/config` para entregar a configuração ao navegador.

## 3. Migração dos dados locais

1. Abra o sistema online e faça login.
2. Vá em Configurações.
3. Clique em `Migrar local para Supabase`.
4. Use `Exportar JSON` ou `Exportar Excel` antes da migração caso queira backup.

## 4. Observações

- A chave anon do Supabase é pública por natureza; a proteção real fica nas políticas RLS.
- A estrutura `app_profiles` já deixa espaço para futuras permissões por perfil.
- Não foram adicionados PDF, Word, OCR ou IA.
