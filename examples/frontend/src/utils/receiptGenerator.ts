/**
 * Simple Receipt Generator for Coffee Purchases
 * Generates HTML receipts that can be printed or saved as PDF
 */

export interface ReceiptData {
  receiptId: string;
  receiptNumber: string;
  transactionHash: string;
  network: string;
  amount: string;
  currency: string;
  payer: string;
  merchant: {
    name: string;
    address: string;
  };
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: string;
    total: string;
  }>;
  compliance?: {
    payerInfo: {
      jurisdiction: string;
      entityType: 'individual' | 'business';
      entityName: string;
      taxId?: string;
    };
    merchantInfo: {
      name: string;
      taxId?: string;
      address?: string;
    };
  };
  generatedAt: string;
  downloadUrl?: string;
}

/**
 * Generates an HTML receipt that can be opened in a new window for printing
 */
export function generateHTMLReceipt(receipt: ReceiptData): string {
  const totalAmount = parseFloat(receipt.amount);
  const currencySymbol = receipt.currency === 'USDT' ? '$' : `${receipt.currency} `;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Receipt - ${receipt.receiptNumber}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif;
      line-height: 1.6;
      color: #111827;
      background: #f9fafb;
      padding: 40px 20px;
    }
    
    .receipt {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      padding: 60px;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    
    .header {
      text-align: center;
      margin-bottom: 40px;
      border-bottom: 3px solid #4ade80;
      padding-bottom: 30px;
    }
    
    .header h1 {
      font-size: 36px;
      color: #111827;
      margin-bottom: 8px;
    }
    
    .header .subtitle {
      font-size: 16px;
      color: #6b7280;
    }
    
    .status-badge {
      display: inline-block;
      background: #d1fae5;
      color: #047857;
      padding: 8px 20px;
      border-radius: 999px;
      font-weight: bold;
      font-size: 14px;
      margin-top: 16px;
    }
    
    .amount-section {
      text-align: center;
      margin: 40px 0;
      padding: 30px;
      background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
      border-radius: 12px;
    }
    
    .amount {
      font-size: 56px;
      font-weight: bold;
      color: #10b981;
      margin-bottom: 8px;
    }
    
    .currency-label {
      font-size: 18px;
      color: #6b7280;
    }
    
    .section {
      margin: 30px 0;
    }
    
    .section-title {
      font-size: 16px;
      font-weight: bold;
      color: #374151;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 2px solid #e5e7eb;
    }
    
    .info-grid {
      display: grid;
      gap: 12px;
    }
    
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
    }
    
    .label {
      color: #6b7280;
      font-size: 14px;
    }
    
    .value {
      color: #111827;
      font-weight: 600;
      font-size: 14px;
      text-align: right;
    }
    
    .blockchain-section {
      background: #f3f4f6;
      padding: 20px;
      border-radius: 8px;
      margin: 20px 0;
    }
    
    .tx-hash {
      font-family: 'Courier New', monospace;
      font-size: 12px;
      word-break: break-all;
      color: #374151;
      margin: 8px 0;
    }
    
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
    }
    
    .items-table th {
      background: #f9fafb;
      padding: 12px;
      text-align: left;
      font-weight: 600;
      color: #374151;
      border-bottom: 2px solid #e5e7eb;
    }
    
    .items-table td {
      padding: 12px;
      border-bottom: 1px solid #e5e7eb;
    }
    
    .compliance-section {
      background: #fffbeb;
      border: 2px solid #fcd34d;
      padding: 20px;
      border-radius: 8px;
      margin: 30px 0;
    }
    
    .footer {
      margin-top: 50px;
      padding-top: 30px;
      border-top: 2px solid #e5e7eb;
      text-align: center;
      color: #9ca3af;
      font-size: 12px;
    }
    
    .footer strong {
      color: #4ade80;
      font-size: 14px;
    }
    
    @media print {
      body {
        background: white;
        padding: 0;
      }
      
      .receipt {
        box-shadow: none;
        padding: 40px;
      }
      
      .no-print {
        display: none;
      }
    }
    
    .print-button {
      position: fixed;
      top: 20px;
      right: 20px;
      background: #4ade80;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: bold;
      cursor: pointer;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      font-size: 14px;
    }
    
    .print-button:hover {
      background: #22c55e;
    }
  </style>
</head>
<body>
  <button class="print-button no-print" onclick="window.print()">🖨️ Print Receipt</button>
  
  <div class="receipt">
    <!-- Header -->
    <div class="header">
      <h1>☕ Payment Receipt</h1>
      <p class="subtitle">Receipt #${receipt.receiptNumber}</p>
      <div class="status-badge">✓ PAID</div>
    </div>
    
    <!-- Amount -->
    <div class="amount-section">
      <div class="amount">${currencySymbol}${totalAmount.toFixed(2)}</div>
      <div class="currency-label">${receipt.currency}</div>
    </div>
    
    <!-- Payment Information -->
    <div class="section">
      <h2 class="section-title">Payment Information</h2>
      <div class="info-grid">
        <div class="info-row">
          <span class="label">Receipt Date:</span>
          <span class="value">${new Date(receipt.generatedAt).toLocaleString()}</span>
        </div>
        <div class="info-row">
          <span class="label">Payment Method:</span>
          <span class="value">Cryptocurrency (${receipt.currency})</span>
        </div>
        <div class="info-row">
          <span class="label">Blockchain:</span>
          <span class="value">BNB Smart Chain (BSC)</span>
        </div>
        <div class="info-row">
          <span class="label">Network:</span>
          <span class="value">${receipt.network}</span>
        </div>
      </div>
    </div>
    
    <!-- Items Purchased -->
    <div class="section">
      <h2 class="section-title">Items</h2>
      <table class="items-table">
        <thead>
          <tr>
            <th>Description</th>
            <th style="text-align: center">Quantity</th>
            <th style="text-align: right">Unit Price</th>
            <th style="text-align: right">Total</th>
          </tr>
        </thead>
        <tbody>
          ${receipt.items.map(item => `
            <tr>
              <td>${item.description}</td>
              <td style="text-align: center">${item.quantity}</td>
              <td style="text-align: right">${currencySymbol}${item.unitPrice}</td>
              <td style="text-align: right"><strong>${currencySymbol}${item.total}</strong></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    
    <!-- Merchant Information -->
    <div class="section">
      <h2 class="section-title">Merchant Information</h2>
      <div class="info-grid">
        <div class="info-row">
          <span class="label">Merchant Name:</span>
          <span class="value">${receipt.merchant.name}</span>
        </div>
        <div class="info-row">
          <span class="label">Merchant Address:</span>
          <span class="value">${receipt.merchant.address}</span>
        </div>
      </div>
    </div>
    
    <!-- Blockchain Verification -->
    <div class="blockchain-section">
      <h2 class="section-title">Blockchain Verification</h2>
      <div class="info-grid">
        <div class="info-row">
          <span class="label">Transaction Hash:</span>
        </div>
        <div class="tx-hash">${receipt.transactionHash}</div>
        <div class="info-row">
          <span class="label">Payer Address:</span>
        </div>
        <div class="tx-hash">${receipt.payer}</div>
        <div style="margin-top: 12px; font-size: 12px; color: #6b7280;">
          <strong>✓ Verified on BNB Chain</strong><br>
          This payment is cryptographically verified and immutably recorded on the blockchain.
        </div>
      </div>
    </div>
    
    <!-- Compliance Information (if provided) -->
    ${receipt.compliance ? `
      <div class="compliance-section">
        <h2 class="section-title" style="color: #92400e;">Tax Compliance Information</h2>
        <div class="info-grid">
          <div class="info-row">
            <span class="label">Jurisdiction:</span>
            <span class="value">${receipt.compliance.payerInfo.jurisdiction}</span>
          </div>
          <div class="info-row">
            <span class="label">Entity Type:</span>
            <span class="value">${receipt.compliance.payerInfo.entityType === 'business' ? 'Business' : 'Individual'}</span>
          </div>
          <div class="info-row">
            <span class="label">Entity Name:</span>
            <span class="value">${receipt.compliance.payerInfo.entityName}</span>
          </div>
          ${receipt.compliance.payerInfo.taxId ? `
            <div class="info-row">
              <span class="label">Tax ID:</span>
              <span class="value">${receipt.compliance.payerInfo.taxId}</span>
            </div>
          ` : ''}
        </div>
        <div style="margin-top: 16px; padding: 12px; background: white; border-radius: 4px; font-size: 12px; color: #92400e;">
          <strong>📋 Record Retention:</strong> Please retain this receipt for your tax records. 
          This receipt is stored on BNB Greenfield decentralized storage.
        </div>
      </div>
    ` : ''}
    
    <!-- Footer -->
    <div class="footer">
      <p><strong>Powered by x402b Protocol on BNB Chain</strong></p>
      <p style="margin-top: 8px;">BSC Blockchain • Secure • Transparent • Immutable</p>
      <p style="margin-top: 16px; font-size: 11px;">Receipt ID: ${receipt.receiptId}</p>
      <p style="font-size: 11px;">Generated: ${new Date(receipt.generatedAt).toISOString()}</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Opens the receipt in a new window for printing/saving
 */
export function openReceiptWindow(receipt: ReceiptData): void {
  const html = generateHTMLReceipt(receipt);
  const newWindow = window.open('', '_blank');
  
  if (newWindow) {
    newWindow.document.write(html);
    newWindow.document.close();
    
    // Auto-focus for printing
    setTimeout(() => {
      newWindow.focus();
    }, 100);
  } else {
    alert('Please allow popups to view your receipt');
  }
}

/**
 * Downloads the receipt as an HTML file
 */
export function downloadReceiptHTML(receipt: ReceiptData): void {
  const html = generateHTMLReceipt(receipt);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `receipt-${receipt.receiptNumber}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
