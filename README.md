# IABilling — Medical Store Billing & Inventory Management

A complete, production-ready pharmacy management system with POS billing, inventory tracking, GST compliance, and analytics.

---

## Prerequisites (already installed on your machine)

| Tool | Version | Download |
|------|---------|---------|
| Node.js | v18 or higher | https://nodejs.org |
| MySQL | 5.7 / 8.0 | Already installed ✅ |
| Git | Any | https://git-scm.com |

---

## 🚀 Quick Setup (5 steps)

### Step 1 — Create the MySQL Database

Open **MySQL Workbench** or **MySQL Command Line** and run:

```sql
CREATE DATABASE iabilling CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### Step 2 — Configure Backend Environment

Open `backend\.env` and update your MySQL password:

```
DATABASE_URL="mysql://root:YOUR_MYSQL_PASSWORD@localhost:3306/iabilling"
```

> If your MySQL root has **no password**, leave it as:
> `mysql://root:@localhost:3306/iabilling`

### Step 3 — Install & Setup Backend

Double-click `scripts\setup-backend.bat`  
**OR** run in terminal:

```bash
cd backend
npm install
npx prisma migrate deploy
npx prisma generate
node prisma/seed.js
```

> **Why `migrate deploy`?** It applies the migrations already in `prisma/migrations/` and creates all tables. Use `npx prisma migrate dev` only when you change `schema.prisma` and want to create a *new* migration.

### Step 4 — Install & Setup Frontend

Double-click `scripts\setup-frontend.bat`  
**OR** run in terminal:

```bash
cd frontend
npm install
```

### Step 5 — Start the Application

Double-click `scripts\start-all.bat`  
**OR** open two terminals:

```bash
# Terminal 1 — Backend (runs on http://localhost:5000)
cd backend
npm run dev

# Terminal 2 — Frontend (runs on http://localhost:3000)
cd frontend
npm run dev
```

Then open **http://localhost:3000** in your browser.

---

## 🔐 Default Login Credentials

| Role | Email | Password |
|------|-------|----------|
| **Admin** | admin@iabilling.com | Admin@123 |
| **Pharmacist** | pharmacist@iabilling.com | Pharm@123 |

---

## 📁 Project Structure

```
IABilling/
├── backend/                  ← Node.js + Express API
│   ├── prisma/
│   │   ├── schema.prisma     ← Database schema (MySQL)
│   │   └── seed.js           ← Sample data
│   ├── src/
│   │   ├── index.js          ← Server entry point
│   │   ├── routes/           ← API endpoints
│   │   │   ├── auth.js
│   │   │   ├── billing.js    ← POS & invoices
│   │   │   ├── medicines.js  ← Inventory
│   │   │   ├── purchases.js
│   │   │   ├── suppliers.js
│   │   │   ├── customers.js
│   │   │   ├── reports.js
│   │   │   ├── dashboard.js
│   │   │   ├── users.js
│   │   │   └── settings.js
│   │   ├── middleware/
│   │   │   ├── auth.js       ← JWT + Role-based access
│   │   │   └── errorHandler.js
│   │   └── utils/
│   │       ├── prisma.js     ← DB client
│   │       ├── helpers.js    ← Utilities
│   │       └── logger.js
│   └── .env                  ← ⚠️ Update MySQL password here
│
├── frontend/                 ← Next.js 14 + Tailwind CSS
│   ├── app/
│   │   ├── auth/login/       ← Login page
│   │   ├── dashboard/        ← Main dashboard
│   │   ├── billing/          ← POS billing
│   │   ├── inventory/        ← Medicine management
│   │   ├── purchases/        ← Purchase orders
│   │   ├── suppliers/        ← Supplier management
│   │   ├── customers/        ← Customer management
│   │   ├── reports/          ← Analytics & reports
│   │   ├── users/            ← User management (Admin)
│   │   └── settings/         ← Store settings (Admin)
│   ├── components/
│   │   ├── layout/           ← Sidebar, Header
│   │   └── ui/               ← Reusable components
│   └── lib/
│       ├── api.ts            ← Axios client
│       ├── store.ts          ← Zustand state (auth + cart)
│       └── utils.ts          ← Helpers & formatters
│
├── scripts/                  ← Windows batch scripts
│   ├── setup-backend.bat
│   ├── setup-frontend.bat
│   └── start-all.bat
│
└── docs/
    └── API.md                ← API documentation
```

---

## 🌐 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/login | Login |
| GET | /api/dashboard | Dashboard stats |
| GET/POST | /api/medicines | List / Add medicine |
| GET | /api/medicines/alerts | Low stock + expiry alerts |
| POST | /api/billing | Create bill (POS) |
| GET | /api/billing/:id/pdf | Download invoice PDF |
| GET/POST | /api/purchases | Purchases |
| GET/POST | /api/suppliers | Suppliers |
| GET/POST | /api/customers | Customers |
| GET | /api/reports/sales | Sales report |
| GET | /api/reports/profit-loss | P&L report |
| GET | /api/reports/gst | GST report |
| GET | /api/reports/expiry | Expiry report |
| GET/PUT | /api/settings | Store settings |

---

## 🛠️ Useful Commands

```bash
# View / edit DB tables visually
cd backend && npx prisma studio

# Re-run seed (add sample data again)
cd backend && node prisma/seed.js

# Reset entire database (⚠️ deletes all data)
cd backend && npx prisma migrate reset

# Build frontend for production
cd frontend && npm run build && npm start
```

---

## 🔧 Troubleshooting

**"Access denied for user 'root'"**  
→ Update `DATABASE_URL` in `backend\.env` with your correct MySQL password.

**"Can't connect to MySQL server"**  
→ Make sure MySQL service is running. In Windows: `services.msc` → find MySQL → Start.

**Port 3000 or 5000 already in use**  
→ Change `PORT=5001` in `backend\.env` or kill the process using that port.

**Prisma migration fails**  
→ Make sure the `iabilling` database exists: `CREATE DATABASE iabilling;`

**`The table User does not exist` / no tables in Workbench**  
→ Migrations were never applied. From the `backend` folder run:

```bash
npx prisma migrate deploy
npx prisma generate
node prisma/seed.js
```

Or double-click `scripts\setup-backend.bat`.

**P3009 / P3018 / “failed migrations” / “key was too long”**  
An earlier migrate may have failed. Run `scripts\fix-migrations.bat`, or from `backend`:

```bash
npx prisma migrate resolve --rolled-back 20260411144422_init
npx prisma migrate deploy
```

The schema uses `VARCHAR(191)` for `User.email` so the unique index fits MySQL’s utf8mb4 key limit.
