import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { type Address } from "viem";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4021;
const PAY_TO = process.env.PAY_TO as Address;
const FACILITATOR_URL = process.env.FACILITATOR_URL || 'http://localhost:3002';
const NETWORK = "bsc-testnet";

// In-memory storage for demo (use a real database in production)
const balances: { [address: string]: { usdt: string; meme402: string } } = {};

// Middleware - CORS configuration for production
const corsOptions = {
  origin: [
    'http://localhost:5173', // Local dev
    'http://localhost:4021', // Local server
    'https://x402b-example-frontend.vercel.app', // Production frontend
  ],
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Payment-Payload'],
  exposedHeaders: ['X-Payment-Response'],
};

app.use(cors(corsOptions));
app.use(express.json());

// Free endpoint - no payment required
app.get("/", (req, res) => {
  res.json({
    message: "x402 Playground on BNB Chain - MEME402 Token Shop",
    version: "1.0.0",
    endpoints: {
      free: [
        {
          path: "/",
          method: "GET",
          description: "API info (free)",
        },
        {
          path: "/health",
          method: "GET",
          description: "Health check (free)",
        },
        {
          path: "/merchant-address",
          method: "GET",
          description: "Get merchant address (free)",
        },
        {
          path: "/balance/:address",
          method: "GET",
          description: "Get user balance (free)",
        },
      ],
      paid: [
        {
          path: "/buy",
          method: "POST",
          price: "$0.01 per token",
          description: "Buy MEME402 tokens (paid)",
        },
      ],
    },
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    network: NETWORK,
  });
});

// Get user balance
app.get("/balance/:address", (req, res) => {
  const address = req.params.address.toLowerCase();
  
  // Initialize balance if not exists
  if (!balances[address]) {
    balances[address] = { usdt: "0.00", meme402: "0" };
  }
  
  res.json({
    address,
    usdt: balances[address].usdt,
    meme402: balances[address].meme402,
  });
});

// Get merchant address endpoint
app.get("/merchant-address", (req, res) => {
  res.json({
    address: PAY_TO,
    network: NETWORK,
  });
});

// x402b: Compliance data type (matches facilitator)
type ComplianceData = {
  payer: {
    jurisdiction: string;
    entityType: "individual" | "business";
    entityName: string;
    taxId?: string;
    email: string;
  };
  merchant: {
    name: string;
    taxId: string;
    address: string;
  };
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: string;
    total: string;
  }>;
  preferences: {
    currency: string;
    language: string;
  };
};

// Helper: Base64 encode SettlementResponse for X-PAYMENT-RESPONSE header
function encodeSettlementResponse(settlement: any): string {
  return Buffer.from(JSON.stringify(settlement)).toString('base64');
}

// Helper: Build PaymentRequirementsResponse per x402 spec
function buildPaymentRequirementsResponse(amount: number, payTo: Address, assetAddress: string) {
  const cost = amount * 0.01;
  const costInCents = Math.floor(cost * 100);
  
  return {
    x402Version: 1,
    error: "Payment required to access this resource",
    accepts: [
      {
        scheme: "exact",
        network: NETWORK,
        maxAmountRequired: costInCents.toString(),
        asset: assetAddress,
        payTo,
        resource: "http://localhost:4021/buy",
        description: amount === 1 ? 'Buy 1 coffee ☕' : `Buy ${amount} coffees ☕`,
        mimeType: "application/json",
        outputSchema: null,
        maxTimeoutSeconds: 60,
        extra: {
          name: "pieUSD",
          version: "1",
        },
      },
    ],
  };
}

// Buy MEME402 tokens - paid endpoint with x402 + x402b support
app.post("/buy", async (req, res) => {
  const { amount, paymentPayload, compliance } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid amount",
    });
  }

  // HTTP 402: Payment Required (no payment provided)
  if (!paymentPayload) {
    const paymentRequirementsResponse = buildPaymentRequirementsResponse(
      amount,
      PAY_TO,
      process.env.PIEUSD_TOKEN_ADDRESS || "0x0000000000000000000000000000000000000000"
    );
    
    return res.status(402)
      .set('Content-Type', 'application/json')
      .json(paymentRequirementsResponse);
  }

  if (paymentPayload.network !== NETWORK) {
    return res.status(400).json({
      success: false,
      message: `Invalid network. Expected: ${NETWORK}`,
    });
  }

  const address = paymentPayload.payload?.authorization?.from?.toLowerCase();

  try {
    // Build x402 PaymentRequirements
    const cost = amount * 0.01;
    const costInCents = Math.floor(cost * 100); // Convert to cents (atomic units)
    
    const paymentRequirements = {
      scheme: "exact",
      network: NETWORK,
      maxAmountRequired: costInCents.toString(),
      asset: process.env.PIEUSD_TOKEN_ADDRESS || "0x0000000000000000000000000000000000000000", // pieUSD address
      payTo: PAY_TO,
      resource: `${req.protocol}://${req.get('host')}/buy`,
      description: amount === 1 ? 'Buy 1 coffee ☕' : `Buy ${amount} coffees ☕`,
      mimeType: "application/json",
      maxTimeoutSeconds: 60,
      extra: {
        name: "pieUSD",
        version: "1",
      },
    };

    // Verify payment with facilitator
    const verifyResponse = await fetch(`${FACILITATOR_URL}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentPayload,
        paymentRequirements,
      }),
    });

    const verifyData = await verifyResponse.json() as any;

    // HTTP 402: Payment verification failed
    if (!verifyData.isValid) {
      const settlementResponse = {
        success: false,
        errorReason: verifyData.invalidReason || 'verification_failed',
        transaction: "",
        network: NETWORK,
        payer: verifyData.payer || "",
      };
      
      const paymentRequirementsResponse = buildPaymentRequirementsResponse(
        amount,
        PAY_TO,
        process.env.PIEUSD_TOKEN_ADDRESS || "0x0000000000000000000000000000000000000000"
      );
      
      return res.status(402)
        .set('Content-Type', 'application/json')
        .set('X-PAYMENT-RESPONSE', encodeSettlementResponse(settlementResponse))
        .json(paymentRequirementsResponse);
    }

    // Settle payment with facilitator (x402 + x402b)
    const settleResponse = await fetch(`${FACILITATOR_URL}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentPayload,
        paymentRequirements,
        compliance, // x402b: optional compliance data
      }),
    });

    const settleData = await settleResponse.json() as any;

    // HTTP 402: Payment settlement failed
    if (!settleData.success) {
      const settlementResponse = {
        success: false,
        errorReason: settleData.errorReason || 'settlement_failed',
        transaction: settleData.transaction || "",
        network: settleData.network || NETWORK,
        payer: settleData.payer || "",
      };
      
      const paymentRequirementsResponse = buildPaymentRequirementsResponse(
        amount,
        PAY_TO,
        process.env.PIEUSD_TOKEN_ADDRESS || "0x0000000000000000000000000000000000000000"
      );
      
      return res.status(402)
        .set('Content-Type', 'application/json')
        .set('X-PAYMENT-RESPONSE', encodeSettlementResponse(settlementResponse))
        .json(paymentRequirementsResponse);
    }

    // Initialize balance if not exists
    if (!address) {
      return res.status(400).json({
        success: false,
        message: "Invalid payer address in payment payload",
      });
    }

    if (!balances[address]) {
      balances[address] = { usdt: "0.00", meme402: "0" };
    }

    // Mock minting MEME402 tokens (increment balance)
    balances[address].meme402 = (
      parseInt(balances[address].meme402) + amount
    ).toString();

    // Build response with x402 settlement data + optional x402b receipt
    const response: any = {
      success: true,
      message: amount === 1 ? '☕ Coffee purchased! Enjoy your brew!' : `☕ ${amount} coffees purchased! Enjoy your brews!`,
      transaction: {
        txHash: settleData.transaction,
        network: settleData.network,
        payer: settleData.payer,
        amount,
        cost: cost.toFixed(2),
      },
      balance: {
        usdt: balances[address].usdt,
        meme402: balances[address].meme402,
      },
    };

    // x402b: Include receipt if generated
    if (settleData.receipt) {
      response.receipt = settleData.receipt;
      console.log("[x402b] Receipt included in response:", settleData.receipt);
    }

    // HTTP 200: Success with X-PAYMENT-RESPONSE header (per x402 HTTP transport spec)
    const settlementResponse = {
      success: true,
      transaction: settleData.transaction,
      network: settleData.network,
      payer: settleData.payer,
    };

    res.status(200)
      .set('Content-Type', 'application/json')
      .set('X-PAYMENT-RESPONSE', encodeSettlementResponse(settlementResponse))
      .json(response);
  } catch (error) {
    console.error('Buy error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});


// Start server (for local development)
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 x402 Server running on http://localhost:${PORT}`);
    console.log(`💳 Payment address: ${PAY_TO}`);
    console.log(`🌐 Network: ${NETWORK}`);
    console.log(`\nEndpoints:`);
    console.log(`  GET  /                    - Free (API info)`);
    console.log(`  GET  /health              - Free (health check)`);
    console.log(`  GET  /merchant-address    - Free (merchant address)`);
    console.log(`  GET  /balance/:address    - Free (user balance)`);
    console.log(`  POST /buy                 - Paid (buy MEME402, $0.01 per token)`);
  });
}

// Export for Vercel serverless
export default app;
