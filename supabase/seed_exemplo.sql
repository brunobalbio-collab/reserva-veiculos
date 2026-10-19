-- Dados de exemplo (opcional). Execute no SQL Editor após a migração.
insert into public.vehicles (plate, brand, model, color, year, seats, location, notes) values
  ('ABC1D23', 'Fiat',       'Strada Freedom', 'Branco', 2024, 2, 'Matão – Portaria 1', 'Chave na portaria. Cartão combustível no porta-luvas.'),
  ('BRA2E19', 'Volkswagen', 'Polo Track',     'Prata',  2024, 5, 'Matão – Portaria 1', null),
  ('RIO3F45', 'Toyota',     'Hilux SR',       'Branco', 2023, 5, 'Bebedouro – Administrativo', 'Uso preferencial para visitas a fazendas.'),
  ('SPO4G67', 'Chevrolet',  'Onix',           'Cinza',  2025, 5, 'Araraquara – Escritório', null)
on conflict (plate) do nothing;

-- Promover o primeiro administrador (troque o e-mail):
-- update public.profiles set role = 'admin' where email = 'seu.email@empresa.com.br';
