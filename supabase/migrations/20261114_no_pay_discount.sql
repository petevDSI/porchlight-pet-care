-- No discount for paying by Venmo, Zelle or check. Everyone pays the posted price, so sitters' shares
-- (keep_pct of cash collected) always equal keep_pct of the posted price.
update public.porchlight_pay_settings set discount_cents = 0 where id = 'main';
alter table public.porchlight_pay_settings alter column discount_cents set default 0;
