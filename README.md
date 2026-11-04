# Haise Design order and invoice app

Two pages, no build step:

- `index.html` is the customer order form (the page you share with customers).
- `admin.html` is your private page for orders, invoices, receipts and settings.

## Try it right now (demo mode)

Open `index.html` in a browser, submit a test order, then open `admin.html`.
In demo mode everything is saved in that one browser only, so use it for testing.

## Go live for free (about 15 minutes)

**1. Database and file storage: Supabase (free plan)**

1. Sign up at https://supabase.com and create a project (region: Singapore).
2. Open **SQL Editor > New query**, paste all of `supabase-setup.sql`, click **Run**.
3. Open **Authentication > Users > Add user**, create your admin login (your email + a strong password, tick "Auto confirm").
4. Open **Authentication > Sign In / Providers** and turn **off** "Allow new users to sign up", so nobody else can create an admin account.
5. Open **Project Settings > API**, copy the **Project URL** and the **anon public** key into `config.js`.

**2. Hosting: Netlify (free plan)**

1. In Netlify: **Add new site > Import an existing project > GitHub > haise-app**.
2. Leave the build command empty and the publish directory as `.`, then **Deploy**.
3. Your customer link is that address. Your admin page is the same address + `/admin.html`.
4. Every push to `main` goes live automatically.

`netlify.toml` sets a security header that only allows the app's own scripts. That also stops the "Powered by Netlify" badge from appearing.

GitHub Pages or Cloudflare Pages work the same way if you prefer them.

## Free plan limits worth knowing

- Supabase free: 500 MB database, 1 GB file storage. That is thousands of orders, but large reference images add up, so delete old orders' files once a job is done.
- Supabase pauses a free project after 7 days with no visits. Opening admin once a week keeps it awake.

## Jersey types and prices

Customer-facing jersey types, collar options, materials and sizes are in `catalog.js`. Invoice prices come from the order, and the quick-add list is in admin Settings.

## Invoice numbers

Same pattern as your old invoices: year, day, month, then a running number (`26 24 10 19`).
The running number goes up by one each time you save a new invoice or receipt. You can change it in Settings.

## Saving a PDF

Click **Print / Save PDF** and choose **Save as PDF** as the printer. Turn off "Headers and footers" in the print dialog if they appear.
