-- Add linkedTransactionId to DebtPayment so payment deletion can find the
-- linked account transaction reliably (previously matched by description+date,
-- which broke if the debt was renamed).
ALTER TABLE "DebtPayment" ADD COLUMN "linkedTransactionId" INTEGER REFERENCES "Transaction"("id") ON DELETE SET NULL;
