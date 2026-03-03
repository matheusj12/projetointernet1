-- Almoxarifado Digital - Script de Criação do Banco de Dados
-- Execute este script no SQL Editor do Supabase: https://supabase.com/dashboard/project/xggmvwxcgbaosuiefgzf/sql/new

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Tabela de Usuários (login simples)
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  display_name text NOT NULL,
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
  created_at timestamptz DEFAULT now()
);

-- Admin padrão: matheusjulio / 123456
INSERT INTO users (username, password_hash, display_name, role)
VALUES ('matheusjulio', encode(digest('123456', 'sha256'), 'hex'), 'Matheus Julio', 'admin')
ON CONFLICT (username) DO NOTHING;

-- Pessoas (Técnicos e Autorizadores)
CREATE TABLE IF NOT EXISTS people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('authorizer', 'technician')),
  phone text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Catálogo de Compras (Orçamento)
CREATE TABLE IF NOT EXISTS catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  unit text NOT NULL DEFAULT 'un',
  quantity_purchased integer NOT NULL DEFAULT 0,
  category text,
  created_at timestamptz DEFAULT now()
);

-- Recebimentos (cabeçalho)
CREATE TABLE IF NOT EXISTS receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_by uuid REFERENCES people(id),
  received_at timestamptz DEFAULT now(),
  notes text,
  photo_url text
);

-- Itens do Recebimento
CREATE TABLE IF NOT EXISTS receipt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid REFERENCES receipts(id) ON DELETE CASCADE,
  catalog_item_id uuid REFERENCES catalog_items(id),
  quantity_ok integer NOT NULL DEFAULT 0,
  quantity_quarantine integer NOT NULL DEFAULT 0,
  notes text
);

-- Cautelas / Tickets de Saída
CREATE TABLE IF NOT EXISTS withdrawals (
  id serial PRIMARY KEY,
  technician_id uuid REFERENCES people(id),
  authorized_by uuid REFERENCES people(id),
  withdrawn_at timestamptz DEFAULT now(),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'returned', 'partial')),
  notes text,
  photo_url text
);

-- Itens da Cautela
CREATE TABLE IF NOT EXISTS withdrawal_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_id integer REFERENCES withdrawals(id) ON DELETE CASCADE,
  catalog_item_id uuid REFERENCES catalog_items(id),
  quantity_taken integer NOT NULL DEFAULT 0,
  quantity_returned integer NOT NULL DEFAULT 0,
  returned_at timestamptz
);

-- Devoluções ao Fornecedor
CREATE TABLE IF NOT EXISTS supplier_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_item_id uuid REFERENCES catalog_items(id),
  quantity integer NOT NULL,
  returned_at timestamptz DEFAULT now(),
  receipt_item_id uuid REFERENCES receipt_items(id),
  notes text,
  photo_url text
);

-- Log de Auditoria
CREATE TABLE IF NOT EXISTS activity_log (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  details jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Habilitar RLS com policies permissivas
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE people ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawal_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON people FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON catalog_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON receipts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON receipt_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON withdrawals FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON withdrawal_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON supplier_returns FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON activity_log FOR ALL USING (true) WITH CHECK (true);
