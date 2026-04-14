const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');

const p = new PrismaClient();
p.$queryRaw`SELECT 1 AS ok`
  .then((r) => {
    console.log('MySQL connection OK:', r);
  })
  .catch((e) => {
    console.error('MySQL connection failed:', e.message);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
