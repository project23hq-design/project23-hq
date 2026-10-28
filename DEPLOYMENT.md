# Project23 — Deployment Setup Guide

Project23 goes live as one Next.js website on Vercel or Netlify, talking to a hosted Supabase database, with Paystack for payments and Resend for email. Expect roughly $45–65 a month to start, plus Paystack's cut of each sale. Paystack's business verification is the slowest part (days to weeks), so start it first.

## Overview

| Service  | What it does for Project23                              | Plan                               | Approx. cost                                                                    |
| -------- | ------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------- |
| Vercel or Netlify | Hosts the website and API routes | Pro on either (needed for a London server) | ~$20/month                                                      |
| Supabase | Database, logins, MFA, image storage, the job scheduler | Pro                                | ~$25/month (point-in-time backups are a paid add-on)                            |
| Paystack | Card and bank payments, refunds, payouts                | Pay as you go                      | ~1.5% + ₦100 per local payment, capped at ₦2,000 (₦100 waived under ₦2,500) |
| Resend   | Ticket and order emails                                 | Free to start                      | Free up to ~3,000 emails/month, then ~$20/month                                 |
| Domain   | Project23 address, email sending domain                 | Any registrar                      | ~$10–20/year                                                                    |

Prices are approximate and from memory, so check each provider's pricing page before you sign up.

Order to do things in:

1. Today: start Paystack business verification (Step 2). It runs in the background while you do the rest.
2. Buy the domain (Step 3).
3. Set up the Supabase database and load the reference data (Step 1).
4. Set up Resend email on the domain (Step 4).
5. Deploy to Vercel or Netlify and start the scheduler (Step 5).
6. Create your admin account and turn on MFA (Step 6).
7. Test everything with Paystack test keys, then switch to live keys (Step 7).

## Checklist: what you need

**Accounts**

- [x] GitHub repo (`project23hq-design/project23-hq`)
- [ ] Vercel or Netlify account, signed in with that GitHub
- [ ] Supabase account
- [ ] Paystack business account
- [ ] Resend account
- [ ] A domain name (e.g. project23.ng or project23.app)

**Business documents for Paystack**

- [ ] CAC registration (business name or company)
- [ ] Directors' BVN and ID
- [ ] Settlement bank account in the business name
- [ ] Written OK from Paystack that you can collect for organizers and pay them out later (the "marketplace" model). If they say no, the code needs switching to Paystack subaccount splits.
- [ ] Paystack Transfers turned on (needed for automatic organizer payouts; without it, payouts stay manual)

**Keys and secrets** (all go into your host's settings, never into git)

- [ ] Supabase project URL
- [ ] Supabase anon (public) key
- [ ] Supabase service role key
- [ ] Paystack secret key: `sk_test_…` first, `sk_live_…` at launch
- [ ] Resend API key
- [ ] Three random secrets you generate yourself: `TICKET_QR_SECRET`, `COOKIE_SIGNING_SECRET`, `JOB_RUNNER_SECRET`

**Legal** (before taking real money)

- [ ] Lawyer review of the `/legal` pages (all marked draft)
- [ ] NDPA 2023 data-protection assessment
- [ ] Accountant's view on VAT on platform fees and tax on promoter commissions

## Step 1: Supabase (database and logins)

You end this step with an empty production database that has all the tables and security rules, plus the cities, categories and the 5% fee. About 30 minutes. **Never run the full `seed.sql` here:** it creates the demo accounts with the shared password.

1. Go to supabase.com → New project.
   - Name: `project23-prod`
   - Region: London (eu-west-2). There is no African region, and London is closest to Nigeria.
   - Database password: generate a strong one and save it in a password manager.
2. Upgrade the project to Pro (Billing). You need it for daily backups, leaked-password protection and normal email limits.
3. On your Mac, in the project folder, link and push the database structure:

   ```bash
   pnpm exec supabase login
   pnpm exec supabase link --project-ref YOUR_PROJECT_REF
   pnpm exec supabase db push
   ```

   The project ref is the random ID in your Supabase dashboard URL. `db push` asks for the database password from step 1. It applies all 11 migrations, including the image storage buckets.

4. Load the reference data. Open `supabase/seed.sql` and copy everything from the top down to (not including) the `Local test users` heading, about the first 50 lines. Paste it into Supabase → SQL Editor and run it. That adds currencies, countries, Osun and other states, the cities, the 9 categories and the 5% platform fee. Without it nobody can create an event.
5. Check Storage shows three buckets: `event-media`, `org-logos`, `org-private`.
6. Authentication → URL Configuration (fill in once you have the domain):
   - Site URL: `https://YOUR-DOMAIN`
   - Redirect URLs: add `https://YOUR-DOMAIN/**`
7. Authentication → Sign In / Providers → Email:
   - Confirm email: on
   - Minimum password length: 10
   - Leaked password protection: on
8. Authentication → Multi-Factor: TOTP (authenticator app) enabled. The admin area refuses to open without it.
9. Authentication → Emails → SMTP Settings: turn on custom SMTP after Step 4 (Resend). Supabase's built-in email only sends a few emails an hour, so sign-ups will stall without it.
10. Database → Extensions: turn on `pg_cron` and `pg_net`. Step 5 uses them for the job scheduler.
11. Project Settings → API: copy the Project URL, the `anon` public key and the `service_role` key into your password manager. The service role key bypasses all security rules, so it only ever goes into your host's settings (Vercel or Netlify).

## Step 2: Paystack (payments)

You end this step with test keys that work today and live keys once Paystack approves the business. Approval can take days to weeks, so start now.

1. Sign up at paystack.com as a Nigerian business.
2. Settings → Business: upload the CAC documents, directors' BVN and ID, and add the settlement bank account. Submit for activation.
3. Email Paystack support before you go live and ask three things:
   - Is it OK for Project23 to collect ticket money for organizers and pay them out later (a marketplace)? Get the answer in writing.
   - Please enable Transfers on the live account (for automatic organizer payouts).
   - Can OTP be turned off for API transfers? If not, payouts are approved by hand in the Paystack dashboard.
4. Settings → API Keys & Webhooks, with the Test mode switch on:
   - Copy the Test Secret Key (`sk_test_…`).
   - Test Webhook URL: `https://YOUR-DOMAIN/api/webhooks/paystack`
   - Leave Callback URL empty. The app sends its own return address with each payment.
5. Later, when Paystack activates the account, switch Test mode off and repeat step 4 for live:
   - Copy the Live Secret Key (`sk_live_…`).
   - Live Webhook URL: the same address.

In your host's settings (Step 5) set `PAYMENT_PROVIDER=paystack` and `PAYSTACK_SECRET_KEY` to the test key first. The app reads the key prefix and marks orders as test or live by itself. The public key (`pk_…`) is not needed.

## Step 3: Domain and DNS

You end this step owning the domain and knowing where to add DNS records. Your host (Vercel or Netlify) and Resend each give you a few records to paste in.

1. Buy the domain. A `.ng` or `.com.ng` needs a NiRA-accredited registrar (e.g. Whogohost). A `.com` or `.app` works at Namecheap or Cloudflare.
2. Keep the registrar's DNS page open. You'll add these records in Steps 4 and 5:

| Record                          | For                          | Where the value comes from              |
| ------------------------------- | ---------------------------- | --------------------------------------- |
| A on `@` (root domain)          | The website                  | Your host's domain settings (Step 5)    |
| CNAME on `www`                  | The website                  | Your host, same page                    |
| MX and TXT (SPF) on `send`      | Sending email                | Resend → Domains                        |
| TXT on `resend._domainkey` (DKIM) | Proving email is yours     | Resend → Domains                        |
| TXT on `_dmarc`                 | Spam protection              | Type it yourself: `v=DMARC1; p=none;`   |

Copy record values exactly as your host and Resend show them, since they can differ per account.

## Step 4: Resend (email)

You end this step able to send ticket emails and login emails from your own domain. About 20 minutes plus DNS waiting time (usually under an hour).

1. Sign up at resend.com.
2. Domains → Add Domain → your domain. Region: Ireland (eu-west-1).
3. Add the DNS records Resend shows (see the Step 3 table), then click Verify. Wait until it says Verified.
4. API Keys → Create: name `project23-app`, permission Sending access, domain your domain. Copy it, as it is only shown once.
5. Create a second key the same way, named `supabase-smtp`.
6. In Supabase → Authentication → Emails → SMTP Settings, turn on custom SMTP:
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: the `supabase-smtp` key
   - Sender email: `no-reply@YOUR-DOMAIN`
   - Sender name: `Project23`

In your host's settings (Step 5) set `EMAIL_PROVIDER=resend`, `RESEND_API_KEY` to the `project23-app` key, and `EMAIL_FROM` to `Project23 <tickets@YOUR-DOMAIN>`.

## Step 5: Hosting (Vercel or Netlify) and the job scheduler

You end this step with the site live on your domain and a scheduler running every minute. The scheduler sends ticket emails, expires unpaid holds, runs refunds and payouts, and re-checks payments. Without it, buyers pay but never get their tickets by email.

Pick one host. Either works, and neither is faster for Nigerian users: every page waits on the database in London, so what matters is putting the website's server in London too.

|                                | Vercel                                          | Netlify                                                   |
| ------------------------------ | ----------------------------------------------- | --------------------------------------------------------- |
| Plan you need                  | Pro, ~$20/month per member (free plan is non-commercial) | Pro, ~$20/month (the free plan's servers are in Ohio, USA) |
| Server in London               | Yes (`lhr1`)                                    | Yes (`lhr`), Pro plan only                                |
| Time limit per request         | 60 seconds (set by the app)                     | 60 seconds (fixed)                                        |
| Next.js support                | Made by the Next.js company; new versions first | Through Netlify's adapter; this repo not yet tried there  |

Prices are approximate, so check the pricing pages. Both may decline Nigerian Naira cards; a dollar card (domiciliary account, Grey, Chipper) usually works.

### 5a. Make the secrets and list the variables

Make the three secrets on your Mac. Run this three times and use a different output for each:

```bash
openssl rand -base64 48
```

These are the environment variables for either host. Steps 5b and 5c say where they go.

| Name                            | Value                                     | Secret? |
| ------------------------------- | ----------------------------------------- | ------- |
| `APP_ENV`                       | `production`                              |         |
| `NEXT_PUBLIC_APP_URL`           | `https://YOUR-DOMAIN` (no trailing slash) |         |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase Project URL                      |         |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key                         |         |
| `SUPABASE_SERVICE_ROLE_KEY`     | Supabase service_role key                 | Yes     |
| `PAYMENT_PROVIDER`              | `paystack`                                |         |
| `PAYSTACK_SECRET_KEY`           | `sk_test_…` now, `sk_live_…` at launch    | Yes     |
| `EMAIL_PROVIDER`                | `resend`                                  |         |
| `RESEND_API_KEY`                | Resend `project23-app` key                | Yes     |
| `EMAIL_FROM`                    | `Project23 <tickets@YOUR-DOMAIN>`         |         |
| `TICKET_QR_SECRET`              | Secret 1                                  | Yes     |
| `COOKIE_SIGNING_SECRET`         | Secret 2                                  | Yes     |
| `JOB_RUNNER_SECRET`             | Secret 3                                  | Yes     |
| `LOG_LEVEL`                     | `info`                                    |         |

Don't set `TEST_PROVIDER_SECRET` in production. **Never change `TICKET_QR_SECRET` after launch:** every QR code already issued would stop working. The app refuses to start if a value is missing, so check the deploy log if the site shows an error. If you change any `NEXT_PUBLIC_` value later, redeploy, as they're baked in at build time.

### 5b. Option A: Vercel

1. vercel.com → Add New → Project → import `project23hq-design/project23-hq`. If the repo isn't listed, install the Vercel GitHub app on the `project23hq-design` account.
2. On the import screen:
   - Framework: Next.js
   - Root Directory: `apps/web`
   - Leave the build and install commands on default. Vercel picks up pnpm from the lockfile.
3. Before deploying, add every variable from 5a under Environment Variables, ticking **Production** only. Tick Sensitive on the rows marked Yes.
4. Settings → Functions → Region: London (`lhr1`).
5. Deploy. When it finishes, open `https://…vercel.app/api/health` and `/api/ready`. Both should load without an error.
6. Settings → Domains → add `YOUR-DOMAIN` and `www.YOUR-DOMAIN`. Add the DNS records Vercel shows at your registrar. Vercel issues the HTTPS certificate by itself.

### 5c. Option B: Netlify

1. Upgrade your Netlify team to Pro first. Without it you can't move the server to London.
2. app.netlify.com → Add new project → Import an existing project → GitHub → `project23hq-design/project23-hq`. If the repo isn't listed, give the Netlify GitHub app access to the `project23hq-design` account.
3. Build settings (Netlify may offer to pick the app from the monorepo; choose `apps/web`):
   - Base directory: leave empty
   - Package directory: `apps/web`
   - Build command: `pnpm --filter @project23/web build`
   - Publish directory: `apps/web/.next`

   Netlify spots Next.js and adds its Next.js adapter by itself.

4. Before deploying, Project configuration → Environment variables: add every variable from 5a with scope All. Tick "Contains secret values" on the rows marked Yes. Also add `NODE_VERSION` = `22`.
5. Cloud compute → Functions → Region: EU (London) `lhr`.
6. Deploy. When it finishes, open `https://…netlify.app/api/health` and `/api/ready`. Both should load without an error.
7. Sign in on the `…netlify.app` address and open `/organizer` and `/super-admin`. Netlify runs the app's sign-in check (`proxy.ts`) in a slightly different way from Vercel, so make sure you're let in and sent to sign-in when signed out.
8. Domain management → Add a domain → `YOUR-DOMAIN`. Add the DNS records Netlify shows at your registrar. Netlify issues the HTTPS certificate by itself.

### 5d. Start the scheduler

Use Supabase's built-in cron for this, whichever host you picked. (Vercel Cron can't be used, because it sends GET requests and the tick endpoint only accepts POST.) You turned on `pg_cron` and `pg_net` in Step 1. In Supabase → SQL Editor, run this once, with your real secret and domain:

```sql
select vault.create_secret('PASTE_JOB_RUNNER_SECRET', 'job_runner_secret');

select cron.schedule('project23-tick', '* * * * *', $$
  select net.http_post(
    url := 'https://YOUR-DOMAIN/api/jobs/tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'job_runner_secret')
    ),
    timeout_milliseconds := 60000
  );
$$);
```

Check it after a few minutes in Supabase → Integrations → Cron: runs should show as succeeded. The secret sits in Supabase Vault, not in the SQL text.

## Step 6: Your admin account and the Project23 organization

You end this step able to open `/super-admin` on the live site. Your local admin login and authenticator don't carry over: production starts with zero accounts. There is deliberately no button that makes someone an admin, so it's done once in SQL.

1. On the live site, sign up with your real email and a strong, unique password (not the local test password). Click the confirmation link in the email.
2. Supabase → Authentication → Users: find your email and copy the User UID.
3. Supabase → SQL Editor, replace `YOUR_USER_UID` in both places and run:

   ```sql
   insert into public.platform_role_assignments (user_id, role)
   values ('YOUR_USER_UID', 'super_admin');

   insert into public.audit_logs (actor_kind, action, entity_type, entity_id, reason, metadata)
   values ('system', 'platform_role.grant', 'user', 'YOUR_USER_UID',
           'initial production admin', '{"role":"super_admin"}');
   ```

4. On the site, go to `/account/security` and set up an authenticator app (Google Authenticator, 1Password or similar). Add it on a second device too, so losing your phone doesn't lock you out.
5. Sign out, sign back in, enter the 6-digit code, and open `/super-admin`.
6. Create the Project23 organization at `/organizer/new`. Then mark it as first-party in SQL (use the slug you chose):

   ```sql
   update public.organizations set is_first_party = true where slug = 'project23';
   ```

The 5% platform fee from Step 1 applies to every organization. Change it later at `/super-admin/fees`.

## Step 7: Go-live test, then switch to live money

You end this step knowing every flow works on the real site with fake money, then with one real ₦100 ticket. This is the first time the Paystack and Resend code runs against the real services, so expect to find a bug or two here.

### 7a. Full test with Paystack test keys

- [ ] Sign up a second account (a different email) as an organizer. Create an organization and an event with a ₦1,000 ticket, then click Publish event.
- [ ] In a private browser window, open the event and buy one ticket as a guest. Use Paystack's test card: `4084 0840 8408 4081`, CVV `408`, any future expiry, PIN `0000`, OTP `123456`.
- [ ] You land back on Project23 and see the ticket with its QR code. The ticket PDF downloads.
- [ ] The ticket email arrives within about 2 minutes (it's sent by the scheduler).
- [ ] Paystack dashboard (test mode) → Transactions shows the payment, and the webhook shows as delivered.
- [ ] `/super-admin/orders` shows the order as paid, with its fee split.
- [ ] On your phone, open `/gate`, pick the event and scan the QR. It checks in. Scan again: it says already used.
- [ ] Refund the order from the organizer's Orders page. The refund shows in Paystack and the buyer gets an email.
- [ ] Request a password reset and use the link. Sign up a new account and confirm the email link works.
- [ ] `/super-admin/jobs` shows no dead jobs.

### 7b. Switch to live money

Only once Paystack has activated the business, confirmed the marketplace model in writing, and the legal checks are done.

1. Paystack (Test mode off) → set the live webhook URL to `https://YOUR-DOMAIN/api/webhooks/paystack`.
2. In your host's environment variables, change `PAYSTACK_SECRET_KEY` to the `sk_live_…` key, then redeploy.
3. Make a ₦100 ticket, buy it with your own card, check the email and the gate scan, then refund it.
4. Unlist or cancel the test events from 7a so the public never sees them.

## After launch

Once live, the routine is: push code to deploy, check the jobs page daily, and reconcile money weekly.

**Shipping updates**

- Push to `main` on GitHub and your host deploys automatically.
- If the change adds a file in `supabase/migrations`, run `pnpm exec supabase db push` before the deploy goes out.

**Keeping an eye on it**

- Daily: `/super-admin/jobs` should have no dead jobs or failed emails.
- Weekly: compare the Paystack balance with `/super-admin/finance`.
- Set up a free uptime check (e.g. Better Stack or UptimeRobot) on `https://YOUR-DOMAIN/api/ready`.
- Errors show in your host's logs (Vercel → Logs, or Netlify → Logs → Functions). Each request carries a correlation ID you can search for.
- Once sales are steady, add Supabase's point-in-time recovery so you can restore to any minute, not just last night.

**Security**

- Keep the GitHub repo private. The demo password is in `seed.sql`. It can't log into production, but there's no reason to publish it.
- Keep production keys only in your host's settings and your password manager, never in a file in the repo.
- Keep platform admins to one or two people, each with MFA on two devices.

**Not tested yet** (Step 7 is the first real run)

- The Paystack code has never run against Paystack itself, only a local stand-in. Refunds, payouts and disputes need checking with test keys.
- Resend has never sent a real email.
- Supabase sign-up and password-reset emails weren't tested end to end.
- Camera QR scanning needs HTTPS and a real phone, so it's only testable once the site is live.
- There's no upload screen for organization logos yet (posters work).
