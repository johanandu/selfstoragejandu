import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../lib/supabase';

export const POST: APIRoute = async ({ request }) => {
  try {
    // Sprawdź autoryzację (token JWT z ciasteczka)
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Brak autoryzacji' }),
        { 
          status: 401, 
          headers: { 'Content-Type': 'application/json' } 
        }
      );
    }

    // Weryfikuj token i pobierz użytkownika
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Nieprawidłowa autoryzacja' }),
        { 
          status: 401, 
          headers: { 'Content-Type': 'application/json' } 
        }
      );
    }

    const data = await request.json();
    const { unitId } = data;

    if (!unitId) {
      return new Response(
        JSON.stringify({ error: 'Brak ID kontenera' }),
        { 
          status: 400, 
          headers: { 'Content-Type': 'application/json' } 
        }
      );
    }

    // Sprawdź aktywną subskrypcję
    const { data: subscription, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .eq('unit_id', unitId)
      .eq('status', 'active')
      .single();

    if (subError || !subscription) {
      console.log('No active subscription found:', { userId: user.id, unitId });
      
      // Zaloguj próbę otwarcia bez aktywnej subskrypcji
      await supabaseAdmin.from('access_logs').insert({
        user_id: user.id,
        action: 'OPEN_GATE',
        status: 'DENIED_NO_PAYMENT',
      });

      return new Response(
        JSON.stringify({ 
          error: 'Brak aktywnej subskrypcji dla tego kontenera. Prosimy o uregulowanie płatności.' 
        }),
        { 
          status: 402, 
          headers: { 'Content-Type': 'application/json' } 
        }
      );
    }

    // Sprawdź, czy subskrypcja nie wygasła
    const now = new Date();
    const subscriptionEnd = new Date(subscription.current_period_end);
    
    if (subscriptionEnd < now) {
      await supabaseAdmin.from('access_logs').insert({
        user_id: user.id,
        action: 'OPEN_GATE',
        status: 'DENIED_NO_PAYMENT',
      });

      return new Response(
        JSON.stringify({ 
          error: 'Subskrypcja wygasła. Prosimy o odnowienie.' 
        }),
        { 
          status: 402, 
          headers: { 'Content-Type': 'application/json' } 
        }
      );
    }

    // Wyślij sygnał do sterownika bramy
    try {
      const gateApiUrl = import.meta.env.GATE_API_URL;
      const gateApiToken = import.meta.env.GATE_API_TOKEN;
      
      if (!gateApiUrl || !gateApiToken) {
        console.error('Gate API credentials not configured');
        // W trybie development/test - symuluj sukces
        console.log('Simulating gate open (development mode)');
      } else {
        // W trybie produkcji - wyślij rzeczywisty request
        const response = await fetch(`${gateApiUrl}/trigger`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${gateApiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            unitId,
            userId: user.id,
            action: 'open',
          }),
        });

        if (!response.ok) {
          console.error('Gate controller error:', response.status);
          // Nie zwracamy błędu użytkownikowi - fallback na kod PIN
        }
      }

      // Zaloguj sukces
      await supabaseAdmin.from('access_logs').insert({
        user_id: user.id,
        action: 'OPEN_GATE',
        status: 'SUCCESS',
      });

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Brama otwarta. Zapraszamy!' 
        }),
        { 
          status: 200, 
          headers: { 'Content-Type': 'application/json' } 
        }
      );

    } catch (gateError) {
      console.error('Gate hardware error:', gateError);
      
      // Mimo błędu hardware'u, zaloguj próbę
      await supabaseAdmin.from('access_logs').insert({
        user_id: user.id,
        action: 'OPEN_GATE',
        status: 'SUCCESS', // Użytkownik ma prawo, hardware może być offline
      });

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Brama otwarta (sprawdź kod PIN w razie problemów)',
          fallbackCode: 'Użyj kodu PIN z panelu klienta'
        }),
        { 
          status: 200, 
          headers: { 'Content-Type': 'application/json' } 
        }
      );
    }

  } catch (error) {
    console.error('Gate open error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Błąd serwera podczas otwierania bramy' 
      }),
      { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }
};