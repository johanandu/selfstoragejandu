import React, { useState } from 'react';

export default function GateControl({ userId, unitId, gateCode }) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  const handleOpenGate = async () => {
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch('/api/gate/open', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          unitId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 402) {
          throw new Error('Brak aktywnej subskrypcji. Prosimy o uregulowanie płatności.');
        }
        throw new Error(data.error || 'Błąd podczas otwierania bramy');
      }

      setSuccess(true);
      
      // Auto-hide success message after 10 seconds
      setTimeout(() => {
        setSuccess(false);
      }, 10000);
    } catch (err) {
      console.error('Gate open error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-white rounded-lg shadow-lg p-6 border border-gray-200">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-8 h-8 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-gray-800">Otwórz Bramę</h3>
          <p className="text-gray-600 mt-1">Kliknij przycisk, aby otworzyć bramę wjazdową</p>
        </div>

        <button
          onClick={handleOpenGate}
          disabled={loading}
          className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-500 text-white font-bold py-5 px-6 rounded-lg text-xl transition-colors duration-200 flex items-center justify-center gap-3"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Otwieranie...
            </>
          ) : (
            <>
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
              </svg>
              OTWÓRZ BRAMĘ
            </>
          )}
        </button>

        {success && (
          <div className="mt-4 p-4 bg-green-100 border border-green-400 text-green-700 rounded">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <div>
                <p className="font-semibold">Brama otwarta!</p>
                <p className="text-sm">Zapraszamy na teren obiektu.</p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div>
                <p className="font-semibold">Błąd otwierania</p>
                <p className="text-sm">{error}</p>
              </div>
            </div>
          </div>
        )}

        {gateCode && (
          <div className="mt-4 p-3 bg-gray-100 rounded text-center">
            <p className="text-sm text-gray-600 mb-1">Kod zapasowy (offline):</p>
            <p className="text-2xl font-mono font-bold text-gray-800 tracking-wider">{gateCode}</p>
            <p className="text-xs text-gray-500 mt-1">Użyj, gdy brak internetu</p>
          </div>
        )}
      </div>
    </div>
  );
}