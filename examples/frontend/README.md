# MEME402 Token Shop Frontend 🎮

ASCII-style, mobile-first web app for buying MEME402 tokens using the x402 payment protocol.

## 🚀 Quick Start

### Prerequisites

- Node.js >= 18
- MetaMask browser extension
- BNB Testnet in MetaMask
- Some testnet BNB for gas fees

### Installation

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev
```

The app will open at http://localhost:3000

## 🔧 Configuration

Edit SERVER_URL in `src/App.tsx` if your server runs on a different port:

```typescript
const SERVER_URL = 'http://localhost:4021'
```

## 🛠️ Build

```bash
# Build for production
pnpm build

# Preview production build
pnpm preview
```
