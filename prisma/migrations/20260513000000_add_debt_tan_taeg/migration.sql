-- Add TAEG (effective APR) and totalPeriods (number of installments) to Debt.
-- interestRate continues to represent TAN (nominal annual rate).
ALTER TABLE "Debt" ADD COLUMN "taeg" REAL;
ALTER TABLE "Debt" ADD COLUMN "totalPeriods" INTEGER;
