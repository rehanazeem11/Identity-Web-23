# IDENTITY Living — Backend

Handles what the browser can't be trusted to do itself: creating Razorpay
orders, verifying payments with your secret key, storing orders, and sending
email + WhatsApp confirmations.

## 1. Local setup

```bash
cd server
npm install
cp .env.example .env
# fill in .env with real values — see "Getting credentials" below
npm run dev
```

Server starts on `http://localhost:4000`. Check it's alive:
`curl http://localhost:4000/api/health`

## 2. Getting credentials

**Razorpay** — dashboard.razorpay.com → Settings → API Keys → generate Test
Mode keys first (no real money moves in test mode; use the test card numbers
in Razorpay's docs). Switch to Live keys only once you've tested the full
flow end to end.

**Gmail SMTP** — you need 2-Step Verification ON for the Gmail account, then
Google Account → Security → App Passwords → generate one for "Mail". Use
that 16-character password as `GMAIL_APP_PASSWORD`, not your normal Gmail
password.

**Meta WhatsApp Cloud API** — developers.facebook.com → create an app → add
the WhatsApp product. You'll get a test phone number, a temporary access
token, and a Phone Number ID immediately, which is enough to send yourself
test messages. To message real customers you must additionally:
1. Create a message **template** (Meta Business Manager → WhatsApp Manager →
   Message Templates) and get it approved — this can take from minutes to a
   few days.
2. Set `WHATSAPP_TEMPLATE_NAME` to that template's name.
3. Match `services/whatsapp.js`'s `buildComponents()` to however many
   placeholders your approved template actually has — it currently assumes
   4: customer name, order id, items summary, total.
4. Generate a permanent access token (temporary ones expire in 24h) —
   System Users → Generate Token, with `whatsapp_business_messaging` scope.

Until the template is approved, WhatsApp sends will fail with a clear error
in the server logs — order storage, email, and the payment itself are
unaffected either way.

## 3. Deploying to Render (free tier)

1. Push this `server/` folder to a GitHub repo (or the whole project — Render
   lets you point at a subdirectory).
2. Render dashboard → New → Web Service → connect the repo.
3. Root Directory: `server`
4. Build Command: `npm install`
5. Start Command: `npm start`
6. Add every variable from `.env.example` under Environment → Environment
   Variables (with real values — never commit `.env`).
7. Deploy. Render gives you a URL like `https://your-app.onrender.com`.
8. Set `FRONTEND_ORIGIN` to wherever you actually host the site (or `*`
   temporarily while testing, then lock it down).
9. Update `BACKEND_URL` in `checkout.html` (and the admin dashboard's Orders
   tab) to that Render URL.

**Known limitation:** orders are stored in a JSON file on disk
(`server/data/orders.json`). Render's free tier disk is wiped on every
redeploy (not on ordinary restarts) — fine for getting the flow working, but
before relying on this for real orders, swap `services/orderStore.js` for a
real database (e.g. free-tier Postgres on Supabase/Neon, or MongoDB Atlas).
The rest of the code doesn't need to change — only that one file's read/write
functions.

## 4. Security notes

- `RAZORPAY_KEY_SECRET` never appears anywhere in frontend code — only here,
  server-side. That's what makes payment verification actually secure: a
  payment signature can only be produced by someone who holds the secret.
- Prices for the 4 default products (`products.js`) are looked up
  server-side and the client's price is ignored — someone editing the page
  in devtools can't check out for ₹1. Products added later through the
  admin panel don't have that protection yet, since they only exist in the
  browser's localStorage (no shared database) — see the comment in
  `products.js`.
- `/api/orders` requires an `X-Admin-Key` header matching `ADMIN_API_KEY`.
  This is a shared-secret check, not real auth — adequate for a single-owner
  small store, not for multiple admin users with different permissions.
