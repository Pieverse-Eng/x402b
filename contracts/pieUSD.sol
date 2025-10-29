// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title pieUSD
 * @notice A wrapped USDT token with EIP-3009 support for gasless payments on BNB Chain
 * @dev Implements EIP-3009 transferWithAuthorization for x402 protocol compatibility
 *
 * Features:
 * - 1:1 USDT backing (deposit/redeem)
 * - EIP-3009 gasless transfers
 * - x402 protocol compatible
 * - Instant deposit and redeem
 */
contract pieUSD is ERC20, EIP712, Ownable {
    using ECDSA for bytes32;

    // EIP-3009 storage
    mapping(address => mapping(bytes32 => bool)) private _authorizationStates;

    // USDT token address on BNB Chain
    IERC20 public immutable usdt;

    // EIP-3009 typehash
    bytes32 public constant TRANSFER_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );

    // Events
    event Deposit(address indexed user, uint256 amount);
    event Redeem(address indexed user, uint256 amount);
    event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);
    event AuthorizationCanceled(address indexed authorizer, bytes32 indexed nonce);

    // Errors
    error AuthorizationExpired();
    error AuthorizationNotYetValid();
    error AuthorizationAlreadyUsed();
    error InvalidAuthorization();
    error InsufficientBalance();
    error DepositFailed();
    error RedeemFailed();

    /**
     * @notice Constructor
     * @param _usdt Address of USDT token on BNB Chain
     */
    constructor(address _usdt) ERC20("pieUSD", "pieUSD") EIP712("pieUSD", "1") Ownable(msg.sender) {
        require(_usdt != address(0), "Invalid USDT address");
        usdt = IERC20(_usdt);
    }

    /**
     * @notice Deposit USDT and receive pieUSD 1:1
     * @param amount Amount of USDT to deposit
     */
    function deposit(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");

        // Transfer USDT from user to this contract
        bool success = usdt.transferFrom(msg.sender, address(this), amount);
        if (!success) revert DepositFailed();

        // Mint pieUSD 1:1
        _mint(msg.sender, amount);

        emit Deposit(msg.sender, amount);
    }

    /**
     * @notice Redeem pieUSD for USDT 1:1
     * @param amount Amount of pieUSD to redeem
     */
    function redeem(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        require(balanceOf(msg.sender) >= amount, "Insufficient balance");

        // Burn pieUSD
        _burn(msg.sender, amount);

        // Transfer USDT back to user
        bool success = usdt.transfer(msg.sender, amount);
        if (!success) revert RedeemFailed();

        emit Redeem(msg.sender, amount);
    }

    /**
     * @notice Execute a transfer with a signed authorization (EIP-3009)
     * @param from Payer's address (Authorizer)
     * @param to Payee's address
     * @param value Amount to be transferred
     * @param validAfter The time after which this is valid (unix time)
     * @param validBefore The time before which this is valid (unix time)
     * @param nonce Unique nonce
     * @param v v of the signature
     * @param r r of the signature
     * @param s s of the signature
     */
    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        _requireValidAuthorization(from, nonce, validAfter, validBefore);

        // Verify signature
        bytes32 structHash = keccak256(
            abi.encode(TRANSFER_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce)
        );

        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = digest.recover(v, r, s);

        if (signer != from) revert InvalidAuthorization();

        // Mark authorization as used
        _authorizationStates[from][nonce] = true;
        emit AuthorizationUsed(from, nonce);

        // Execute transfer
        _transfer(from, to, value);
    }

    /**
     * @notice Execute a transfer with a signed authorization (compact signature)
     * @param from Payer's address (Authorizer)
     * @param to Payee's address
     * @param value Amount to be transferred
     * @param validAfter The time after which this is valid (unix time)
     * @param validBefore The time before which this is valid (unix time)
     * @param nonce Unique nonce
     * @param signature Signature bytes (65 bytes)
     */
    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes memory signature
    ) external {
        _requireValidAuthorization(from, nonce, validAfter, validBefore);

        // Verify signature
        bytes32 structHash = keccak256(
            abi.encode(TRANSFER_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce)
        );

        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = digest.recover(signature);

        if (signer != from) revert InvalidAuthorization();

        // Mark authorization as used
        _authorizationStates[from][nonce] = true;
        emit AuthorizationUsed(from, nonce);

        // Execute transfer
        _transfer(from, to, value);
    }

    /**
     * @notice Attempt to cancel an authorization
     * @param authorizer Authorizer's address
     * @param nonce Nonce of the authorization
     * @param v v of the signature
     * @param r r of the signature
     * @param s s of the signature
     */
    function cancelAuthorization(address authorizer, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external {
        _requireUnusedAuthorization(authorizer, nonce);

        bytes32 structHash = keccak256(
            abi.encode(keccak256("CancelAuthorization(address authorizer,bytes32 nonce)"), authorizer, nonce)
        );

        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = digest.recover(v, r, s);

        if (signer != authorizer) revert InvalidAuthorization();

        _authorizationStates[authorizer][nonce] = true;
        emit AuthorizationCanceled(authorizer, nonce);
    }

    /**
     * @notice Returns the state of an authorization
     * @param authorizer Authorizer's address
     * @param nonce Nonce of the authorization
     * @return True if the nonce is used
     */
    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool) {
        return _authorizationStates[authorizer][nonce];
    }

    /**
     * @dev Check that an authorization is unused and valid
     */
    function _requireValidAuthorization(address authorizer, bytes32 nonce, uint256 validAfter, uint256 validBefore)
        private
        view
    {
        if (block.timestamp < validAfter) revert AuthorizationNotYetValid();
        if (block.timestamp > validBefore) revert AuthorizationExpired();
        _requireUnusedAuthorization(authorizer, nonce);
    }

    /**
     * @dev Check that authorization is unused
     */
    function _requireUnusedAuthorization(address authorizer, bytes32 nonce) private view {
        if (_authorizationStates[authorizer][nonce]) revert AuthorizationAlreadyUsed();
    }

    /**
     * @notice Get USDT reserves (total USDT held by this contract)
     */
    function getReserves() external view returns (uint256) {
        return usdt.balanceOf(address(this));
    }

    /**
     * @notice EIP-712 domain separator
     */
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}
