-- CreateTable (join table: A = Member, B = User)
CREATE TABLE "_UserVisibleMembers" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_UserVisibleMembers_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_UserVisibleMembers_B_index" ON "_UserVisibleMembers"("B");

-- AddForeignKey
ALTER TABLE "_UserVisibleMembers" ADD CONSTRAINT "_UserVisibleMembers_A_fkey" FOREIGN KEY ("A") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserVisibleMembers" ADD CONSTRAINT "_UserVisibleMembers_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep existing single-member links
INSERT INTO "_UserVisibleMembers" ("A", "B")
SELECT "memberId", "id" FROM "User" WHERE "memberId" IS NOT NULL
ON CONFLICT DO NOTHING;

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_memberId_fkey";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "memberId";
