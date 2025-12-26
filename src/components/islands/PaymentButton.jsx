import React, { useState } from 'react';

export default function PaymentButton({ unitId, unitName, price, userId }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handlePayment = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          unitId,
          unitName,
          price,
          userId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Błąd podczas tworzenia sesji płatności');
      }

      // Przekierowanie do Stripe Checkout
      window.location.href = data.url;
    } catch (err) {
      console.error('Payment error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      <button
        onClick={handlePayment}
        disabled={loading}
        className="w-full bg-teal-600 hover:bg-teal-700 disabled:bg-gray-500 text-white font-bold py-4 px-6 rounded-lg text-lg transition-colors duration-200 flex items-center justify-center gap-3"
      >
        {loading ? (
          <>
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Przekierowywanie...
          </>
        ) : (
          <>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            Wynajmij za {price} zł
          </>
        )}
      </button>

      {error && (
        <div className="mt-3 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          <p className="font-semibold">Błąd płatności:</p>
          <p>{error}</p>
        </div>
      )}

      <p className="mt-2 text-sm text-gray-600 text-center">
        Bezpieczna płatność przez Stripe • Subskrypcja miesięczna
      </p>
    </div>
  );
}