/**
 * Deletes ALL medicines and dependent rows (bills, purchases, stock movements).
 * Run: node prisma/reset-products.js
 * Then: node prisma/seed.js
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('Removing all products and related bills / purchases / stock logs…');
  await prisma.$transaction([
    prisma.billItem.deleteMany(),
    prisma.bill.deleteMany(),
    prisma.purchaseItem.deleteMany(),
    prisma.purchase.deleteMany(),
    prisma.stockAdjustment.deleteMany(),
    prisma.medicine.deleteMany(),
  ]);
  console.log('Done. Run: node prisma/seed.js');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
