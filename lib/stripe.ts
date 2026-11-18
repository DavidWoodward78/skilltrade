import Stripe from "stripe";
import { cleanEnv } from "./plans";

let client: Stripe | null = null;
export function stripe(): Stripe {
  const key = cleanEnv(process.env.STRIPE_SECRET_KEY);
  if (!key) throw new Error("Billing isn't set up yet (STRIPE_SECRET_KEY missing).");
  if (!/^(sk|rk)_(test|live)_[A-Za-z0-9]+$/.test(key)) {
    throw new Error("STRIPE_SECRET_KEY doesn't look right. It should start with sk_test_ or sk_live_ and have no spaces.");
  }
  client ??= new Stripe(key);
  return client;
}
