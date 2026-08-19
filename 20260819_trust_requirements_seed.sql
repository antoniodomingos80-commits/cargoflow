-- Requisitos de verificação por perfil.
--
-- A tabela `verification_requirements` estava vazia desde a criação, o que
-- fazia com que o painel de Trust não exigisse documentação nenhuma. Este
-- seed define o mínimo para o contexto angolano.
--
-- Idempotente: pode correr as vezes que forem precisas (UNIQUE em
-- role + document_type).

INSERT INTO public.verification_requirements
  (role, document_type, is_required, description, renewal_frequency_months)
VALUES
  -- Comerciante (quem publica cargas)
  ('MERCHANT', 'NATIONAL_ID', TRUE,
   'Bilhete de identidade ou passaporte do responsável pela conta.', NULL),
  ('MERCHANT', 'TAX_ID', TRUE,
   'NIF da pessoa ou da empresa que publica as cargas.', NULL),
  ('MERCHANT', 'COMPANY_REGISTRATION', FALSE,
   'Certidão comercial, quando a conta pertence a uma empresa.', NULL),

  -- Camionista independente
  ('CARRIER', 'NATIONAL_ID', TRUE,
   'Bilhete de identidade do camionista.', NULL),
  ('CARRIER', 'DRIVING_LICENSE', TRUE,
   'Carta de condução válida para a categoria do veículo.', 60),
  ('CARRIER', 'VEHICLE_REGISTRATION', TRUE,
   'Livrete do veículo usado no transporte.', NULL),
  ('CARRIER', 'INSURANCE', TRUE,
   'Apólice de seguro do veículo em vigor.', 12),
  ('CARRIER', 'INSPECTION', TRUE,
   'Certificado de inspecção periódica.', 12),

  -- Empresa transportadora
  ('COMPANY_ADMIN', 'COMPANY_REGISTRATION', TRUE,
   'Certidão comercial da transportadora.', NULL),
  ('COMPANY_ADMIN', 'TAX_ID', TRUE,
   'NIF da empresa transportadora.', NULL),
  ('COMPANY_ADMIN', 'NATIONAL_ID', TRUE,
   'Bilhete de identidade do representante legal.', NULL),
  ('COMPANY_ADMIN', 'INSURANCE', TRUE,
   'Seguro de responsabilidade civil da frota.', 12),

  -- Operacional da transportadora
  ('COMPANY_STAFF', 'NATIONAL_ID', TRUE,
   'Bilhete de identidade do colaborador com acesso à plataforma.', NULL)
ON CONFLICT (role, document_type) DO NOTHING;
