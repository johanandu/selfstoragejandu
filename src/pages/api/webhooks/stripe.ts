import type { APIRoute } from 'astro';
import { stripe } from '../../lib/stripe';
import { supabaseAdmin } from '../../lib/supabase';
import { fakturownia } from '../../lib/fakturownia';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.text();
    const sig = request.headers.get('stripe-signature');
    const webhookSecret = import.meta.env.STRIPE_WEBHOOK_SECRET;

    if (!sig) {
      console.error('Missing Stripe signature');
      return new Response('Missing signature', { status: 400 });
    }

    // Weryfikacja autentyczności webhooka
    let event;
    try {
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return new Response('Invalid signature', { status: 400 });
    }

    // Obsługa różnych typów zdarzeń
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        console.log('Processing checkout.session.completed');
        
        const unitId = session.metadata?.unitId;
        const userId = session.metadata?.userId;
        const customerId = session.customer;
        const subscriptionId = session.subscription;

        if (!unitId || !subscriptionId) {
          console.error('Missing required metadata:', { unitId, subscriptionId });
          return new Response('Missing metadata', { status: 400 });
        }

        try {
          // Pobierz dane subskrypcji z Stripe
          const subscription = await stripe.subscriptions.retrieve(subscriptionId as string);
          
          // Sprawdź, czy subskrypcja już istnieje (idempotency)
          const { data: existingSubscription } = await supabaseAdmin
            .from('subscriptions')
            .select('id')
            .eq('stripe_subscription_id', subscriptionId)
            .single();

          if (existingSubscription) {
            console.log('Subscription already exists, skipping creation');
            return new Response('OK', { status: 200 });
          }

          // Aktualizuj status kontenera na "occupied"
          const { error: unitError } = await supabaseAdmin
            .from('units')
            .update({ 
              status: 'occupied',
              updated_at: new Date().toISOString()
            })
            .eq('id', parseInt(unitId));

          if (unitError) {
            console.error('Error updating unit status:', unitError);
          }

          // Znajdź lub stwórz profil użytkownika
          let profileId = userId;
          
          if (userId && userId !== 'undefined') {
            // Użytkownik już istniał w systemie
            const { error: profileError } = await supabaseAdmin
              .from('profiles')
              .update({
                stripe_customer_id: customerId as string,
                updated_at: new Date().toISOString()
              })
              .eq('id', userId);

            if (profileError) {
              console.error('Error updating profile:', profileError);
            }
          } else {
            // Nowy użytkownik - utwórz profil na podstawie danych z Stripe
            const customer = await stripe.customers.retrieve(customerId as string);
            
            if (customer.deleted) {
              throw new Error('Customer was deleted');
            }

            const { data: newProfile, error: profileError } = await supabaseAdmin
              .from('profiles')
              .insert({
                id: customer.id, // Użyj ID z Stripe jako ID użytkownika
                email: customer.email,
                full_name: customer.name || '',
                phone_number: customer.phone || '',
                stripe_customer_id: customerId as string,
                created_at: new Date().toISOString(),
              })
              .select('id')
              .single();

            if (profileError) {
              console.error('Error creating profile:', profileError);
              // Kontynuuj mimo błędu - może to być duplikat
            }

            profileId = newProfile?.id || customer.id;
          }

          // Stwórz wpis o subskrypcji
          const { error: subError } = await supabaseAdmin
            .from('subscriptions')
            .insert({
              user_id: profileId,
              unit_id: parseInt(unitId),
              stripe_subscription_id: subscriptionId as string,
              status: 'active',
              current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
              created_at: new Date().toISOString(),
            });

          if (subError) {
            console.error('Error creating subscription:', subError);
            throw subError;
          }

          // Generuj fakturę VAT
          try {
            const customer = await stripe.customers.retrieve(customerId as string);
            const { data: unit } = await supabaseAdmin
              .from('units')
              .select('name, price_monthly')
              .eq('id', parseInt(unitId))
              .single();

            if (unit && customer.email) {
              await fakturownia.createInvoice({
                clientName: customer.name || customer.email,
                clientEmail: customer.email,
                nip: customer.tax_exempt === 'none' ? '' : '', // Można rozbudować o NIP
                unitName: unit.name,
                price: unit.price_monthly / 100,
              });
            }
          } catch (invoiceError) {
            console.error('Error creating invoice:', invoiceError);
            // Nie przerywamy procesu - faktura może być wygenerowana później
          }

          console.log('Successfully processed checkout session');
        } catch (error) {
          console.error('Error processing checkout session:', error);
          return new Response('Processing error', { status: 500 });
        }

        break;
      }

      case 'invoice.payment_succeeded': {
        // Płatność za subskrypcję zakończyła się sukcesem
        const invoice = event.data.object;
        console.log('Processing invoice.payment_succeeded');
        
        if (invoice.subscription) {
          // Zaktualizuj datę wygaśnięcia subskrypcji
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
          
          const { error } = await supabaseAdmin
            .from('subscriptions')
            .update({
              current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
              status: 'active',
              updated_at: new Date().toISOString(),
            })
            .eq('stripe_subscription_id', invoice.subscription);

          if (error) {
            console.error('Error updating subscription period:', error);
          }
        }
        
        break;
      }

      case 'invoice.payment_failed': {
        // Płatność nieudana - można wysłać przypomnienie
        console.log('Processing invoice.payment_failed');
        break;
      }

      case 'customer.subscription.deleted': {
        // Subskrypcja anulowana
        const subscription = event.data.object;
        console.log('Processing customer.subscription.deleted');
        
        const { error } = await supabaseAdmin
          .from('subscriptions')
          .update({
            status: 'canceled',
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', subscription.id);

        if (error) {
          console.error('Error updating subscription status:', error);
        }
        
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response('OK', { status: 200 });

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response('Server error', { status: 500 });
  }
};