# Firebirds Nest (school store website)

The website for our student-run store.

- **Students** scan a QR code, browse the menu, and place an order to **pay at pickup** (cash or debit). They get an order number like `FN-0042`.
- **The admin** logs in to run the order queue, import sales from InTouchPay, log shopping trips, track inventory, and see profit.

This site does **not** replace InTouchPay. Every sale, including online orders, is still rung up in InTouchPay at the window. The site imports InTouchPay's export so it can do the math.

> **Build status:** Phases 1–8 are done, including rewards accounts, deals and bundles. See [Build phases](#build-phases).

---

## Contents

1. [How it works (the big picture)](#how-it-works-the-big-picture)
2. [Set up on your computer](#set-up-on-your-computer)
3. [Create the admin login](#create-the-admin-login)
4. [Deploy to Vercel](#deploy-to-vercel)
5. [Rewards accounts setup](#rewards-accounts-setup)
6. [Everyday changes](#everyday-changes)
7. [Where things are in the code](#where-things-are-in-the-code)
8. [Rules the code follows](#rules-the-code-follows)
9. [Troubleshooting](#troubleshooting)
10. [Build phases](#build-phases)

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

### 4. Sign-ups (leave them on)

Students make rewards accounts by signing in with an email code, so **Allow new users to sign up** (in **Authentication → Sign In / Providers**) must stay **on**.

That's safe: only the account in the `admins` table can see staff pages or staff data. Everyone else can only see their own rewards account. To turn on rewards emails, follow [Rewards accounts setup](#rewards-accounts-setup) after the site is running.

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
3. Paste, then click **Run**. After a few seconds the result should say **Firebirds Nest database is ready!**

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

## Rewards accounts setup

Students sign in with their email and a short code from their email (6–8 numbers), no password. Supabase sends the code. Do these four steps once.

**1. Run the database update.** Apply `supabase/sql-editor/20261026000009_rewards_deals.sql` (see [Applying a database update](#applying-a-database-update)). If you skipped `20261026000008_insights.sql`, run that one first.

**2. Turn sign-ups on.** Supabase → **Authentication → Sign In / Providers** → turn **Allow new users to sign up** on.

**3. Make the email show a code.** Supabase → **Authentication → Emails → Templates**. Change **both** the **Confirm signup** and the **Magic link** templates (new students get the first, returning students get the second):

- Subject: `Your Firebirds Nest code`
- Message body:

  ```html
  <h2>Your Firebirds Nest code</h2>
  <p>Type this code on the website to sign in:</p>
  <p style="font-size:32px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
  <p>It works for 1 hour. If you didn't ask for it, you can ignore this email.</p>
  ```

**4. Connect an email sender.** Supabase's built-in email only sends to people on your Supabase team, 2 emails an hour, so students wouldn't get codes. The easiest free sender without a website domain is a Gmail account for the store:

1. Make a Gmail account for the store (a personal-style account; school Google accounts usually block this step).
2. In that account, turn on **2-Step Verification** (Google Account → Security).
3. Go to <https://myaccount.google.com/apppasswords>, make an app password called "Supabase", and copy the 16 letters.
4. Supabase → **Authentication → Emails → SMTP Settings** → turn on **Enable custom SMTP** and fill in:

   | Field | Value |
   | --- | --- |
   | Sender email | the store Gmail address |
   | Sender name | `Firebirds Nest` |
   | Host | `smtp.gmail.com` |
   | Port | `465` |
   | Username | the store Gmail address |
   | Password | the 16-letter app password (no spaces) |

5. Supabase → **Authentication → Rate Limits**: set emails per hour to about `100`, so a busy lunch doesn't run out. (Gmail allows roughly 500 a day.)

Test it: on the website, tap **Sign in**, use your own email, and check that the code arrives (look in spam too). If the school's email blocks it, students can use a personal email.

Later, if the store gets its own website domain, a service like Resend or Brevo is more reliable than Gmail.

---

### Usernames and passwords (update 10)

Students now **create an account** with a username, email and password, confirm it with a code from the email,
and **sign back in** with their username (or email) and password. "Forgot password?" emails a code instead.

1. Run `supabase/sql-editor/20261027000010_usernames.sql` in the Supabase **SQL Editor** (once).
2. Supabase → **Authentication → Sign In / Providers → Email**: keep **Confirm email** on.
3. **Authentication → Emails → Confirm signup**: the message must show `{{ .Token }}` (the code). You did this already for the code sign-in.

Accounts made before this update sign in once with "Forgot password?", then pick a username and password on their account page.

## Everyday changes

| I want to… | Do this |
| --- | --- |
| Use our school name, colors or logo | Edit `src/config/brand.ts` (the tab icon updates from it too) |
| Change pickup times, cutoff, closed days, the banner, order limits, or your password | **Settings** page in the staff dashboard |
| Put something on sale, make a "buy 2, get 1 free" deal, or a bundle | **Deals** page. Turn on **Deal of the day** to show it big at the top of the menu. |
| Change points per $1, the rewards students can get, or someone's points | **Rewards** page |
| Approve a teacher, turn one off, change the teacher price (cost + 50¢) or turn room service off | **Teachers** page |
| Change the class hours teachers pick for room service | **Settings** page → Class hours |
| Make a pick-your-own combo ("chips + a soda for $2.50") | **Deals** page → New combo |
| See what students want us to sell, and answer ("Coming soon", "Now selling") | **Requests** page |
| Make a fresh sample InTouchPay file for testing imports | `npm run sample-csv` (writes `sample-data/intouchpay-sample.csv`) |
| Change the database | Add a **new** file in `supabase/migrations/`. Never edit old ones; they have already run. Then run `npm run db:bundle` and `npm run db:types`, and apply it (see below). |
| Check for mistakes before pushing | `npm run typecheck`, `npm run lint` and `npm test` |
| Add a new product to the 3D store | Nothing to do: it shows up in the right section by itself (as a plain labelled box). For a real 3D look, upload a straight-on photo on a plain white background and ask for its model to be built (see **The 3D store** below). |

### Applying a database update

When a new file shows up in `supabase/migrations/` (after a `git pull`), your Supabase database needs it too. Use either method:

- **SQL Editor (works on any Wi-Fi):** open the matching file in `supabase/sql-editor/`, copy all of it, paste it into Supabase → **SQL Editor** → **New query**, and click **Run**. It should end with a message like *Update … is done!* If you see *already run*, you're up to date.
- **Terminal:** `npx supabase db push --linked`

Run updates in order (they're numbered) and only once each. The SQL Editor files refuse to run twice, so a double-click is safe.

### The home page

The home page opens on a blurred drone view of the 3D store with the store's name and an **Enter 3D world** button
(the photos are `public/hero/store-drone*.webp`, taken from the 3D store). Under it: the info strip, **Shop by aisle**
cards (each jumps to that tab of the shop; the Deals card opens the deals page), how ordering works, **The cooler**
(every drink in 3D: swipe or use the arrow keys to go through them), the full shop with category tabs, and one more way into the 3D store plus rewards.

**Product pictures** come from the 3D models: `public/products/3d/<product>.webp`, every drink at the same scale so a
can looks smaller than a bottle. A product without a model shows its uploaded photo (or its emoji). After adding a
model, run `npm run dev` and then `node scripts/render-products.mjs` to draw the new pictures.

### The deals page

**/deals** (the yellow **Deals** tag in the top bar) puts every money-saver on one page: the deal of the day, combos, bundles,
sale prices, coupons (buy X, get Y free; they come off in the cart by themselves), member prices with a sign-up button
for guests, and the rewards you can spend points on. Each part only shows when there is something in it. Everything on
it is set up in **Admin → Deals** and **Admin → Rewards**. Code: `src/components/public/deals/deals-page.tsx`.

A link like `/#shop-Drinks` opens the shop on the home page with that tab picked (the coupons use it).

### Teachers and room service

Teachers go to **/teacher** (there's a link in the footer) and request an account with their name, room number,
school email and a password. There's no email code to type: the request goes straight to you. Requests show up on the **Teachers** page in the staff dashboard (the sidebar shows how
many are waiting); tap **Approve**. Approved teachers:

- pay **what the item cost the store + 50¢** (never more than the normal price). Teachers never see the "+ 50¢": their page just shows the crossed-out normal price, their price, and how much % off. A product with no cost saved stays
  at its normal price, so keep costs filled in (Products, or by logging shopping trips in Expenses). The Teachers
  page warns you when some are missing.
- get **room service**: at checkout they pick their room and a class hour (Settings → Class hours), and a student
  brings the order to their room. They pay when it's delivered. Room service orders show a black **Room service →
  Room ###** label in the order queue, are grouped under their class hour, and the prep list prints the room on each slip.
- can order after the students' same-day cutoff (they still need the usual lead time).
- don't get combos, buy-X-get-Y deals, rewards or points (their prices are already close to cost).

### Combos

A combo is a pick-your-own deal, like **chips + a soda for $2.50** or **2 candies + a soda for $5**. Each combo has
parts; a part is filled by any product from a list, or by anything in a category. Students pick what goes in each
part on the **/deals** page (or the shop's Deals tab), and the cart spots the combo and takes the difference off by
itself, as many times as it fits and only when it actually saves money. The two combos above were made by update 11;
the "soda" part is the $2 sodas, which you can change on the Deals page.

### Item requests

Students and teachers can ask the store to sell something at the **request table** in the 3D store (front left, just
inside the doors: Ash sits there at a computer with a coffee, under floating "REQUEST ITEMS" letters) or in the
"Can't find it? Ask for it." box near the bottom of the home page. They type the item and, if they like, what kind it
is, a flavor or size, and their first name. They also see what others have asked for and can tap **+1 me too**.

The **Requests** page in the staff dashboard groups requests for the same thing (different spellings and capitals
count together), most asked first, with how many this week, people's notes, where they came from (3D store or
website, students or teachers) and what kinds of things people want. Give each item a status: **Coming soon** and
**Now selling** show next to it for students; **Not doing** hides it from the "others are asking for" list. One device
can send up to 8 requests an hour, and asking for the same thing twice in a day counts once.

### The staff dashboard look

The staff pages use a "back room" look: manila ledger paper, receipt-style order cards, rubber-stamp statuses and a
hand-drawn sales sketch on the dashboard. The colors and fonts are at the end of `src/app/globals.css` (search for
"The back room") and in `src/app/admin/fonts.ts`; the dashboard is `src/app/admin/page.tsx`.

### The 3D store

The 3D store is at **/store**. It opens on a drone view of a cartoon shop with a parking lot, in the middle of a small
town. A big **CLICK TO ENTER** button drops you in the parking lot, right in front of the double doors. Walk with
**WASD / the arrow keys** (A and D step sideways, ← → turn, Shift to run): the doors **open by themselves** as you walk
up and shut again once you're far enough away. (Tapping the doors from the drone view flies you straight in.) Inside,
white floor arrows walk you around too: the **deals board** (left, by the doors), the **request table**, the **drinks
fridge**, the **snack shelf** and the **candy stand**, with three checkout lanes on the right. Drag to look around (a
**Back** button takes you to where you were); walking up to a section makes its products tappable. You can't walk
through walls, shelves, houses, trees or cars.

Outside, the town has streets with sidewalks and street lights, rows of houses (just to look at), trees and bushes,
people walking on the sidewalks and cars driving round the blocks. **Walk up to a parked car and press E** (or tap
"Drive this car") to drive it: W / ↑ gas, S / ↓ brake (hold it to reverse), A D or ← → steer, **E** or **Get out** to
get out. To **drift**, pull the handbrake (Space) while you turn, or floor it and steer hard above about 57 mph: the back
steps out, the car swings round and the back tyres smoke. Keep steering to hold the slide, let go or steer the other
way to straighten up. A speedometer in the corner goes up to 100 mph; the brake lights come on when you
brake, reverse lights when you back up, and traffic brakes for you (and for anyone walking in the road). Phones get
on-screen arrows for walking and driving.

**The city.** East of the town (drive out of the lot and turn right along the main road, or use **Go to…**, top
right) is a big city: a grid of busy streets with zebra crossings, giant glass skyscrapers, a park with a fountain, a
blimp, crowds on the sidewalks and lots of traffic (sedans, hatchbacks, SUVs, pickups and yellow taxis).

**The map.** The main road runs west to **Firebird International** (the airport: runway with markings and lights,
taxiway, apron, a terminal you can walk through with check-in desks and a departures board, the control tower, a hangar
and a parked airliner) and east to the **County Correctional Facility** (the jail). North of everything are **the
mountains** (snowy peaks, pine forests, and a winding mountain road with guard rails up to a hidden valley). South of the
town, **Willow Lane** runs down to the gated community of **Crescent Heights**.

**You.** Walk with WASD, run with Shift, **jump** with Space, and press **V** (or use the mouse wheel) to zoom out to
**third person** and back. Your hunger runs down over about 18 minutes: eat on Restaurant Row or you'll start starving
and pass out (you wake up at home, or the store, without the cash you were carrying). Press **I** for your **wallet**:
your city ID card (name, ID number, address), cash, bank card, car keys (with "Bring it here"), house keys, jobs and
anything you've pickpocketed.

**Vehicles.** Any parked car: walk up and press E. Each model drives differently (top speed, acceleration and grip
come from `vehicles.ts`), motorbikes lean into corners, and the speedometer goes up to the vehicle's top speed. At the
airport there are two **planes** (W/S throttle, A/D bank and turn, Space pull up, Shift dive; take off past 55 mph) and
two **helicopters** (Space/Shift up and down, W/S forward and back, A/D turn). Jump out mid-air (E) and press Space to
open your **parachute**; hit the ground too fast without one and that's it. Crash hard and the aircraft burns, then
respawns.

**Robbing the bank and the jewelry shop** (now at opposite corners of the city). In **City Bank**, **R** at the counter
sets it off: alarm lights spin, the tellers put their hands up, the drill cracks the vault and the door swings open.
Grab the gold and cash (R), but **jump the lasers** sweeping the vault floor: touching one kills you instantly. In
**Jewels**, smash the cases (R) and time the lifting lasers to grab the Big Rock. The loot isn't yours yet: **get it to
the secret base in the mountains before the timer runs out** (the arrow on the wanted panel points the way: up the
mountain road, to a rock face whose hidden doors slide apart for you, and into the hangar inside the mountain). Too
slow and you dump it. Walk out of a robbed place and it **closes for 30 minutes** (a countdown floats over it).

**The police.** Squad cars chase you with sirens and a helicopter follows with a searchlight (which stops at roofs, it
doesn't shine through buildings). Get out of the car and the officers jump out too, run after you, and **handcuff**
you; you're walked to the car, driven off, and the screen fades to **jail**: an orange jumpsuit and a cell whose door
slides open after 30 seconds. The jail has cell blocks, a gym, a guard room, a lobby and a fenced yard with
watchtowers, and armed guards on patrol. **Sneak up behind a guard and press F to pickpocket their keycard** (get seen
and you're thrown back in your cell): with it, every security door opens. Out through the lobby and you're free.

**Jobs on Restaurant Row** (north-east of the bank): **Slice Society** (pizza), **Polar Scoops** (ice cream), **Bean
There** (coffee), **Smash Stack** (burgers) and **Petal & Stem** (flowers). Walk in and ask for a job application (Q),
fill in the résumé, and it goes to **Admin → City jobs**, where staff hire you (or not). Once you're hired, **clock in**
(R). Customers come in at random (rushes, steady spells and quiet times), order at the kiosk by the door and wait at
the counter. **Take their order** on the screen on the counter, then at the prep table **make it by hand**: pizzas
(size, sauce, cheese, then tap the toppings onto the pizza and bake it in the wood-fired oven, taking it out when it's
golden), ice cream (cone or cup, the scoops in order, then hold to scoop each one), coffee (drink, size, milk, syrup,
topping, then pull the espresso shot), burgers (bun, patties, toppings, sauce, then grill and flip each patty) and
bouquets (flowers, wrapping, ribbon, card, then trim the stems). Hand it over at the counter. Every customer has a
patience bar: too slow and they walk out, and **three walkouts in a shift gets you fired**. Pay starts at **$15.50 an
hour** (an hour of shift time is 40 seconds), paid into your bank when you clock out, plus tips for good, fast food;
serve enough happy customers and you're **promoted** (Crew Member, Senior Crew, Shift Lead, Assistant Manager, Store
Manager: up to $30 an hour). When nobody's working a shop, an NPC works it. When you're not on shift you can buy food
there (it fills you up).

**Apex Motors** (the glass showroom by the bank) sells 20 cars and bikes you won't see on the roads, at real-world
prices: motorcycles from a $4,299 scooter to a $34,500 superbike, sedans, SUVs, a pickup, sports cars and supercars up
to a $3,000,000 hypercar. The pricier, the faster (top speed and 0–60 are real-ish). Browse on the big screen (E), spin
the 3D preview, pick a colour and buy it; it waits in the lot outside and stays wherever you park it.

**Homes.** At **Keystone Realty** (on the avenue behind Restaurant Row), talk to the agent (E) to see every home for
sale, from **$150,000** (Sparrow Cottage) to **$20,000,000** (the Crescent Crown), bigger as they get pricier. Every
home gets a **tour** first: the camera sweeps round the outside, in through the front door, the living room, kitchen,
bedroom and up over the grounds (pools, tennis courts, a helipad…). Then buy it: the door opens for you, the keys are in
your wallet, and you wake up there. The million-dollar homes are inside **Crescent Heights**, behind a stone wall: the
guard at the gatehouse asks for your ID and only lets residents in. The town's ordinary houses come in five styles
(classic, two-storey, modern, bungalow, farmhouse), some with garages.

**Your game is saved**: signed in, to your account (cash, bank, cars, homes, jobs; database update 13), otherwise in
this browser. **City money** is pretend US dollars for the 3D world only: it has nothing to do with the real shop and
can't be spent at checkout. The speaker button on the money badge mutes the sound effects.

Where things are (all in `src/components/public/world/`): the big map is `world-map.ts`; the mountains, road and base
are `terrain.ts` and `mountains.tsx`; people are `humanoid.tsx`; cars are `car-model.tsx`, `vehicles.ts` (models and
prices), `fleet.ts` and `drive.tsx`; aircraft `flight.tsx`; robberies `heist.ts` and `city-sites.tsx`; police
`police-state.ts` and `police.tsx`; the jail `jail-layout.ts`, `jail-state.ts` and `jail.tsx`; the walk-in buildings
`rooms.ts` and `buildings.tsx`; jobs `menus.ts`, `jobs.ts` and `job-panels.tsx`; the dealership `dealer.ts`,
`dealer-panel.tsx` and `showroom.tsx`; homes `houses-layout.ts`, `home-models.tsx`, `realty.ts` and `realty-panel.tsx`;
the airport `airport.tsx`; your money and save `profile.ts`; hunger `life.ts`; and the buttons over the world
`city-hud.tsx`. Job applications are reviewed in `src/app/admin/jobs`.

Everything is to the same scale: you're the size of the people walking about, with your eyes just above a car's roof,
and the store is a real-size shop next to the cars. (The store is built in its own bigger units and drawn shrunk by
`STORE_SCALE` in `world-layout.ts`.) The **Checkout** button only shows while you're inside the store.

Where things are: the store's size and what stands where is in `src/components/public/world/world-layout.ts`; the town
(streets, houses, trees, people, traffic routes) is in `town-layout.ts` and drawn by `town.tsx`; the car physics
(speed, brakes, steering, skids) is in `car-physics.ts` with tests next to it; driving is in `drive.tsx`, traffic in
`traffic.tsx`, the speedometer in `speedometer.tsx`, and what you can bump into in `bump.ts`. Tap a fridge door to open just that door, then tap a
drink to add it. The **Checkout** button at the bottom glides you to lane 1: your items go down the belt, get scanned
(the screen on the register shows each one) and dropped in the bag, the screen shows the total, and a sidebar asks for
the pickup info. Once the order is placed, the sidebar shows its number. (`/cart` still works the old way too.) Everything is also in the shop on the home page (the list
button, top right, goes back to the shop on the home page), which is where browsers that can't show 3D go.

Code: `src/components/public/world/` (the building, lot and camera) and `src/components/public/store/` (which product
goes on which shelf, and the product models).

- **Where things stand** (fridge, shelves, lanes, the board, the walking spots and their arrows) is plain numbers in
  `world/world-layout.ts`.
- **What's on the deals board** comes from the deals and bundles you set up in Admin → Deals.
- **Which section a product goes in** is decided by its category and name, in `store/catalog.ts` (e.g. Powerade →
  *Sports drinks*, Twix → *Chocolate*). Hot food goes on the snack shelf. Other categories (like supplies) stay out of the store.
- **Every shelf is always full**: a section with only a few products repeats them, and each product stands 1–3 rows deep.
- **3D models** are made from the product photos, not by hand:
  drinks and cups are their traced outline spun round (`scripts/build-drink-models.py`, `scripts/build-cup-models.py`),
  bags and bars are the cut-out photo puffed out (`scripts/build-snack-models.py`). Cookies, Cosmic Brownie, Honey Bun
  and Zebra Cakes had food photos instead of packaging, so their packages were generated once with Higgsfield.
- **Slower devices** automatically drop the sun's shadows, so the store stays smooth.

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
- Students can't read any table directly. They can call a few read-only database functions (the menu, store info, deals, rewards, price check, and order lookup, which needs the number **and** last name). Orders are placed only through the website's server.
- Rewards members can see only their own account, points and orders. Their account holds their email, name and grade. They can delete it themselves on **My rewards**, which deletes their points too.
- A member's points are only taken or given by database functions, never by the website directly, so they can't be edited from a browser.
- Row Level Security blocks everything else unless you're the admin.
- Orders older than 90 days are deleted automatically every night. The number is a setting.
- Order numbers are counted up (`FN-0001`, `FN-0002`…) and contain no personal information.

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

**Students say the sign-in code never arrives.**
Check [Rewards accounts setup](#rewards-accounts-setup) step 4 (email sender). Supabase → **Authentication → Logs** shows email errors. Codes can also land in spam.

**"That code didn't work."**
Codes only work once and expire after an hour. Use the newest email, or tap **Send a new code**.

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
8. ✅ Rewards accounts, deals, bundles, deal of the day, "New"/"Limited" tags
9. ⬜ Still possible: menu QR code poster, suggestion box with voting
