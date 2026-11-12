alter table public.porchlight_pay_settings add column if not exists discount_cents int not null default 500 check (discount_cents between 0 and 5000);
update public.porchlight_pay_settings set card_fee_cents = 0, discount_cents = 500 where id = 'main';
alter table public.porchlight_payments add column if not exists discount_cents int not null default 0 check (discount_cents >= 0);
-- porchlight_pay_info() now also returns 'discount_cents'
