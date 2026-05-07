-- CreateTable
CREATE TABLE "InvestmentLot" (
    "id" SERIAL NOT NULL,
    "investmentId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "shares" DECIMAL(12,6) NOT NULL,
    "pricePerShare" DECIMAL(12,4) NOT NULL,
    "totalCost" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvestmentLot_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "InvestmentLot" ADD CONSTRAINT "InvestmentLot_investmentId_fkey" FOREIGN KEY ("investmentId") REFERENCES "Investment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
