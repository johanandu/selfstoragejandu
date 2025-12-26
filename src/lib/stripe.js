import Stripe from 'stripe';

const stripeSecretKey = import.meta.env.STRIPE_SECRET_KEY;

export const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2023-10-16',
});

export default stripe;