# x402b: Enhanced Payment Protocol with Compliance & EIP-3009 Support

[![Version](https://img.shields.io/badge/version-0.0.1-blue.svg)](https://github.com/Pieverse-Eng/x402b)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![BNB Chain](https://img.shields.io/badge/network-BNB%20Chain-yellow.svg)](https://www.bnbchain.org/)

**x402b** (x402 BNB Chain Enhanced) is an extension of the x402 payment protocol that provides gasless payments and compliance receipt generation on BNB Chain.

## Core Features

### 1. pieUSD: EIP-3009 Wrapped Token
- 1:1 backed by USDT
- EIP-3009 `transferWithAuthorization` support
- Gas-free payments for users
- Instant deposit/redeem
- Full x402 protocol compatibility

### 2. Compliance Receipt System
- Automatic tax/compliance receipt generation
- Distributed storage on BNB Greenfield
- 5-year data retention
- Publicly verifiable receipt URLs
- Synchronous generation (zero additional latency)

## Directory Structure

```
x402b/
├── README.md              # Project documentation
├── LICENSE                # MIT open source license
├── x402b-spec.md         # Complete technical specification
└── coinbase-x402/        # x402 core protocol implementation (submodule)
```

## Tech Stack

- **Blockchain**: BNB Smart Chain (Testnet: ChainID 97)
- **Storage**: BNB Greenfield (Distributed Storage)
- **Token Standards**: EIP-20, EIP-3009
- **Wallets**: MetaMask, WalletConnect
- **Signing**: EIP-712

## Quick Start

### Deployment Information

**Contract Addresses** (BNB Smart Chain Testnet):
- **pieUSD**: `0xE3a4dB6165AfC991451D0eB86fd5149AFf84c919`
- **USDT**: `0x337610d27c682E347C9cD60BD4b3b107C9d34dD`

### Usage Flow

#### 1. Deposit USDT → pieUSD

```typescript
// 1. Approve USDT
await usdt.approve(PIEUSD_ADDRESS, amount);

// 2. Deposit pieUSD
await pieUSD.deposit(amount);
```

#### 2. Gasless Payment

```typescript
// User signs authorization
const signature = await signer.signTypedData(domain, types, value);

// Facilitator executes transfer (pays gas)
await pieUSD.transferWithAuthorization(from, to, value, validAfter, validBefore, nonce, signature);
```

#### 3. Redeem pieUSD → USDT

```typescript
await pieUSD.redeem(amount);
```

### Compliance Receipts

To enable compliance receipts, include the `compliance` field in the `/settle` request:

```json
{
  "paymentPayload": { ... },
  "paymentRequirements": { ... },
  "compliance": {
    "payer": {
      "jurisdiction": "US",
      "entityType": "individual",
      "entityName": "John Doe",
      "email": "john@example.com"
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
    }]
  }
}
```

The response will include the receipt link:

```json
{
  "receipt": {
    "receiptId": "rcpt_xyz789",
    "receiptNumber": "2025-001234",
    "downloadUrl": "https://gnfd-testnet-sp1.bnbchain.org/view/x402b/rcpt_xyz789.json",
    "generatedAt": "2025-10-26T05:00:00Z",
    "expiresAt": "2030-12-31T23:59:59Z"
  }
}
```

## Security Considerations

- EIP-712 signature replay protection
- Nonce mechanism prevents signature reuse
- Time window validation (validAfter/validBefore)
- Smart contract audit (pending)
- Complete access control

## Documentation

- [Complete Technical Specification](x402b-spec.md) - Detailed protocol specifications, data structures, and implementation details

## Contributing

Issues and Pull Requests are welcome!

## License

This project is licensed under the [MIT License](LICENSE).

## Related Links

- [x402 Protocol](https://github.com/coinbase/coinbase-x402)
- [EIP-3009 Standard](https://eips.ethereum.org/EIPS/eip-3009)
- [BNB Chain Documentation](https://docs.bnbchain.org/)
- [BNB Greenfield](https://greenfield.bnbchain.org/)

## Contact

For questions or suggestions, please contact us via GitHub Issues.

---

**Note**: Current version is deployed on testnet. Please conduct thorough testing and audit before production use.
