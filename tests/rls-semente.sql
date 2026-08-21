-- ===========================================================================
-- Dados de teste para a auditoria de RLS
--
-- Duas empresas com dados reais em todas as tabelas que interessam, e cargas e
-- viagens em todos os estados. Sem isto, um "0 linhas" não prova nada: pode ser
-- a política a bloquear ou a tabela a estar vazia. Toda a matriz de
-- `rls-matriz.sql` compara o que o papel vê com o que existe de facto.
--
-- Correr como dono da base, antes de `tests/rls-matriz.sql`.
-- ===========================================================================

\set QUIET on
SET session_replication_role = 'origin';

-- Identificadores fixos, para os testes poderem falar deles pelo nome.
--   empresa A  11111111-…-AAAA        empresa B  11111111-…-BBBB
--   user A     22222222-…-AAAA        user B     22222222-…-BBBB
--   admin      22222222-…-0ADM
--   auth uid   33333333-…-<mesmo sufixo>

DELETE FROM public.shipment_photos;
DELETE FROM public.tracking_events;
DELETE FROM public.reviews;
DELETE FROM public.messages;
DELETE FROM public.conversation_participants;
DELETE FROM public.conversations;
DELETE FROM public.agreements;
DELETE FROM public.offers;
DELETE FROM public.matches;
DELETE FROM public.notifications;
DELETE FROM public.documents;
UPDATE public.loads SET assigned_trip_id = NULL;
DELETE FROM public.loads;
DELETE FROM public.trips;
DELETE FROM public.drivers;
DELETE FROM public.vehicles;
DELETE FROM public.users;
DELETE FROM public.locations;
DELETE FROM public.tenants;

INSERT INTO public.tenants (id, name, slug, type) VALUES
  ('11111111-1111-1111-1111-11111111aaaa','Comércio A','comercio-a','EMPRESA'),
  ('11111111-1111-1111-1111-11111111bbbb','Transportes B','transportes-b','EMPRESA');

INSERT INTO public.users (id, tenant_id, auth_user_id, email, phone, full_name, role, is_active) VALUES
  ('22222222-2222-2222-2222-22222222aaaa','11111111-1111-1111-1111-11111111aaaa',
   '33333333-3333-3333-3333-33333333aaaa','ana@comercio-a.ao','+244900000001','Ana (empresa A)','MERCHANT',true),
  ('22222222-2222-2222-2222-22222222bbbb','11111111-1111-1111-1111-11111111bbbb',
   '33333333-3333-3333-3333-33333333bbbb','bruno@transportes-b.ao','+244900000002','Bruno (empresa B)','CARRIER',true),
  ('22222222-2222-2222-2222-2222222000ad','11111111-1111-1111-1111-11111111aaaa',
   '33333333-3333-3333-3333-3333333000ad','admin@cargoflow.ao','+244900000003','Admin plataforma','PLATFORM_ADMIN',true);

INSERT INTO public.locations (id, name, city, province, coordinates) VALUES
  ('44444444-4444-4444-4444-444444440001','Luanda','Luanda','Luanda',
    ST_SetSRID(ST_MakePoint(13.2343,-8.8383),4326)::geography),
  ('44444444-4444-4444-4444-444444440002','Huambo','Huambo','Huambo',
    ST_SetSRID(ST_MakePoint(15.7392,-12.7761),4326)::geography);

INSERT INTO public.vehicles (id, tenant_id, plate, type, max_weight_kg, is_active) VALUES
  ('55555555-5555-5555-5555-55555555aaaa','11111111-1111-1111-1111-11111111aaaa','AA-01-01-AA','HEAVY_TRUCK',20000,true),
  ('55555555-5555-5555-5555-55555555bbbb','11111111-1111-1111-1111-11111111bbbb','BB-02-02-BB','HEAVY_TRUCK',20000,true);

INSERT INTO public.drivers (id, tenant_id, user_id) VALUES
  ('66666666-6666-6666-6666-66666666bbbb','11111111-1111-1111-1111-11111111bbbb','22222222-2222-2222-2222-22222222bbbb');

-- Documentos: um por empresa, para provar isolamento.
INSERT INTO public.documents (id, tenant_id, user_id, type, file_url, document_number) VALUES
  ('77777777-7777-7777-7777-77777777aaaa','11111111-1111-1111-1111-11111111aaaa',
   '22222222-2222-2222-2222-22222222aaaa','TAX_ID','doc/a/nif.pdf','NIF-A-0001'),
  ('77777777-7777-7777-7777-77777777bbbb','11111111-1111-1111-1111-11111111bbbb',
   '22222222-2222-2222-2222-22222222bbbb','TAX_ID','doc/b/nif.pdf','NIF-B-0001');

-- ---------------------------------------------------------------------------
-- Cargas da empresa A, uma por estado. `status` é escrito directamente porque
-- o que se testa é a visibilidade de cada estado, não a máquina de estados.
-- ---------------------------------------------------------------------------
INSERT INTO public.loads
  (id, tenant_id, created_by, origin_id, destination_id, title, description,
   cargo_type, weight_kg, pickup_from, pickup_until, status, budget_amount)
VALUES
  ('88888888-0000-0000-0000-0000000000a1','11111111-1111-1111-1111-11111111aaaa',
   '22222222-2222-2222-2222-22222222aaaa','44444444-4444-4444-4444-444444440001',
   '44444444-4444-4444-4444-444444440002','A · PUBLICADA','contacto: +244900000001',
   'GENERAL',1000, now()+interval '1 day', now()+interval '3 days','PUBLISHED',500000),
  ('88888888-0000-0000-0000-0000000000a2','11111111-1111-1111-1111-11111111aaaa',
   '22222222-2222-2222-2222-22222222aaaa','44444444-4444-4444-4444-444444440001',
   '44444444-4444-4444-4444-444444440002','A · RASCUNHO','segredo comercial',
   'GENERAL',1000, now()+interval '1 day', now()+interval '3 days','DRAFT',500000),
  ('88888888-0000-0000-0000-0000000000a3','11111111-1111-1111-1111-11111111aaaa',
   '22222222-2222-2222-2222-22222222aaaa','44444444-4444-4444-4444-444444440001',
   '44444444-4444-4444-4444-444444440002','A · ATRIBUIDA','em curso',
   'GENERAL',1000, now()+interval '1 day', now()+interval '3 days','ASSIGNED',500000),
  ('88888888-0000-0000-0000-0000000000a4','11111111-1111-1111-1111-11111111aaaa',
   '22222222-2222-2222-2222-22222222aaaa','44444444-4444-4444-4444-444444440001',
   '44444444-4444-4444-4444-444444440002','A · CANCELADA','cancelada',
   'GENERAL',1000, now()+interval '1 day', now()+interval '3 days','CANCELLED',500000);

-- Uma carga publicada da empresa B, para o teste de isolamento ter os dois lados.
INSERT INTO public.loads
  (id, tenant_id, created_by, origin_id, destination_id, title, cargo_type,
   weight_kg, pickup_from, pickup_until, status)
VALUES
  ('88888888-0000-0000-0000-0000000000b1','11111111-1111-1111-1111-11111111bbbb',
   '22222222-2222-2222-2222-22222222bbbb','44444444-4444-4444-4444-444444440001',
   '44444444-4444-4444-4444-444444440002','B · PUBLICADA','GENERAL',
   1000, now()+interval '1 day', now()+interval '3 days','PUBLISHED'),
  ('88888888-0000-0000-0000-0000000000b2','11111111-1111-1111-1111-11111111bbbb',
   '22222222-2222-2222-2222-22222222bbbb','44444444-4444-4444-4444-444444440001',
   '44444444-4444-4444-4444-444444440002','B · RASCUNHO','GENERAL',
   1000, now()+interval '1 day', now()+interval '3 days','DRAFT');

-- Cargas PUBLICADAS que ficam mesmo publicadas: `trg_apos_criar_proposta` muda
-- a carga para NEGOTIATING quando lhe entra uma proposta, e as duas de cima têm
-- propostas. Sem estas, a sonda do mercado media uma carga que já não estava
-- publicada — e dava INCONCLUSIVO em vez de dar a resposta.
INSERT INTO public.loads
  (id, tenant_id, created_by, origin_id, destination_id, title, description,
   cargo_type, weight_kg, pickup_from, pickup_until, status, budget_amount)
VALUES
  ('88888888-0000-0000-0000-0000000000a5','11111111-1111-1111-1111-11111111aaaa',
   '22222222-2222-2222-2222-22222222aaaa','44444444-4444-4444-4444-444444440001',
   '44444444-4444-4444-4444-444444440002','A · PUBLICADA SEM PROPOSTAS',
   'contacto directo: +244900000001','GENERAL',800,
   now()+interval '1 day', now()+interval '3 days','PUBLISHED',750000),
  ('88888888-0000-0000-0000-0000000000b3','11111111-1111-1111-1111-11111111bbbb',
   '22222222-2222-2222-2222-22222222bbbb','44444444-4444-4444-4444-444444440001',
   '44444444-4444-4444-4444-444444440002','B · PUBLICADA SEM PROPOSTAS',
   'privado de B','GENERAL',800,
   now()+interval '1 day', now()+interval '3 days','PUBLISHED',760000);

-- ---------------------------------------------------------------------------
-- Viagens, os mesmos estados que o enum trip_status permite.
-- ---------------------------------------------------------------------------
INSERT INTO public.trips
  (id, tenant_id, created_by, vehicle_id, origin_id, destination_id,
   available_weight_kg, departure_at, status)
VALUES
  ('99999999-0000-0000-0000-0000000000b1','11111111-1111-1111-1111-11111111bbbb',
   '22222222-2222-2222-2222-22222222bbbb','55555555-5555-5555-5555-55555555bbbb',
   '44444444-4444-4444-4444-444444440001','44444444-4444-4444-4444-444444440002',
   15000, now()+interval '2 days','PUBLISHED'),
  ('99999999-0000-0000-0000-0000000000b2','11111111-1111-1111-1111-11111111bbbb',
   '22222222-2222-2222-2222-22222222bbbb','55555555-5555-5555-5555-55555555bbbb',
   '44444444-4444-4444-4444-444444440001','44444444-4444-4444-4444-444444440002',
   15000, now()+interval '2 days','FULL'),
  ('99999999-0000-0000-0000-0000000000b3','11111111-1111-1111-1111-11111111bbbb',
   '22222222-2222-2222-2222-22222222bbbb','55555555-5555-5555-5555-55555555bbbb',
   '44444444-4444-4444-4444-444444440001','44444444-4444-4444-4444-444444440002',
   15000, now()+interval '2 days','CANCELLED'),
  ('99999999-0000-0000-0000-0000000000a1','11111111-1111-1111-1111-11111111aaaa',
   '22222222-2222-2222-2222-22222222aaaa','55555555-5555-5555-5555-55555555aaaa',
   '44444444-4444-4444-4444-444444440001','44444444-4444-4444-4444-444444440002',
   15000, now()+interval '2 days','PUBLISHED');

-- ---------------------------------------------------------------------------
-- Propostas, conversas, mensagens, rastreio, avaliações, fotos.
-- ---------------------------------------------------------------------------
INSERT INTO public.offers (id, load_id, trip_id, offered_by, amount, status) VALUES
  ('aaaa0000-0000-0000-0000-0000000000f1','88888888-0000-0000-0000-0000000000a1',
   '99999999-0000-0000-0000-0000000000b1','22222222-2222-2222-2222-22222222bbbb',450000,'PENDING'),
  ('aaaa0000-0000-0000-0000-0000000000f2','88888888-0000-0000-0000-0000000000b1',
   '99999999-0000-0000-0000-0000000000a1','22222222-2222-2222-2222-22222222aaaa',460000,'PENDING');

INSERT INTO public.offers (id, load_id, trip_id, offered_by, amount, status) VALUES
  ('aaaa0000-0000-0000-0000-0000000000f3','88888888-0000-0000-0000-0000000000b1',
   '99999999-0000-0000-0000-0000000000b1','22222222-2222-2222-2222-22222222bbbb',470000,'PENDING');

INSERT INTO public.conversations (id, load_id) VALUES
  ('bbbb0000-0000-0000-0000-0000000000c1','88888888-0000-0000-0000-0000000000a1'),
  ('bbbb0000-0000-0000-0000-0000000000c2','88888888-0000-0000-0000-0000000000b1');
INSERT INTO public.conversation_participants (conversation_id, user_id) VALUES
  ('bbbb0000-0000-0000-0000-0000000000c1','22222222-2222-2222-2222-22222222aaaa'),
  ('bbbb0000-0000-0000-0000-0000000000c1','22222222-2222-2222-2222-22222222bbbb'),
  ('bbbb0000-0000-0000-0000-0000000000c2','22222222-2222-2222-2222-22222222bbbb');
INSERT INTO public.messages (id, conversation_id, sender_id, content) VALUES
  ('cccc0000-0000-0000-0000-0000000000e1','bbbb0000-0000-0000-0000-0000000000c1',
   '22222222-2222-2222-2222-22222222aaaa','mensagem da conversa partilhada'),
  ('cccc0000-0000-0000-0000-0000000000e2','bbbb0000-0000-0000-0000-0000000000c2',
   '22222222-2222-2222-2222-22222222bbbb','mensagem só da empresa B');

INSERT INTO public.tracking_events (id, load_id, event_type, description, created_by) VALUES
  ('dddd0000-0000-0000-0000-0000000000d1','88888888-0000-0000-0000-0000000000a3',
   'PICKED_UP','recolha da carga A','22222222-2222-2222-2222-22222222bbbb'),
  ('dddd0000-0000-0000-0000-0000000000d2','88888888-0000-0000-0000-0000000000b1',
   'PICKED_UP','recolha da carga B','22222222-2222-2222-2222-22222222bbbb');

INSERT INTO public.reviews (id, load_id, reviewer_id, reviewed_id, rating, comment) VALUES
  ('eeee0000-0000-0000-0000-0000000000e1','88888888-0000-0000-0000-0000000000a3',
   '22222222-2222-2222-2222-22222222aaaa','22222222-2222-2222-2222-22222222bbbb',5,'excelente');

INSERT INTO public.shipment_photos (id, tenant_id, load_id, uploaded_by, path, stage) VALUES
  ('ffff0000-0000-0000-0000-0000000000f1','11111111-1111-1111-1111-11111111aaaa',
   '88888888-0000-0000-0000-0000000000a3','22222222-2222-2222-2222-22222222aaaa','a/foto1.jpg','PICKUP'),
  ('ffff0000-0000-0000-0000-0000000000f2','11111111-1111-1111-1111-11111111bbbb',
   '88888888-0000-0000-0000-0000000000b1','22222222-2222-2222-2222-22222222bbbb','b/foto1.jpg','PICKUP');

\set QUIET off
SELECT 'semente' AS o,
       (SELECT count(*) FROM public.tenants)  AS empresas,
       (SELECT count(*) FROM public.users)    AS utilizadores,
       (SELECT count(*) FROM public.loads)    AS cargas,
       (SELECT count(*) FROM public.trips)    AS viagens,
       (SELECT count(*) FROM public.offers)   AS propostas,
       (SELECT count(*) FROM public.messages) AS mensagens,
       (SELECT count(*) FROM public.documents) AS documentos,
       (SELECT count(*) FROM public.tracking_events) AS rastreio,
       (SELECT count(*) FROM public.shipment_photos) AS fotos;
