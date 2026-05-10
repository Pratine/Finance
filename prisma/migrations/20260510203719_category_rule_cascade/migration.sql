-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CategoryRule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "pattern" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CategoryRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CategoryRule" ("categoryId", "createdAt", "id", "pattern") SELECT "categoryId", "createdAt", "id", "pattern" FROM "CategoryRule";
DROP TABLE "CategoryRule";
ALTER TABLE "new_CategoryRule" RENAME TO "CategoryRule";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
