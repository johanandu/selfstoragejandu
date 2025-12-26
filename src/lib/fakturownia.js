class FakturowniaClient {
  constructor() {
    this.apiKey = import.meta.env.FAKTUROWNIA_API_KEY;
    this.accountName = import.meta.env.FAKTUROWNIA_ACCOUNT_NAME;
    this.baseUrl = `https://${this.accountName}.fakturownia.pl`;
  }

  async createInvoice(invoiceData) {
    try {
      const response = await fetch(`${this.baseUrl}/invoices.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_token: this.apiKey,
          invoice: {
            kind: 'vat',
            number: null, // Fakturownia automatycznie nadaje numer
            sell_date: new Date().toISOString().split('T')[0],
            client_name: invoiceData.clientName,
            client_email: invoiceData.clientEmail,
            client_tax_no: invoiceData.nip || null,
            positions: [
              {
                name: `Wynajem kontenera ${invoiceData.unitName}`,
                quantity: 1,
                price: invoiceData.price,
                tax: 23,
              },
            ],
            paid: 1, // Oznacz jako zapłacone
            payment_date: new Date().toISOString().split('T')[0],
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Fakturownia API error: ${response.status}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Error creating invoice:', error);
      throw error;
    }
  }

  async downloadInvoice(invoiceId, format = 'pdf') {
    try {
      const response = await fetch(
        `${this.baseUrl}/invoices/${invoiceId}.${format}?api_token=${this.apiKey}`,
        {
          method: 'GET',
        }
      );

      if (!response.ok) {
        throw new Error(`Fakturownia API error: ${response.status}`);
      }

      return response;
    } catch (error) {
      console.error('Error downloading invoice:', error);
      throw error;
    }
  }
}

export const fakturownia = new FakturowniaClient();

export default fakturownia;