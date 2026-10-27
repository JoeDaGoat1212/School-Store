# School Store

The website for our student-run store.

- **Students** scan a QR code, browse the menu, and place an order to **pay at pickup** (cash or debit). They get an order number like `SS-0042`.
- **The admin** logs in to run the order queue, import sales from InTouchPay, log shopping trips, track inventory, and see profit.

This site does **not** replace InTouchPay. Every sale, including online orders, is still rung up in InTouchPay at the window. The site imports InTouchPay's export so it can do the math.

> **Build status:** Phases 1–7 of 8 are done: everything in the plan except the nice-to-haves (phase 8). See [Build phases](#build-phases).

---

## Contents

1. [How it works (the big picture)](#how-it-works-the-big-picture)
2. [Set up on your computer](#set-up-on-your-computer)
3. [Create the admin login](#create-the-admin-login)
4. [Deploy to Vercel](#deploy-to-vercel)
5. [Everyday changes](#everyday-changes)
6. [Where things are in the code](#where-things-are-in-the-code)
7. [Rules the code follows](#rules-the-code-follows)
8. [Troubleshooting](#troubleshooting)
9. [Build phases](#build-phases)

---

## How it works (the big picture)

```
 Student's phone ──▶  Website (Next.js on Vercel)  ──▶  Database (Supabase)
 Admin's laptop  ──▶        pages + server code         tables, logins, photos
```

- **Next.js** draws the pages and runs the server code. Pages live in `src/app`.
- **Supabase** stores everything: products, orders, sales, expenses. It also handles the admin login and stores photos and receipts.
- **Vercel** hosts the website for free and redeploys it every time you push to GitHub.

### Tools used

| Tool | What it does |
| --- | --- |
| [Next.js](https://nextjs.org) (App Router) + TypeScript | The website |
| [Tailwind CSS](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com) | Styling and ready-made components (buttons, tables, dialogs) |
| [Supabase](https://supabase.com) | Postgres database, login, file storage |
| [Recharts](https://recharts.org) | Charts on the Insights page |

---

## Set up on your computer

You only do this once. Expect it to take about 30 minutes the first time.

### 1. Install the tools

- **Node.js 20.9 or newer.** Download the LTS version from [nodejs.org](https://nodejs.org). Check it worked by running `node -v` in a terminal.
- **Git.** Get it from [git-scm.com](https://git-scm.com).
- **A code editor.** [VS Code](https://code.visualstudio.com) is a good choice.

### 2. Download the code

```bash
git clone https://github.com/JoeDaGoat1212/School-Store.git
cd School-Store
npm install
```

`npm install` downloads all the libraries listed in `package.json` into a `node_modules` folder. It takes a minute or two.

### 3. Create a Supabase project

1. Sign up at [supabase.com](https://supabase.com) (the free plan is enough).
2. Click **New project**. Pick a name like `school-store`, set a strong database password (save it somewhere safe), and choose the **West US** region.
3. Wait about two minutes for the project to start.

### 4. Turn off public sign-ups

Only the admin should be able to log in, so make sure no one else can create an account.

In Supabase, open **Authentication → Sign In / Providers** and turn off **Allow new users to sign up**.

(The database also double-checks that you're the admin, so even if someone did sign up they would see nothing. Turning sign-ups off is an extra lock.)

### 5. Add your keys

1. Copy the example settings file:
   ```bash
   cp .env.example .env.local
   ```
2. In Supabase, open **Project Settings → API Keys** and copy these into `.env.local`:
   - the **Publishable key** → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - the **Secret key** → `SUPABASE_SECRET_KEY`
3. **`NEXT_PUBLIC_SUPABASE_URL`** is your project's web address. Look at your browser's address bar while you're in your Supabase project. It looks like this:
   ```
   https://supabase.com/dashboard/project/abcdefghijklmnop
   ```
   The letters at the end (`abcdefghijklmnop`) are your **project ID**. Put them into this pattern:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
   ```
4. **`IP_HASH_SALT`** is a made-up password that only the website uses. It helps stop prank orders without storing anyone's real internet address. Type 30 or more random letters and numbers, with no spaces. Mashing the keyboard works:
   ```
   IP_HASH_SALT=k29fjq8x7vmb3n1pz6ty4wd5hs0ralcueg
   ```
   Don't copy the example above; make up your own. You never need to remember it.

> **Never share or commit `.env.local`.** The secret key can read and change everything in the database. Git already ignores this file.

### 6. Create the database tables

These commands use the Supabase CLI, which is already installed by `npm install`:

```bash
npx supabase login
npx supabase link --project-ref YOUR-PROJECT-ID
npx supabase db push --include-seed
```

- Your project ID is the part of the Project URL before `.supabase.co`.
- `db push` runs every file in `supabase/migrations/` in order. Those files create the tables, security rules, and nightly jobs.
- `--include-seed` also loads `supabase/seed.sql`: about 20 products and four weeks of fake sales, orders, and shopping trips, so every page has something to show.

> **Use sample data only in a test project.** When you set up the real store, run `npx supabase db push` **without** `--include-seed`.

**If `db push` gets stuck** (it can hang on `Initialising login role...` on school Wi-Fi), use the SQL Editor instead:

1. Open [`supabase/setup-all.sql`](supabase/setup-all.sql) on GitHub and click the **Copy raw file** button (two overlapping squares, top right of the file).
2. In Supabase, click **SQL Editor** in the left sidebar → **New query**.
3. Paste, then click **Run**. After a few seconds the result should say **School Store database is ready!**

For the real store, use `supabase/setup-all-no-sample.sql` instead (no fake data). These two files are made from the migrations by `npm run db:bundle`. Run that again whenever you add a migration.

### 7. Start the website

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the menu.

---

## Create the admin login

The store has **one** admin account. Create it from your computer:

```bash
npm run create-admin -- you@school.org "a-long-password"
```

Then go to [http://localhost:3000/login](http://localhost:3000/login) and log in.

- Running the same command with the same email and a new password **resets the password**.
- To use a different email, run it with the new email, then delete the old row in Supabase → **Table Editor → admins**.

---

## Deploy to Vercel

1. Push your code to GitHub.
2. Sign in at [vercel.com](https://vercel.com) with your GitHub account (the free Hobby plan is enough).
3. Click **Add New → Project** and import the `School-Store` repo. Vercel detects Next.js by itself.
4. Before you click Deploy, open **Environment Variables** and add the same four values that are in your `.env.local`.
5. Click **Deploy**. In about a minute you'll get a link like `school-store.vercel.app`.
6. Back in Supabase, open **Authentication → URL Configuration** and set **Site URL** to that link.

From now on, every push to the `main` branch redeploys the site automatically.

---

## Everyday changes

| I want to… | Do this |
| --- | --- |
| Use our school name, colors or logo | Edit `src/config/brand.ts` (the tab icon updates from it too) |
| Change pickup times, cutoff, closed days, the banner, order limits, or your password | **Settings** page in the staff dashboard |
| Make a fresh sample InTouchPay file for testing imports | `npm run sample-csv` (writes `sample-data/intouchpay-sample.csv`) |
| Change the database | Add a **new** file in `supabase/migrations/`. Never edit old ones; they have already run. Then run `npm run db:bundle` and `npm run db:types`, and apply it (see below). |
| Check for mistakes before pushing | `npm run typecheck`, `npm run lint` and `npm test` |

### Applying a database update

When a new file shows up in `supabase/migrations/` (after a `git pull`), your Supabase database needs it too. Use either method:

- **SQL Editor (works on any Wi-Fi):** open the matching file in `supabase/sql-editor/`, copy all of it, paste it into Supabase → **SQL Editor** → **New query**, and click **Run**. It should end with a message like *Update … is done!* If you see *already run*, you're up to date.
- **Terminal:** `npx supabase db push --linked`

Run updates in order (they're numbered) and only once each. The SQL Editor files refuse to run twice, so a double-click is safe.

---

## Where things are in the code

```
src/
  app/                      ← every folder here is a page (URL)
    page.tsx                ← the public menu   (/)
    login/                  ← staff login       (/login)
    admin/                  ← staff pages       (/admin/…), login required
  components/
    ui/                     ← shadcn components (Button, Card, Table…)
    staff/                  ← sidebar, page header, empty states
  config/brand.ts           ← name, colors, logo, order number prefix
  lib/
    supabase/               ← connecting to the database (+ generated types)
    auth.ts                 ← requireAdmin(): protects staff pages
    format.ts               ← money and Arizona-time date helpers
  proxy.ts                  ← runs before /admin pages; keeps the login fresh
supabase/
  migrations/               ← the database, built step by step (read these!)
  seed.sql                  ← sample data
scripts/                    ← create-admin, sample CSV generator
```

The SQL files in `supabase/migrations/` are heavily commented. Read them to understand the data.

---

## Rules the code follows

### Money is stored in cents
`price_cents = 150` means $1.50. Whole numbers don't have rounding errors like decimals do. Use `formatCents()` to display money.

### Arizona time
"Today" always means today in Arizona (`America/Phoenix`), even though servers run on UTC. Use `storeToday()` in code and `public.store_today()` in SQL.

### When stock goes down
Stock goes down when an item is **paid for**:

- **Online orders** are paid at pickup, so stock drops when staff mark the order **Picked up**.
- **In-person sales** happen in InTouchPay, so stock drops when the export is **imported**.

Online orders are also rung up in InTouchPay, so they show up in the import too. To avoid subtracting them twice, the import compares each product's sales for each day with that day's picked-up online orders. It only subtracts the difference. The SQL function `reconcile_sales_stock` does this.

Open orders **reserve** stock. Students see *stock − reserved* as "available", so two students can't order the last item.

### Stock history can't be edited
Every stock change is a row in `stock_movements`, with a reason. The product's `stock` number is updated from those rows automatically. To fix a wrong count, add an adjustment (with a note); don't edit the number.

### Revenue only comes from imports
The site never counts online orders as revenue. Revenue arrives through the InTouchPay import, which already includes online orders rung up at pickup.

### Privacy and security
- Orders store only first name, last name, and grade.
- Students can't read any table directly. They can only call four database functions: get the menu, get store info, look up an order (needs the number **and** last name), and place an order (through the website's server only).
- Row Level Security blocks everything else unless you're the admin.
- Orders older than 90 days are deleted automatically every night. The number is a setting.
- Order numbers are counted up (`SS-0001`, `SS-0002`…) and contain no personal information.

### Nightly jobs
Two jobs run inside the database every night (Arizona time):
- **11:00 PM:** orders from past days that nobody picked up are marked *Expired*, which frees their reserved stock.
- **11:30 PM:** orders past the retention period are deleted.

To see them, run `select * from cron.job;` in the Supabase SQL Editor.

---

## Troubleshooting

**"Missing environment variable…"**
`.env.local` is missing or a value is blank. Compare it with `.env.example`. Restart `npm run dev` after editing it.

**Login says "This account isn't the store admin."**
Run `npm run create-admin` with that email again.

**The menu is empty.**
Products might not be marked *available online*, or the database wasn't seeded. In Supabase, open **Table Editor → products** to check.

**`db push` says a migration already ran.**
That's expected for old files. Only new files run.

**Types are out of date (red squiggles after a database change).**
Run `npm run db:types`.

---

## Build phases

1. ✅ Setup, login, database, sample data
2. ✅ Products + public menu + ordering
3. ✅ Order queue
4. ✅ Inventory + expenses
5. ✅ Sales import
6. ✅ Insights dashboard
7. ✅ Settings + polish
8. ⬜ Nice-to-haves (QR codes, deal of the day, bundles, suggestions)
