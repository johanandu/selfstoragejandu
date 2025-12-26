import type { APIRoute } from 'astro';
import { stripe } from '../../lib/stripe';

export const POST: APIRoute = async ({ request, redirect }) => {
  try {
    const data = await request.json();
    const { unitId, unitName, price, userId } = data;

    if (!unitId || !unitName || !price) {
      return new Response(
        JSON.stringify({ error: 'Brak wymaganych danych' }),
        { 
          status: 400, 
          headers: { 'Content-Type': 'application/json' } 
        }
      );
    }

    // Tworzenie sesji checkout w Stripe
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'p24'],
      line_items: [
        {
          price_data: {
            currency: 'pln',
            product_data: {
              name: `Wynajem ${unitName}`,
              description: `Kontener magazynowy ${unitName}`,
            },
            unit_amount: price * 100, // w groszach
            recurring: {
              interval: 'month',
            },
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${import.meta.env.PUBLIC_APP_URL}/dashboard?success=true`,
      cancel_url: `${import.meta.env.PUBLIC_APP_URL}/?canceled=true`,
      metadata: {
        unitId: unitId.toString(),
        userId: userId || '',
      },
      customer_creation: 'always',
      locale: 'pl',
    });

    if (!session.url) {
      throw new Error('Nie udało się utworzyć sesji Stripe');
    }

    return new Response(
      JSON.stringify({ url: session.url }),
      { 
        status: 200, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Stripe checkout error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Błąd serwera podczas tworzenia sesji płatności' 
      }),
      { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }
};