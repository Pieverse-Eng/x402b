import { useState, useEffect } from "react";
import {
	createWalletClient,
	createPublicClient,
	custom,
	http,
	parseUnits,
	formatUnits,
	type Address,
	type Hex,
	keccak256,
	toHex,
	parseAbi,
} from "viem";
import { bscTestnet } from "viem/chains";
import confetti from "canvas-confetti";
import "./App.css";
import {
	openReceiptWindow,
	downloadReceiptHTML,
	type ReceiptData,
} from "./utils/receiptGenerator";
import { z } from "zod";

const PaymentResponseHeaderSchema = z.object({
	success: z.boolean(),
	transaction: z.templateLiteral(["0x", z.string()]),
	network: z.string(),
	payer: z.templateLiteral(["0x", z.string()]),
});

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:4021";
const PIEUSD_ADDRESS = import.meta.env.VITE_PIEUSD_ADDRESS as Address;
const USDT_ADDRESS = import.meta.env.VITE_USDT_ADDRESS as Address;
const MERCHANT_ADDRESS = import.meta.env.VITE_MERCHANT_ADDRESS || ""; // Fetch from server if not set

// pieUSD & USDT ABIs (minimal)
const ERC20_ABI = parseAbi([
	"function balanceOf(address) view returns (uint256)",
	"function approve(address spender, uint256 amount) returns (bool)",
	"function allowance(address owner, address spender) view returns (uint256)",
]);

const PIEUSD_ABI = parseAbi([
	"function balanceOf(address) view returns (uint256)",
	"function deposit(uint256 amount) returns (bool)",
	"function redeem(uint256 amount) returns (bool)",
	"function approve(address spender, uint256 amount) returns (bool)",
	"function allowance(address owner, address spender) view returns (uint256)",
]);

// EIP-3009 TransferWithAuthorization domain & types
// const TRANSFER_WITH_AUTHORIZATION_TYPEHASH = keccak256(
//   toHex('TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)')
// )

const JURISDICTIONS = [
	{ code: "SG", name: "Singapore", emoji: "🇸🇬" },
	{ code: "HK", name: "Hong Kong", emoji: "🇭🇰" },
	{ code: "KR", name: "South Korea", emoji: "🇰🇷" },
	{ code: "US", name: "United States", emoji: "🇺🇸" },
	{ code: "GB", name: "United Kingdom", emoji: "🇬🇧" },
];

// Helper function to get block explorer URL based on network
const getBlockExplorerUrl = (
	network: string,
	txHash: `0x${string}`,
): string => {
	switch (network.toLowerCase()) {
		case "bsc-testnet":
		case "bsc_testnet":
			return `https://testnet.bscscan.com/tx/${txHash}`;
		case "bsc-mainnet":
		case "bsc_mainnet":
			return `https://bscscan.com/tx/${txHash}`;
		case "base-sepolia":
		case "base_sepolia":
			return `https://sepolia.basescan.org/tx/${txHash}`;
		case "base-mainnet":
		case "base_mainnet":
			return `https://basescan.org/tx/${txHash}`;
		case "ethereum":
		case "mainnet":
			return `https://etherscan.io/tx/${txHash}`;
		case "sepolia":
			return `https://sepolia.etherscan.io/tx/${txHash}`;
		default:
			// Fallback: try to construct URL based on common patterns
			if (network.includes("testnet")) {
				return `https://testnet.bscscan.com/tx/${txHash}`;
			}
			return `https://bscscan.com/tx/${txHash}`;
	}
};

function App() {
	const [account, setAccount] = useState<string>("");
	const [coffeeCount, setCoffeeCount] = useState<string>("1");
	const [loading, setLoading] = useState(false);
	const [message, setMessage] = useState("");
	const [walletClient, setWalletClient] = useState<any>(null);
	const [publicClient, setPublicClient] = useState<any>(null);

	// Balances
	const [pieUSDBalance, setPieUSDBalance] = useState<string>("0");
	const [usdtBalance, setUsdtBalance] = useState<string>("0");

	// Wrap/Unwrap state
	const [wrapAmount, setWrapAmount] = useState<string>("");
	const [unwrapAmount, setUnwrapAmount] = useState<string>("");
	const [isWrapping, setIsWrapping] = useState(false);

	// x402b: Compliance opt-in state
	const [showCompliance, setShowCompliance] = useState(false);
	const [receipt, setReceipt] = useState<any>(null);
	const [settlementResponse, setSettlementResponse] = useState<z.infer<
		typeof PaymentResponseHeaderSchema
	> | null>(null);

	// Compliance form fields
	const [complianceName, setComplianceName] = useState("");
	const [complianceEmail, setComplianceEmail] = useState("");
	const [complianceJurisdiction, setComplianceJurisdiction] = useState("SG");
	const [complianceEntityType, setComplianceEntityType] = useState<
		"individual" | "business"
	>("individual");
	const [complianceTaxId, setComplianceTaxId] = useState("");

	useEffect(() => {
		checkWallet();
	}, []);

	const checkWallet = async () => {
		if (typeof window.ethereum !== "undefined") {
			try {
				const accounts = await window.ethereum.request({
					method: "eth_accounts",
				});
				if (accounts.length > 0) {
					connectWallet();
				}
			} catch (error) {
				console.error("Error checking wallet:", error);
			}
		}
	};

	const connectWallet = async () => {
		if (typeof window.ethereum === "undefined") {
			setMessage("❌ Please install MetaMask!");
			return;
		}

		try {
			setLoading(true);

			// Request accounts first
			const accounts = await window.ethereum.request({
				method: "eth_requestAccounts",
			});

			// Check current chain
			const chainId = await window.ethereum.request({ method: "eth_chainId" });
			const bscTestnetChainId = "0x" + bscTestnet.id.toString(16); // 0x61 for BSC testnet

			// Force switch to BNB testnet if not already on it
			if (chainId !== bscTestnetChainId) {
				try {
					await window.ethereum.request({
						method: "wallet_switchEthereumChain",
						params: [{ chainId: bscTestnetChainId }],
					});
				} catch (switchError: any) {
					// Chain not added, add it
					if (switchError.code === 4902) {
						await window.ethereum.request({
							method: "wallet_addEthereumChain",
							params: [
								{
									chainId: bscTestnetChainId,
									chainName: "BNB Smart Chain Testnet",
									nativeCurrency: {
										name: "BNB",
										symbol: "tBNB",
										decimals: 18,
									},
									rpcUrls: ["https://data-seed-prebsc-1-s1.binance.org:8545/"],
									blockExplorerUrls: ["https://testnet.bscscan.com"],
								},
							],
						});
					} else {
						throw switchError;
					}
				}
			}

			const wallet = createWalletClient({
				account: accounts[0],
				chain: bscTestnet,
				transport: custom(window.ethereum),
			});

			const client = createPublicClient({
				chain: bscTestnet,
				transport: http(),
			});

			setWalletClient(wallet);
			setPublicClient(client);
			setAccount(accounts[0]);
			setMessage("✅ Wallet connected to BNB Testnet!");

			// Fetch balances
			await fetchBalances(accounts[0], client);
		} catch (error: any) {
			setMessage("❌ " + error.message);
		} finally {
			setLoading(false);
		}
	};

	const disconnectWallet = () => {
		setAccount("");
		setWalletClient(null);
		setPublicClient(null);
		setPieUSDBalance("0");
		setUsdtBalance("0");
		setMessage("👋 Wallet disconnected");
	};

	const fetchBalances = async (address: string, client?: any) => {
		try {
			const pubClient = client || publicClient;
			if (!pubClient) return;

			// Fetch pieUSD balance
			const pieBalance = (await pubClient.readContract({
				address: PIEUSD_ADDRESS,
				abi: PIEUSD_ABI,
				functionName: "balanceOf",
				args: [address as Address],
			})) as bigint;

			// Fetch USDT balance
			const usdtBal = (await pubClient.readContract({
				address: USDT_ADDRESS,
				abi: ERC20_ABI,
				functionName: "balanceOf",
				args: [address as Address],
			})) as bigint;

			setPieUSDBalance(formatUnits(pieBalance, 18));
			setUsdtBalance(formatUnits(usdtBal, 18));
		} catch (error) {
			console.error("Error fetching balances:", error);
		}
	};

	const wrapUSDT = async () => {
		if (
			!walletClient ||
			!publicClient ||
			!wrapAmount ||
			parseFloat(wrapAmount) <= 0
		) {
			setMessage("❌ Invalid wrap amount");
			return;
		}

		try {
			setIsWrapping(true);
			setMessage("📝 Step 1/3: Approving USDT...");

			const amount = parseUnits(wrapAmount, 18);

			// Check allowance first
			const allowance = (await publicClient.readContract({
				address: USDT_ADDRESS,
				abi: ERC20_ABI,
				functionName: "allowance",
				args: [account as Address, PIEUSD_ADDRESS],
			})) as bigint;

			// Approve if needed
			if (allowance < amount) {
				const approveTx = await walletClient.writeContract({
					address: USDT_ADDRESS,
					abi: ERC20_ABI,
					functionName: "approve",
					args: [PIEUSD_ADDRESS, amount],
				});

				setMessage("⏳ Step 2/3: Waiting for approval...");
				await publicClient.waitForTransactionReceipt({ hash: approveTx });
			}

			// Deposit (wrap)
			setMessage("📦 Step 3/3: Wrapping USDT to pieUSD...");
			const depositTx = await walletClient.writeContract({
				address: PIEUSD_ADDRESS,
				abi: PIEUSD_ABI,
				functionName: "deposit",
				args: [amount],
			});

			await publicClient.waitForTransactionReceipt({ hash: depositTx });

			setMessage(`✅ Wrapped ${wrapAmount} USDT to pieUSD!`);
			setWrapAmount("");
			await fetchBalances(account, publicClient);
		} catch (error: any) {
			console.error("Wrap error:", error);
			setMessage("❌ Wrap failed: " + (error.message || "Unknown error"));
		} finally {
			setIsWrapping(false);
		}
	};

	const unwrapPieUSD = async () => {
		if (
			!walletClient ||
			!publicClient ||
			!unwrapAmount ||
			parseFloat(unwrapAmount) <= 0
		) {
			setMessage("❌ Invalid unwrap amount");
			return;
		}

		try {
			setIsWrapping(true);
			setMessage("📦 Unwrapping pieUSD to USDT...");

			const amount = parseUnits(unwrapAmount, 18);

			const redeemTx = await walletClient.writeContract({
				address: PIEUSD_ADDRESS,
				abi: PIEUSD_ABI,
				functionName: "redeem",
				args: [amount],
			});

			await publicClient.waitForTransactionReceipt({ hash: redeemTx });

			setMessage(`✅ Unwrapped ${unwrapAmount} pieUSD to USDT!`);
			setUnwrapAmount("");
			await fetchBalances(account, publicClient);
		} catch (error: any) {
			console.error("Unwrap error:", error);
			setMessage("❌ Unwrap failed: " + (error.message || "Unknown error"));
		} finally {
			setIsWrapping(false);
		}
	};

	const buyCoffee = async () => {
		if (!walletClient) {
			setMessage("❌ Please connect wallet first!");
			return;
		}

		try {
			setLoading(true);
			setReceipt(null); // Clear previous receipt
			setSettlementResponse(null); // Clear previous settlement response

			const amount = parseInt(coffeeCount);
			const cost = amount * 0.01; // $0.01 USD per coffee (metaverse coffee!)
			const value = parseUnits(cost.toString(), 18); // pieUSD has 18 decimals

			// Check pieUSD balance
			const currentBalance = parseFloat(pieUSDBalance);
			if (currentBalance < cost) {
				setMessage(
					`❌ Insufficient pieUSD! You need $${cost.toFixed(
						2,
					)} but have $${currentBalance.toFixed(2)}. Please wrap USDT first.`,
				);
				setLoading(false);
				return;
			}

			// Build compliance data if checkbox is enabled
			const complianceData =
				showCompliance && complianceName && complianceEmail
					? {
							payer: {
								jurisdiction: complianceJurisdiction,
								entityType: complianceEntityType,
								entityName: complianceName,
								taxId: complianceTaxId || undefined,
								email: complianceEmail,
							},
							merchant: {
								name: "Dev Coffee Fund",
								taxId: "00-0000000",
								address: "123 Blockchain Ave, BNB Chain",
							},
							items: [
								{
									description:
										amount === 1
											? "Cup of Coffee ☕"
											: `${amount} Cups of Coffee ☕`,
									quantity: amount,
									unitPrice: "0.01",
									total: cost.toFixed(2),
								},
							],
							preferences: {
								currency: "USD",
								language: "en",
							},
						}
					: null;

			// Get merchant address from env or server
			let merchantAddress = MERCHANT_ADDRESS;
			if (!merchantAddress) {
				const response = await fetch(`${SERVER_URL}/merchant-address`);
				const data = await response.json();
				merchantAddress = data.address;
			}

			// Step 1: Create EIP-3009 authorization
			setMessage("📝 Step 1/2: Signing coffee payment...");

			const now = Math.floor(Date.now() / 1000);
			const validAfter = now - 60; // Valid 1 minute ago (to account for clock skew)
			const validBefore = now + 3600; // Valid for 1 hour
			const nonce = keccak256(
				toHex(Math.random().toString() + Date.now().toString()),
			); // Random nonce

			// EIP-712 domain for PieUSD
			const domain = {
				name: "pieUSD",
				version: "1",
				chainId: 97, // BSC Testnet
				verifyingContract: PIEUSD_ADDRESS as Address,
			};

			// EIP-712 types
			const types = {
				TransferWithAuthorization: [
					{ name: "from", type: "address" },
					{ name: "to", type: "address" },
					{ name: "value", type: "uint256" },
					{ name: "validAfter", type: "uint256" },
					{ name: "validBefore", type: "uint256" },
					{ name: "nonce", type: "bytes32" },
				],
			};

			// Authorization message
			const authorization = {
				from: account as Address,
				to: merchantAddress as Address,
				value: value.toString(),
				validAfter: validAfter.toString(),
				validBefore: validBefore.toString(),
				nonce: nonce as Hex,
			};

			// Sign EIP-712 typed data
			const signature = await walletClient.signTypedData({
				account: account as Address,
				domain,
				types,
				primaryType: "TransferWithAuthorization",
				message: authorization,
			});

			// Build x402 PaymentPayload
			const paymentPayload = {
				x402Version: 1,
				scheme: "exact",
				network: "bsc-testnet",
				payload: {
					signature,
					authorization,
				},
			};

			// Step 2: Submit to server
			setMessage("☕ Step 2/2: Brewing your coffee...");

			const response = await fetch(`${SERVER_URL}/buy`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					amount,
					paymentPayload,
					compliance: complianceData, // x402b: optional compliance data
				}),
			});

			const data = await response.json();

			// Check X-PAYMENT-RESPONSE header (x402 HTTP transport)
			const paymentResponseHeader = response.headers.get("X-PAYMENT-RESPONSE");
			let parsedSettlementResponse: z.infer<
				typeof PaymentResponseHeaderSchema
			> | null = null;
			if (paymentResponseHeader) {
				try {
					parsedSettlementResponse = PaymentResponseHeaderSchema.parse(
						JSON.parse(atob(paymentResponseHeader)),
					);
					console.log("[x402] Settlement Response:", parsedSettlementResponse);
					setSettlementResponse(parsedSettlementResponse);
				} catch (e) {
					console.warn("[x402] Failed to parse X-PAYMENT-RESPONSE header:", e);
				}
			}

			// HTTP 402: Payment Required or Failed
			if (response.status === 402) {
				// x402 spec: PaymentRequirementsResponse returned on 402
				if (data.x402Version && data.error) {
					setMessage(`❌ Payment required: ${data.error}`);
				} else if (data.message) {
					setMessage(`❌ ${data.message}`);
				} else {
					setMessage("❌ Payment failed");
				}
				return;
			}

			// HTTP 200: Success
			if (data.success) {
				let msg =
					data.message ||
					(amount === 1
						? `☕ Thanks for the coffee!`
						: `☕ Thanks for ${amount} coffees!`);
				if (data.receipt) {
					msg += "\n📄 Receipt generated!";
					setReceipt(data.receipt);
				}
				setMessage(msg);

				// Trigger confetti animation across the whole page
				const duration = 3000; // 3 seconds
				const animationEnd = Date.now() + duration;
				const defaults = {
					startVelocity: 30,
					spread: 360,
					ticks: 60,
					zIndex: 0,
				};

				const randomInRange = (min: number, max: number) => {
					return Math.random() * (max - min) + min;
				};

				const interval = setInterval(() => {
					const timeLeft = animationEnd - Date.now();

					if (timeLeft <= 0) {
						clearInterval(interval);
						return;
					}

					const particleCount = 50 * (timeLeft / duration);

					// Fire confetti from random positions
					confetti({
						...defaults,
						particleCount,
						origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
					});
					confetti({
						...defaults,
						particleCount,
						origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
					});
				}, 250);

				// Add celebration animation to message box
				const messageBox = document.querySelector(".message-box");
				if (messageBox) {
					messageBox.classList.add("success-celebration");
					setTimeout(
						() => messageBox.classList.remove("success-celebration"),
						600,
					);
				}

				// Refresh balances after successful payment
				await fetchBalances(account, publicClient);
			} else {
				setMessage("❌ Payment failed: " + (data.message || "Unknown error"));
			}
		} catch (error: any) {
			console.error("Coffee purchase error:", error);
			setMessage("❌ " + (error.message || "Transaction failed"));
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="app">
			<div className="container">
				{/* ASCII Header */}
				<pre className="ascii-header">
					{`
╔═══════════════════════════════════════╗
║                                       ║
║         BUY DEV A COFFEE ☕           ║
║                                       ║
║    Powered by x402b on BNB Chain     ║
║                                       ║
╚═══════════════════════════════════════╝
`}
				</pre>

				{/* Network & Wallet Info */}
				<div className="info-box">
					{!account ? (
						<pre>
							{`┌─────────────────────────────────────┐
│ Network: BNB Testnet                │
│ Price: $0.01 USDT per coffee ☕     │
├─────────────────────────────────────┤
│ Wallet: Not Connected               │
└─────────────────────────────────────┘`}
						</pre>
					) : (
						<pre>
							{`┌─────────────────────────────────────┐
│ Network: BNB Testnet                │
│ Price: $0.01 USDT per coffee ☕     │
├─────────────────────────────────────┤
│ Wallet: ${account.slice(0, 6)}...${account.slice(-4)}            │
└─────────────────────────────────────┘`}
						</pre>
					)}
				</div>

				{/* Wallet Section */}
				{!account ? (
					<div className="connect-section">
						<button
							onClick={connectWallet}
							disabled={loading}
							className="btn-primary"
						>
							{loading ? "⏳ Connecting..." : "🔌 Connect Wallet"}
						</button>
					</div>
				) : (
					<>
						{/* Balance Display */}
						<div className="balance-section">
							<div
								style={{
									border: "2px solid #4ade80",
									padding: "16px",
									marginBottom: "16px",
									borderRadius: "8px",
									backgroundColor: "#ffffff",
									color: "#000000",
								}}
							>
								<h4
									style={{
										margin: "0 0 12px 0",
										fontSize: "15px",
										fontWeight: "bold",
										color: "#16a34a",
									}}
								>
									💰 Your Balances
								</h4>
								<div
									style={{
										margin: "0 0 12px 0",
										padding: "8px 12px",
										backgroundColor: "#fbbf24",
										borderRadius: "6px",
										fontSize: "13px",
									}}
								>
									<a
										href="https://www.bnbchain.org/en/testnet-faucet"
										target="_blank"
										rel="noopener noreferrer"
										style={{
											color: "#000",
											textDecoration: "none",
											fontWeight: "500",
										}}
									>
										🚰 Get 10 USDT from BNB Chain Testnet Faucet →
									</a>
								</div>
								<div style={{ display: "grid", gap: "8px", fontSize: "14px" }}>
									<div
										style={{ display: "flex", justifyContent: "space-between" }}
									>
										<span style={{ color: "#000" }}>pieUSD:</span>
										<span style={{ fontWeight: "bold", color: "#16a34a" }}>
											${parseFloat(pieUSDBalance).toFixed(2)}
										</span>
									</div>
									<div
										style={{ display: "flex", justifyContent: "space-between" }}
									>
										<span style={{ color: "#000" }}>USDT:</span>
										<span style={{ fontWeight: "bold", color: "#000" }}>
											${parseFloat(usdtBalance).toFixed(2)}
										</span>
									</div>
								</div>
							</div>
						</div>

						{/* Wrap/Unwrap Section */}
						<div
							style={{
								border: "2px solid #f97316",
								padding: "16px",
								marginBottom: "16px",
								borderRadius: "8px",
								backgroundColor: "#ffffff",
								color: "#000000",
							}}
						>
							<h4
								style={{
									margin: "0 0 12px 0",
									fontSize: "15px",
									fontWeight: "bold",
									color: "#ea580c",
								}}
							>
								🔄 Wrap / Unwrap
							</h4>
							<div style={{ display: "grid", gap: "12px" }}>
								{/* Wrap USDT to pieUSD */}
								<div>
									<label
										style={{
											display: "block",
											marginBottom: "4px",
											fontSize: "13px",
											color: "#000",
										}}
									>
										Wrap USDT → pieUSD
									</label>
									<div style={{ display: "flex", gap: "8px" }}>
										<input
											type="number"
											placeholder="Amount"
											value={wrapAmount}
											onChange={(e) => setWrapAmount(e.target.value)}
											disabled={isWrapping || loading}
											className="input-field"
											style={{ flex: "3", fontSize: "14px", padding: "10px" }}
											step="0.01"
											min="0"
										/>
										<button
											onClick={wrapUSDT}
											disabled={isWrapping || loading || !wrapAmount}
											className="btn-buy"
											style={{
												flex: "1",
												padding: "8px 16px",
												fontSize: "13px",
												minWidth: "80px",
											}}
										>
											{isWrapping ? "⏳" : "📥 Wrap"}
										</button>
									</div>
								</div>

								{/* Unwrap pieUSD to USDT */}
								<div>
									<label
										style={{
											display: "block",
											marginBottom: "4px",
											fontSize: "13px",
											color: "#000",
										}}
									>
										Unwrap pieUSD → USDT
									</label>
									<div style={{ display: "flex", gap: "8px" }}>
										<input
											type="number"
											placeholder="Amount"
											value={unwrapAmount}
											onChange={(e) => setUnwrapAmount(e.target.value)}
											disabled={isWrapping || loading}
											className="input-field"
											style={{ flex: "3", fontSize: "14px", padding: "10px" }}
											step="0.01"
											min="0"
										/>
										<button
											onClick={unwrapPieUSD}
											disabled={isWrapping || loading || !unwrapAmount}
											className="btn-buy"
											style={{
												flex: "1",
												padding: "8px 16px",
												fontSize: "13px",
												minWidth: "80px",
											}}
										>
											{isWrapping ? "⏳" : "📤 Unwrap"}
										</button>
									</div>
								</div>

								<p
									style={{
										fontSize: "11px",
										color: "#6b7280",
										margin: "4px 0 0 0",
									}}
								>
									💡 1 pieUSD = 1 USDT (1:1 backed). Wrap USDT to get pieUSD for
									gasless payments.
								</p>
							</div>
						</div>

						{/* x402b: Compliance Toggle */}
						<div className="compliance-toggle">
							<label
								style={{
									display: "flex",
									alignItems: "center",
									gap: "8px",
									fontSize: "14px",
								}}
							>
								<input
									type="checkbox"
									checked={showCompliance}
									onChange={(e) => {
										setShowCompliance(e.target.checked);
									}}
									disabled={loading}
								/>
								📄 Get compliance receipt (optional)
							</label>
						</div>

						{/* x402b: Compliance Form */}
						{showCompliance && (
							<div
								className="compliance-form"
								style={{
									border: "2px solid #4ade80",
									padding: "16px",
									marginBottom: "16px",
									borderRadius: "8px",
									backgroundColor: "#ffffff",
									color: "#000000",
								}}
							>
								<h4
									style={{
										margin: "0 0 16px 0",
										fontSize: "15px",
										fontWeight: "bold",
										color: "#000",
									}}
								>
									📄 Compliance Information
								</h4>
								<div style={{ display: "grid", gap: "12px" }}>
									{/* Jurisdiction */}
									<div>
										<label
											style={{
												display: "block",
												marginBottom: "4px",
												fontSize: "13px",
												fontWeight: "500",
												color: "#333",
											}}
										>
											Jurisdiction *
										</label>
										<select
											value={complianceJurisdiction}
											onChange={(e) =>
												setComplianceJurisdiction(e.target.value)
											}
											disabled={loading}
											style={{
												width: "100%",
												padding: "8px",
												fontSize: "13px",
												border: "1px solid #d1d5db",
												borderRadius: "4px",
												backgroundColor: "#fff",
												color: "#000",
											}}
										>
											{JURISDICTIONS.map((j) => (
												<option key={j.code} value={j.code}>
													{j.emoji} {j.name}
												</option>
											))}
										</select>
									</div>

									{/* Entity Type */}
									<div>
										<label
											style={{
												display: "block",
												marginBottom: "4px",
												fontSize: "13px",
												fontWeight: "500",
												color: "#333",
											}}
										>
											Entity Type *
										</label>
										<div style={{ display: "flex", gap: "16px" }}>
											<label
												style={{
													display: "flex",
													alignItems: "center",
													gap: "6px",
													fontSize: "13px",
													color: "#000",
												}}
											>
												<input
													type="radio"
													name="entityType"
													value="individual"
													checked={complianceEntityType === "individual"}
													onChange={(e) =>
														setComplianceEntityType(
															e.target.value as "individual" | "business",
														)
													}
													disabled={loading}
												/>
												Individual
											</label>
											<label
												style={{
													display: "flex",
													alignItems: "center",
													gap: "6px",
													fontSize: "13px",
													color: "#000",
												}}
											>
												<input
													type="radio"
													name="entityType"
													value="business"
													checked={complianceEntityType === "business"}
													onChange={(e) =>
														setComplianceEntityType(
															e.target.value as "individual" | "business",
														)
													}
													disabled={loading}
												/>
												Business
											</label>
										</div>
									</div>

									{/* Name */}
									<div>
										<label
											style={{
												display: "block",
												marginBottom: "4px",
												fontSize: "13px",
												fontWeight: "500",
												color: "#333",
											}}
										>
											{complianceEntityType === "business"
												? "Business Name"
												: "Full Name"}{" "}
											*
										</label>
										<input
											type="text"
											placeholder={
												complianceEntityType === "business"
													? "e.g., Acme Corp"
													: "e.g., John Doe"
											}
											value={complianceName}
											onChange={(e) => setComplianceName(e.target.value)}
											disabled={loading}
											style={{
												width: "100%",
												padding: "8px",
												fontSize: "13px",
												border: "1px solid #d1d5db",
												borderRadius: "4px",
												backgroundColor: "#fff",
												color: "#000",
											}}
										/>
									</div>

									{/* Email */}
									<div>
										<label
											style={{
												display: "block",
												marginBottom: "4px",
												fontSize: "13px",
												fontWeight: "500",
												color: "#333",
											}}
										>
											Email for Receipt *
										</label>
										<input
											type="email"
											placeholder="your@email.com"
											value={complianceEmail}
											onChange={(e) => setComplianceEmail(e.target.value)}
											disabled={loading}
											style={{
												width: "100%",
												padding: "8px",
												fontSize: "13px",
												border: "1px solid #d1d5db",
												borderRadius: "4px",
												backgroundColor: "#fff",
												color: "#000",
											}}
										/>
									</div>

									{/* Tax ID (optional) */}
									<div>
										<label
											style={{
												display: "block",
												marginBottom: "4px",
												fontSize: "13px",
												fontWeight: "500",
												color: "#333",
											}}
										>
											Tax ID / VAT Number (Optional)
										</label>
										<input
											type="text"
											placeholder="e.g., 12-3456789"
											value={complianceTaxId}
											onChange={(e) => setComplianceTaxId(e.target.value)}
											disabled={loading}
											style={{
												width: "100%",
												padding: "8px",
												fontSize: "13px",
												border: "1px solid #d1d5db",
												borderRadius: "4px",
												backgroundColor: "#fff",
												color: "#000",
											}}
										/>
									</div>

									{/* Privacy Notice */}
									<div
										style={{
											marginTop: "8px",
											padding: "10px",
											backgroundColor: "#f0fdf4",
											border: "1px solid #86efac",
											borderRadius: "4px",
										}}
									>
										<p
											style={{
												fontSize: "11px",
												margin: "0",
												color: "#166534",
												lineHeight: "1.5",
											}}
										>
											🔒 Your information will be included in a compliance
											receipt stored on BNB Greenfield (decentralized storage).
											This data is not stored on our servers.
										</p>
									</div>
								</div>
							</div>
						)}

						{/* x402: Settled Transaction Display */}
						{settlementResponse?.success && (
							<div
								style={{
									border: "2px solid #3b82f6",
									padding: "16px",
									marginTop: "16px",
									borderRadius: "8px",
									backgroundColor: "#ffffff",
								}}
							>
								<h4
									style={{
										margin: "0 0 12px 0",
										color: "#3b82f6",
										fontSize: "16px",
									}}
								>
									✅ Settlement Transaction
								</h4>
								<div style={{ fontSize: "13px", lineHeight: "1.8" }}>
									<p style={{ marginBottom: "8px", color: "#000000" }}>
										<strong>Network:</strong> {settlementResponse.network}
									</p>
									<p style={{ marginBottom: "8px", color: "#000000" }}>
										<strong>Transaction Hash:</strong>
									</p>
									<div style={{ marginBottom: "12px" }}>
										<a
											href={getBlockExplorerUrl(
												settlementResponse.network,
												settlementResponse.transaction,
											)}
											target="_blank"
											rel="noopener noreferrer"
											style={{
												color: "#3b82f6",
												textDecoration: "none",
												fontFamily: "monospace",
												fontSize: "12px",
												wordBreak: "break-all",
												display: "inline-block",
												padding: "4px 8px",
												backgroundColor: "#eff6ff",
												borderRadius: "4px",
												border: "1px solid #bfdbfe",
											}}
											onMouseEnter={(e) => {
												e.currentTarget.style.textDecoration = "underline";
											}}
											onMouseLeave={(e) => {
												e.currentTarget.style.textDecoration = "none";
											}}
										>
											🔗 {settlementResponse.transaction.slice(0, 10)}...
											{settlementResponse.transaction.slice(-8)}
										</a>
									</div>
									<p
										style={{
											marginBottom: "0",
											color: "#6B7280",
											fontSize: "11px",
										}}
									>
										Click the transaction hash to view it on the block explorer
									</p>
								</div>
							</div>
						)}

						{/* Buy Section */}
						<div className="buy-section">
							<div className="input-group">
								<label>Number of Coffees:</label>
								<input
									type="number"
									min="1"
									max="10"
									value={coffeeCount}
									onChange={(e) => setCoffeeCount(e.target.value)}
									disabled={loading}
									className="input-field"
								/>
							</div>

							<div className="cost-display">
								<pre>
									{`Cost: $${(parseFloat(coffeeCount) * 0.01).toFixed(2)} USDT`}
								</pre>
							</div>

							<button
								onClick={buyCoffee}
								disabled={true}
								className="btn-buy"
							>
								{loading ? "⏳ Processing..." : "☕ BUY COFFEE"}
							</button>
							<div style={{ textAlign: "center", marginTop: "12px", fontSize: "14px" }}>
								👁️ 🥧 wen mainnet?
							</div>
						</div>

						{/* x402b: Receipt Display */}
						{receipt && (
							<div
								className="receipt-box"
								style={{
									border: "2px solid #4CAF50",
									padding: "16px",
									marginTop: "16px",
									borderRadius: "8px",
									backgroundColor: "#ffffff",
								}}
							>
								<h4
									style={{
										margin: "0 0 12px 0",
										color: "#4CAF50",
										fontSize: "16px",
									}}
								>
									📄 Compliance Receipt Generated!
								</h4>
								<div style={{ fontSize: "13px", lineHeight: "1.8" }}>
									<p style={{ marginBottom: "8px", color: "#000000" }}>
										<strong>Receipt #:</strong> {receipt.receiptNumber}
									</p>
									<p style={{ marginBottom: "12px", color: "#6B7280" }}>
										<strong>Generated:</strong>{" "}
										{new Date(receipt.generatedAt).toLocaleString()}
									</p>
									<div
										style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}
									>
										<button
											onClick={() => openReceiptWindow(receipt as ReceiptData)}
											className="btn-buy"
											style={{
												padding: "8px 16px",
												fontSize: "12px",
												background: "#4CAF50",
												color: "#ffffff",
												flex: "1",
												minWidth: "120px",
											}}
										>
											📝 View Receipt
										</button>
										<button
											onClick={() =>
												downloadReceiptHTML(receipt as ReceiptData)
											}
											className="btn-buy"
											style={{
												padding: "8px 16px",
												fontSize: "12px",
												background: "#059669",
												color: "#ffffff",
												flex: "1",
												minWidth: "120px",
											}}
										>
											⬇️ Download HTML
										</button>
									</div>
									{receipt.downloadUrl && (
										<p
											style={{
												marginTop: "12px",
												fontSize: "11px",
												color: "#6B7280",
											}}
										>
											🔒 Stored on BNB Greenfield:{" "}
											<a
												href={receipt.downloadUrl}
												target="_blank"
												rel="noopener noreferrer"
												style={{ color: "#4CAF50" }}
											>
												View JSON
											</a>
										</p>
									)}
								</div>
							</div>
						)}
					</>
				)}

				{/* Message Box */}
				{message && (
					<div className="message-box">
						<pre>{message}</pre>
					</div>
				)}

				{/* Disconnect Wallet Button */}
				{account && (
					<div style={{ textAlign: "center", marginBottom: "1rem" }}>
						<button
							onClick={disconnectWallet}
							style={{
								padding: "8px 16px",
								fontSize: "12px",
								border: "2px solid #666",
								background: "#fff",
								color: "#666",
								cursor: "pointer",
								fontWeight: "bold",
							}}
						>
							🔌 Disconnect Wallet
						</button>
					</div>
				)}

				{/* Footer */}
				<div className="footer">
					<pre>
						{`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Powered by x402b Protocol on BNB Chain
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`}
					</pre>
				</div>
			</div>
		</div>
	);
}

export default App;
