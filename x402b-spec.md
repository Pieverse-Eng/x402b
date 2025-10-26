# x402b Specification: Enhanced Payment Protocol with Compliance & EIP-3009 Support

**Version**: 0.0.1
**Date**: October 26, 2025
**Status**: Implemented

**Document Scope**

This specification extends the core x402 protocol with:

- **pieUSD Token**: EIP-3009 compliant wrapped USDT for gasless payments on BNB Chain
- **Compliance Receipt Extension**: Optional tax/regulatory compliance receipts stored on BNB Greenfield
- **Implementation Details**: Complete technical specifications, data schemas, and storage mechanisms

**Out of Scope**:
- Client-side UI/UX implementation patterns
- Jurisdiction-specific tax filing requirements
- Receipt rendering/printing specifications

## Overview

**x402b** (x402 BNB Chain Enhanced) is an extension of the x402 payment protocol that introduces:
1. **pieUSD**: A wrapped USDT token with EIP-3009 support for gasless payments
2. **Compliance Receipts**: Optional receipt generation for regulatory compliance

## Components

### 1. pieUSD Token (Wrapped USDT with EIP-3009)

#### Problem
- BNB Chain's stablecoins (like USDT, USDC) doesn't support EIP-3009 (`transferWithAuthorization`)
- Users must pay gas fees for every payment transaction
- Cannot leverage the gasless payment flow of the original x402 protocol

#### Solution: pieUSD Token

**pieUSD** is a wrapped ERC-20 token contract that:
- Wraps existing USDT 1:1
- Implements EIP-3009 `transferWithAuthorization`
- Enables gasless payments on BNB Chain
- Supports instant deposit & redeem

#### Technical Specification

**Contract Interface**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IERC3009 {
    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes memory signature
    ) external;

    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes memory signature
    ) external;
}

contract pieUSD is ERC20, Ownable, IERC3009 {
    IERC20 public immutable USDT;

    // EIP-712 Domain Separator
    bytes32 public DOMAIN_SEPARATOR;

    // Mapping of used nonces for replay protection
    mapping(address => mapping(bytes32 => bool)) public authorizationState;

    constructor(address _usdt) ERC20("pieUSD", "pieUSD") {
        USDT = IERC20(_usdt);
        DOMAIN_SEPARATOR = keccak256(/*...*/);
    }

    // 1:1 wrap USDT -> pieUSD
    function deposit(uint256 amount) external {
        USDT.transferFrom(msg.sender, address(this), amount);
        _mint(msg.sender, amount);
    }

    // 1:1 unwrap pieUSD -> USDT
    function redeem(uint256 amount) external {
        _burn(msg.sender, amount);
        USDT.transfer(msg.sender, amount);
    }

    // EIP-3009: Gasless transfer
    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes memory signature
    ) external override {
        require(block.timestamp > validAfter, "Authorization not yet valid");
        require(block.timestamp < validBefore, "Authorization expired");
        require(!authorizationState[from][nonce], "Authorization already used");

        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01",
            DOMAIN_SEPARATOR,
            keccak256(abi.encode(
                keccak256("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"),
                from, to, value, validAfter, validBefore, nonce
            ))
        ));

        require(_recoverSigner(digest, signature) == from, "Invalid signature");

        authorizationState[from][nonce] = true;
        _transfer(from, to, value);
    }
}
```

**Deployment**:
- **Network**: BNB Smart Chain Testnet (ChainID: 97)
- **pieUSD Address**: `0xE3a4dB6165AfC991451D0eB86fd5149AFf84c919`
- **USDT Address**: `0x337610d27c682E347C9cD60BD4b3b107C9d34dDd`

#### User Flow

```
User deposits USDT:
1. User: approve USDT to pieUSD contract
2. User: call deposit(amount)
3. Contract: mint pieUSD 1:1
   ↓
User pays with pieUSD (gasless):
1. User: sign EIP-712 authorization (off-chain)
2. Facilitator: submit transferWithAuthorization
3. Facilitator: pays gas
4. User's pieUSD transferred to merchant


User redeems to USDT:
1. User: call redeem(amount)
2. Contract: burn pieUSD
3. Contract: return USDT 1:1
```

#### Benefits

| Feature | USDT (Current) | pieUSD (Proposed) |
|---------|----------------|-------------------|
| EIP-3009 Support | ❌ | ✅ |
| Gasless Payments | ❌ | ✅ |
| x402 Compatible | Partial (custom) | Full (native) |
| 1:1 Backed | N/A | ✅ USDT |
| Instant Redeem | N/A | ✅ |

---

### 2. x402b: Compliance Receipt Extension

#### Problem
- Businesses need receipts for tax/accounting compliance
- Current x402 doesn't provide standardized receipts
- No jurisdiction-specific compliance information
- Receipt storage is not decentralized

#### Solution: x402b Protocol Extension

**x402b** extends x402 by embedding optional compliance receipt generation into the synchronous `/settle` flow.

**Key Insight**: The facilitator's `/settle` endpoint is already a blocking HTTP call that waits for blockchain confirmation (~2-10 seconds). Receipt generation (~1-2 seconds) happens during this wait, adding minimal additional latency.

#### Technical Specification

##### 2.1 Enhanced /settle Request (Resource Server → Facilitator)

The facilitator's `/settle` endpoint accepts optional compliance information:

```typescript
// Standard x402 /settle (no receipt)
POST /facilitator/settle
{
  "paymentPayload": { ... },      // Standard x402
  "paymentRequirements": { ... }  // Standard x402
}

// x402b /settle (with compliance - optional)
POST /facilitator/settle
{
  "paymentPayload": { ... },      // Standard x402
  "paymentRequirements": { ... }, // Standard x402

  // x402b extension: optional compliance fields
  "compliance": {
    "payer": {
      "jurisdiction": "US",           // ISO 3166-1 alpha-2
      "entityType": "individual",     // individual | business
      "entityName": "John Doe",
      "taxId": "123-45-6789",         // Optional, may be redacted
      "email": "john@example.com"     // For receipt delivery
    },
    "merchant": {
      "name": "Coffee Shop",
      "taxId": "98-7654321",
      "address": "123 Blockchain Ave"
    },
    "items": [{
      "description": "Cup of Coffee",
      "quantity": 1,
      "unitPrice": "0.01",
      "total": "0.01"
    }],
    "preferences": {
      "currency": "USD",              // Display currency
      "language": "en"                // Receipt language
    }
  }
}
```

##### 2.2 The x402b Flow (Synchronous)

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Client → Resource Server: X-PAYMENT header              │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Resource Server → Facilitator: POST /verify             │
│    • Validates signature & checks balances                 │
│    • Returns: {isValid: true/false}                        │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Resource Server processes request (generates data)      │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Resource Server → Facilitator: POST /settle             │
│    (WITH optional compliance info - BLOCKING CALL)         │
│                                                             │
│    Facilitator:                                             │
│    ├─ Submit transaction to blockchain                     │
│    ├─ Wait for confirmation (~2-10 sec)                  │
│    ├─ If compliance provided:                              │
│    │  ├─ Generate compliance receipt                       │
│    │  ├─ Upload to BNB Greenfield (~1-2 sec)              │
│    │  └─ Include receipt URL in response                  │
│    └─ Return: {success, transaction, receipt?}            │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. Resource Server receives settlement + optional receipt  │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. Resource Server → Client:                               │
│    • X-PAYMENT-RESPONSE header (standard x402)             │
│    • Response body with data + optional receipt            │
└─────────────────────────────────────────────────────────────┘
```

##### 2.3 Receipt Data Structure

Receipts stored on BNB Greenfield contain complete transaction and compliance information:

```typescript
interface ReceiptData {
  // Receipt identification
  receiptId: string;          // Unique ID: rcpt_{timestamp}_{random}
  receiptNumber: string;      // Human-readable: RCPT-{year}-{sequence}

  // Blockchain transaction details
  transactionHash: string;    // On-chain settlement transaction
  network: string;            // e.g., "bsc-testnet", "bsc-mainnet"
  from: string;               // Payer address
  to: string;                 // Merchant address
  amount: string;             // Payment amount in token units
  currency: string;           // Token symbol (e.g., "pieUSD")

  // Receipt metadata
  generatedAt: string;        // ISO 8601 timestamp
  expiresAt: string;          // Retention period (default: 5 years)

  // Compliance information
  compliance?: {
    payerInfo: {
      jurisdiction: string;   // ISO 3166-1 alpha-2 country code
      entityType: "individual" | "business";
      entityName: string;
      taxId?: string;        // Optional, may be redacted
      email: string;
    };
    merchantInfo: {
      name: string;
      taxId: string;
      address: string;
    };
  };

  // Line items
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: string;
    total: string;
  }>;
}
```

**Storage Details**:
- **Platform**: BNB Greenfield (Decentralized Storage)
- **Bucket**: Public read, authenticated write
- **Format**: JSON with SHA-256 checksums for integrity
- **Redundancy**: EC (Erasure Coding) with 7 segment checksums
- **Access**: Public URLs for easy retrieval
- **Retention**: 5 years (configurable per jurisdiction)

**Example Greenfield URLs**:
```
Download: https://gnfd-testnet-sp1.bnbchain.org/view/x402b/{receiptId}.json
Explorer: https://testnet.greenfieldscan.com/object/x402b/{receiptId}.json
```

##### 2.4 /settle Response (Facilitator → Resource Server)

```typescript
// Standard x402 response (no compliance)
HTTP/1.1 200 OK
Content-Type: application/json
X-PAYMENT-RESPONSE: eyJzdWNjZXNzIjp0cnVlLCJ0cmFuc2FjdGlvbiI6IjB4MTIzNDU2Nzg5MGFiY2RlZjEyMzQ1Njc4OTBhYmNkZWYxMjM0NTY3ODkwYWJjZGVmMTIzNDU2Nzg5MGFiY2RlZiIsIm5ldHdvcmsiOiJiYXNlLXNlcG9saWEiLCJwYXllciI6IjB4ODU3YjA2NTE5RTkxZTNBNTQ1Mzg3OTFiRGJiMEUyMjM3M2UzNmI2NiJ9

{
  "data": "premium market data response",
  "timestamp": "2024-01-15T10:30:00Z"
}

// x402b response (with compliance)
HTTP/1.1 200 OK
Content-Type: application/json
X-PAYMENT-RESPONSE: eyJzdWNjZXNzIjp0cnVlLCJ0cmFuc2FjdGlvbiI6IjB4MTIzNDU2Nzg5MGFiY2RlZjEyMzQ1Njc4OTBhYmNkZWYxMjM0NTY3ODkwYWJjZGVmMTIzNDU2Nzg5MGFiY2RlZiIsIm5ldHdvcmsiOiJiYXNlLXNlcG9saWEiLCJwYXllciI6IjB4ODU3YjA2NTE5RTkxZTNBNTQ1Mzg3OTFiRGJiMEUyMjM3M2UzNmI2NiJ9

{
  "data": "premium market data response",
  "timestamp": "2024-01-15T10:30:00Z",
  "receipt": {
    "receiptId": "rcpt_xyz789",
    "receiptNumber": "2025-001234",
    "downloadUrl": "https://greenfield.bnbchain.org/x402b/receipt_xyz789.json",
    "generatedAt": "2025-10-26T05:00:00Z",
    "expiresAt": "2030-12-31T23:59:59Z"
  }
}
```


## Architecture

```
┌──────────┐   1. Payment + Compliance  ┌────────────┐
│  Client  │ ────────────────────────> │  Resource  │
│          │   (X-PAYMENT header)       │   Server   │
└──────────┘                            └──────┬─────┘
     ↑                                         │
     │                                   2. /verify
     │                                         ↓
     │                                  ┌─────────────┐
     │                                  │ Facilitator │
     │                                  └──────┬──────┘
     │                                         │
     │                         3. /settle (with compliance)
     │                                         ↓
     │                           ┌──────────────────────────┐
     │                           │   Facilitator            │
     │                           │ ├─ Submit tx to chain    │
     │                           │ ├─ Wait for confirm      │
     │  7. Response              │ ├─ Generate receipt      │
     │  X-PAYMENT-RESPONSE       │ ├─ Upload to Greenfield  │
     │  + Receipt link           │ └─ Return result         │
     │                           └────┬───────────────┬─────┘
     │                                │               │
     │                       4. On-chain   5. Upload receipt
     │                          Settle        (optional)
     │                                │               │
     │                                ↓               ↓
┌────┴─────┐  6. Settlement      ┌─────────┐  ┌────────────┐
│ Resource │ <── + Receipt        │   BNB   │  │    BNB     │
│  Server  │     (if requested)   │  Chain  │  │ Greenfield │
└──────────┘                      └─────────┘  └────────────┘
```

### Flow Summary

1. **Client → Resource Server**: Payment with `X-PAYMENT` header + optional compliance data
2. **Resource Server → Facilitator**: `/verify` endpoint validates signature
3. **Resource Server → Facilitator**: `/settle` endpoint with optional compliance (blocking)
4. **Facilitator → Chain**: Submit transaction, wait for confirmation (~2-10s)
5. **Facilitator → Greenfield**: If compliance provided, generate and upload receipt (~1-2s)
6. **Facilitator → Resource Server**: Return settlement + optional receipt URL
7. **Resource Server → Client**: `X-PAYMENT-RESPONSE` header + data + receipt

**Key Insight**: Receipt generation happens **inside the facilitator's blocking `/settle` call**, during the blockchain confirmation wait. Total time: ~6-8 seconds vs ~5 seconds without receipt.

---

## Implementation Notes

### Modifications to x402 Core Specification

This implementation extends the standard x402 protocol with the following modifications:

#### 1. Optional `compliance` Field in /settle Request

**Addition**: The `/settle` endpoint accepts an optional `compliance` object alongside standard x402 fields:

```typescript
interface SettleRequest {
  paymentPayload: PaymentPayload;      // Standard x402
  paymentRequirements: PaymentRequirements; // Standard x402
  compliance?: ComplianceData;         // x402b extension (optional)
}
```

**Backward Compatibility**: This is fully backward compatible. Facilitators that don't support x402b will ignore the `compliance` field.

#### 2. Extended SettlementResponse with Receipt

**Addition**: The `/settle` response includes an optional `receipt` object:

```typescript
interface SettlementResponse {
  success: boolean;           // Standard x402
  transaction: string;        // Standard x402
  network: string;            // Standard x402
  payer: string;              // Standard x402
  errorReason?: string;       // Standard x402
  receipt?: {                 // x402b extension
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
    compliance?: ComplianceInfo;
    generatedAt: string;
    expiresAt: string;
    downloadUrl: string;      // Greenfield storage URL
    viewUrl: string;          // Greenfield explorer URL
  };
}
```

**Usage**: Resource servers can optionally include receipt information in their response to clients.

#### 3. pieUSD: EIP-3009 Token for BNB Chain

**Context**: BNB Chain's native USDT doesn't support EIP-3009, preventing gasless x402 payments.

**Solution**: pieUSD wraps USDT 1:1 and implements EIP-3009's `transferWithAuthorization`, enabling:
- Gasless payments (facilitator pays gas)
- Full compatibility with x402 "exact" scheme
- Instant deposit/redeem

**Payment Flow Difference**:
```
Standard x402 (Base/Ethereum):
Client → Signs authorization → Facilitator → EIP-3009 token → Settlement

x402b (BNB Chain):
Client → Signs authorization → Facilitator → pieUSD (wrapped) → Settlement
```

### Technical Implementation Details

#### Facilitator Implementation

**Key Components**:
1. **EIP-3009 Verification** (`eip3009-verifier.ts`)
   - Validates EIP-712 signatures
   - Verifies authorization parameters
   - Submits `transferWithAuthorization` to pieUSD contract

2. **Greenfield Upload** (`greenfield-uploader.ts`)
   - Generates receipts with proper structure
   - Calculates EC redundancy checksums using `@bnb-chain/reed-solomon`
   - Creates objects on Greenfield blockchain
   - Uploads content to Storage Provider with ECDSA auth

3. **Receipt Generation**
   - Executed synchronously during `/settle` call
   - Saves local backup (`facilitator/receipts/`)
   - Uploads to BNB Greenfield for decentralized storage
