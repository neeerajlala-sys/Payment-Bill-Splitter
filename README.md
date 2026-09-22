# Bill Splitter with Razorpay verification

The static `index.html` is deployable to GitHub Pages. The backend in `worker.js` is a Cloudflare Worker and stores payment status in Cloudflare KV.

## Deploy the backend

1. Install Wrangler and authenticate: `npm install -g wrangler` then `wrangler login`.
2. Create a KV namespace: `wrangler kv namespace create PAYMENTS` and put its production and preview IDs in `wrangler.toml`.
3. Configure server-only secrets (never place these in `index.html`):

```sh
wrangler secret put RAZORPAY_KEY_ID
wrangler secret put RAZORPAY_KEY_SECRET
wrangler secret put RAZORPAY_WEBHOOK_SECRET
```

4. Deploy: `wrangler deploy`.
5. In the Razorpay Dashboard, configure a webhook URL of `https://YOUR_WORKER.workers.dev/webhook/razorpay`, use the exact same webhook secret, and enable `payment.captured` (also enable `payment_link.paid` if available).
6. Open the GitHub Pages site and enter the Worker URL in **Backend API URL**. Do not put the Razorpay secret or webhook secret there.

## Notes

- The frontend calls only the Worker. Razorpay credentials stay in Worker environment secrets.
- QR codes contain the Razorpay hosted payment URL, not a raw UPI payload.
- Webhook signature verification uses the raw request body and HMAC-SHA256 before changing KV state.
- `payment_link.paid` is handled in addition to `payment.captured`, because it directly identifies the Payment Link. The backend also accepts a payment link ID supplied by supported `payment.captured` payloads.
- For production, restrict CORS to your GitHub Pages origin instead of `*`, and consider adding rate limiting/authentication to link creation.
