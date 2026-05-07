-- CreateEnum
CREATE TYPE "LotType" AS ENUM ('BUY', 'SELL');

-- AlterTable
ALTER TABLE "InvestmentLot" ADD COLUMN     "realizedGain" DECIMAL(12,2),
ADD COLUMN     "type" "LotType" NOT NULL DEFAULT 'BUY';
