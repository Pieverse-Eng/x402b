// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";

/**
 * @title PieWrappedERC20
 * @notice A wrapped ERC20 token with EIP-3009 support for gasless payments
 * @dev Implements EIP-3009 transferWithAuthorization and receiveWithAuthorization for x402 protocol compatibility
 *
 * Features:
 * - 1:1 underlying token backing (deposit/redeem)
 * - EIP-3009 gasless transfers (push & pull flows)
 * - x402 protocol compatible
 * - Instant deposit and redeem
 */
contract PieWrappedERC20 is
    Initializable,
    ERC20Upgradeable,
    EIP712Upgradeable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    using ECDSA for bytes32;
    using SafeERC20 for IERC20;

    // EIP-3009 storage
    mapping(address => mapping(bytes32 => bool)) private _authorizationStates;

    // Underlying ERC20 token address
    IERC20 public underlying;

    // EIP-3009 typehashes
    bytes32 public constant TRANSFER_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    bytes32 public constant RECEIVE_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    bytes32 public constant CANCEL_AUTHORIZATION_TYPEHASH =
        keccak256("CancelAuthorization(address authorizer,bytes32 nonce)");

    // Events
    event Deposit(address indexed user, uint256 amount);
    event Redeem(address indexed user, uint256 amount);
    event AuthorizationUsed(address indexed authorizer, address indexed to, uint256 value, bytes32 indexed nonce);
    event AuthorizationCanceled(address indexed authorizer, bytes32 indexed nonce);

    // Errors
    error AmountMustBeGreaterThanZero();
    error InsufficientBalance();
    error UnauthorizedReceiver();
    error TransferAmountMismatch();
    error InvalidUnderlyingAddress();
    error InvalidUnderlyingSymbol();
    error AuthorizationExpired();
    error AuthorizationNotYetValid();
    error AuthorizationAlreadyUsed();
    error InvalidAuthorization();

    /**
     * @notice Disable initializers on the implementation contract
     */
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializes the proxy
     * @param _underlying Address of underlying ERC20 token
     * @param underlyingSymbol Symbol of underlying token (e.g. "USDT")
     */
    function initialize(address _underlying, string memory underlyingSymbol) external initializer {
        if (_underlying == address(0)) revert InvalidUnderlyingAddress();
        if (bytes(underlyingSymbol).length == 0) revert InvalidUnderlyingSymbol();

        string memory pieSymbol = string.concat("pie", underlyingSymbol);
        __ERC20_init(pieSymbol, pieSymbol);
        __EIP712_init(pieSymbol, "1");
        __Ownable_init(_msgSender());
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        underlying = IERC20(_underlying);
    }

    /**
     * @notice Deposit underlying token and receive wrapped token 1:1
     * @param amount Amount of underlying token to deposit
     */
    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert AmountMustBeGreaterThanZero();

        uint256 balanceBefore = underlying.balanceOf(address(this));
        underlying.safeTransferFrom(msg.sender, address(this), amount);
        uint256 balanceAfter = underlying.balanceOf(address(this));

        uint256 received = balanceAfter - balanceBefore;
        if (received != amount) revert TransferAmountMismatch();

        _mint(msg.sender, received);

        emit Deposit(msg.sender, received);
    }

    /**
     * @notice Redeem wrapped token for underlying token 1:1
     * @param amount Amount of wrapped tokens to redeem
     */
    function redeem(uint256 amount) external nonReentrant {
        if (amount == 0) revert AmountMustBeGreaterThanZero();
        if (balanceOf(msg.sender) < amount) revert InsufficientBalance();

        _burn(msg.sender, amount);

        underlying.safeTransfer(msg.sender, amount);

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

        _executeAuthorization(from, to, value, nonce);
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

        _executeAuthorization(from, to, value, nonce);
        _transfer(from, to, value);
    }

    function receiveWithAuthorization(
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
        if (to != msg.sender) revert UnauthorizedReceiver();

        _requireValidAuthorization(from, nonce, validAfter, validBefore);

        bytes32 structHash =
            keccak256(abi.encode(RECEIVE_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce));

        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = digest.recover(v, r, s);

        if (signer != from) revert InvalidAuthorization();

        _executeAuthorization(from, to, value, nonce);
        _transfer(from, to, value);
    }

    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes memory signature
    ) external {
        if (to != msg.sender) revert UnauthorizedReceiver();

        _requireValidAuthorization(from, nonce, validAfter, validBefore);

        bytes32 structHash =
            keccak256(abi.encode(RECEIVE_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce));

        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = digest.recover(signature);

        if (signer != from) revert InvalidAuthorization();

        _executeAuthorization(from, to, value, nonce);
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

        bytes32 structHash = keccak256(abi.encode(CANCEL_AUTHORIZATION_TYPEHASH, authorizer, nonce));

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

    function _executeAuthorization(address authorizer, address to, uint256 value, bytes32 nonce) private {
        _authorizationStates[authorizer][nonce] = true;
        emit AuthorizationUsed(authorizer, to, value, nonce);
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
     * @notice Get underlying token reserves (total underlying held by this contract)
     */
    function getReserves() external view returns (uint256) {
        return underlying.balanceOf(address(this));
    }

    /**
     * @notice EIP-712 domain separator
     */
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
