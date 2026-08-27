-- Preserve existing checkout drafts while moving only non-monetary test intents
-- to the PayPay sandbox adapter. Confirmed historical events remain untouched.
UPDATE payment_intents
SET provider='PAYPAY_SANDBOX'
WHERE provider='PROXYPAY_TEST' AND status='Pendente';
