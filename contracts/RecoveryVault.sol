// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {Ownable} from "./hub/access/Ownable.sol";
import {IERC20} from "./hub/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "./hub/token/ERC20/extensions/IERC20Metadata.sol";
import {MerkleProof} from "./hub/utils/cryptography/MerkleProof.sol";
import {ReentrancyGuard} from "./hub/security/ReentrancyGuard.sol";
import {SafeERC20} from "./hub/token/ERC20/utils/SafeERC20.sol";

interface IOracle {
    function latestPrice() external view returns (int256 price, uint8 decimals);
}

interface IWETH {
    function deposit() external payable;
}

contract RecoveryVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    event BurnToken(address indexed tokenIn, uint256 amountIn, address refundToken, uint256 amountOut);
    event NewRoundStarted(uint256 roundId, uint256 woneBalance, uint256 usdcBalance, uint256 startTime);
    event RedeemProcessed(address indexed user, address indexed tokenIn, uint256 amountIn, uint256 amountOut);
    event VaultPaused(bool isPaused);
    event SupportedTokenUpdated(address token, bool allowed);
    event FeeTiersUpdated(uint256[] thresholds, uint16[] bps);

    uint256 public constant ROUND_DELAY = 24 hours;
    uint256 public constant WALLET_RESET_INTERVAL = 24 hours;

    address public immutable wONE;
    address public immutable usdc;
    address public devWallet;
    address public rmcWallet;
    bytes32 public merkleRoot;
    uint256 public currentRound;
    uint256 public roundStart;
    uint256 public dailyLimitUsd; // expressed in whole USD (no decimals)
    bool public isLocked;

    IOracle public oracle;

    mapping(address => bool) public supportedToken;
    address[] public supportedTokenList;
    mapping(uint256 => mapping(address => uint256)) public redeemedInRound; // USD integer
    mapping(address => uint256) public lastRedeemTimestamp;
    mapping(address => uint256) public fixedUsdPrice;

    uint256[] public feeThresholds = [100, 250, 1000]; // USD integer
    uint16[] public feeBps = [100, 50, 25, 10];

    modifier onlyWhitelisted(bytes32[] calldata proof) {
        require(_verifyWhitelist(msg.sender, proof), "Not whitelisted");
        _;
    }

    modifier roundActive() {
        require(!isLocked, "Contract is locked");
        require(block.timestamp >= roundStart, "Round not started");
        (uint256 w, uint256 u) = getVaultBalances();
        require(w > 0 || u > 0, "No funds");
        _;
    }

    constructor(
        address _owner,
        address _devWallet,
        address _rmcWallet,
        address _wone,
        address _usdc,
        address[] memory _supportedTokens,
        uint256 _dailyLimitUsd,
        address _oracle
    ) {
        _transferOwnership(_owner);
        devWallet = _devWallet;
        rmcWallet = _rmcWallet;
        wONE = _wone;
        usdc = _usdc;
        dailyLimitUsd = _dailyLimitUsd;
        oracle = IOracle(_oracle);

        for (uint i = 0; i < _supportedTokens.length; i++) {
            supportedToken[_supportedTokens[i]] = true;
            supportedTokenList.push(_supportedTokens[i]);
            emit SupportedTokenUpdated(_supportedTokens[i], true);
        }
    }

    function redeem(
        address tokenIn,
        uint256 amountIn,
        address redeemIn,
        bytes32[] calldata proof
    ) external payable nonReentrant roundActive onlyWhitelisted(proof) {
        address resolvedTokenIn = tokenIn;

        if (tokenIn == address(0)) {
            require(msg.value == amountIn, "Mismatch ONE amount");
            require(wONE != address(0), "wONE not configured");
            IWETH(wONE).deposit{value: amountIn}();
            resolvedTokenIn = wONE;
        } else {
            require(msg.value == 0, "Do not send ONE with ERC20");
            IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        }

        (,,,,,,uint256 usdValue,,,,) = quoteRedeem(msg.sender, resolvedTokenIn, amountIn, redeemIn, proof);

        // Enforce 1:1 refund to avoid unit mismatches when conversion is not implemented yet
        require(redeemIn == resolvedTokenIn, "Only 1:1 redeem supported");

        _resetIfNeeded(msg.sender);
        redeemedInRound[currentRound][msg.sender] += usdValue;

        uint256 fee = _calculateFee(amountIn, usdValue);
        uint256 refundAmount = amountIn - fee;

        IERC20(redeemIn).safeTransfer(msg.sender, refundAmount);
        IERC20(redeemIn).safeTransfer(devWallet, fee);

        emit BurnToken(resolvedTokenIn, amountIn, redeemIn, refundAmount);
        emit RedeemProcessed(msg.sender, resolvedTokenIn, amountIn, refundAmount);
    }

        /// @notice Returns the last timestamp when the user performed a redeem.
    /// @param user Address of the wallet
    /// @return Timestamp in seconds since epoch
    function getLastRedeemTimestamp(address user) external view returns (uint256) {
        return lastRedeemTimestamp[user];
    }

        function quoteRedeem(
        address user,
        address tokenIn,
        uint256 amountIn,
        address redeemIn,
        bytes32[] calldata proof
    ) public view returns (
        bool whitelisted,
        bool roundIsActive,
        uint256 feeAmount,
        uint256 refundAmount,
        uint256 userLimitUsdBefore,
        uint256 userLimitUsdAfter,
        uint256 usdValue,
        uint8 tokenInDecimals,
        uint8 redeemInDecimals,
        uint256 oraclePrice,
        uint8 oracleDecimals
    ) {
        whitelisted = _verifyWhitelist(user, proof);
        roundIsActive = !isLocked && block.timestamp >= roundStart;

        tokenInDecimals = IERC20Metadata(tokenIn).decimals();
        redeemInDecimals = IERC20Metadata(redeemIn).decimals();

        (int256 _price, uint8 _decimals) = oracle.latestPrice();
        require(_price > 0, "Invalid oracle");
        oraclePrice = uint256(_price);
        oracleDecimals = _decimals;

        if (tokenIn == wONE) {
            uint256 one18 = amountIn * 1e18 / (10 ** tokenInDecimals);
            usdValue = (one18 * oraclePrice) / (10 ** oracleDecimals) / 1e18;
        } else if (tokenIn == usdc) {
            uint8 usdcDec = IERC20Metadata(usdc).decimals();
            usdValue = amountIn / (10 ** usdcDec);
        } else if (fixedUsdPrice[tokenIn] > 0) {
            uint256 decimals = IERC20Metadata(tokenIn).decimals();
            usdValue = (amountIn * fixedUsdPrice[tokenIn]) / (10 ** decimals) / 1e18;
        } else {
            revert("Unsupported valuation");
        }

        uint256 redeemed = redeemedInRound[currentRound][user];
        if (block.timestamp - lastRedeemTimestamp[user] >= WALLET_RESET_INTERVAL) {
            redeemed = 0;
        }

        userLimitUsdBefore = dailyLimitUsd > redeemed ? dailyLimitUsd - redeemed : 0;
        require(usdValue <= userLimitUsdBefore, "Exceeds daily limit");
        userLimitUsdAfter = userLimitUsdBefore - usdValue;

        uint256 fee = _calculateFee(amountIn, usdValue);
        feeAmount = fee;
        refundAmount = amountIn - fee;
    }

    function getUserLimit(address wallet) external view returns (uint256 remainingUSD) {
        uint256 redeemed = redeemedInRound[currentRound][wallet];
        if (block.timestamp - lastRedeemTimestamp[wallet] >= WALLET_RESET_INTERVAL) {
            redeemed = 0;
        }
        remainingUSD = dailyLimitUsd > redeemed ? dailyLimitUsd - redeemed : 0;
    }

    function _calculateFee(uint256 amountIn, uint256 usdValue) internal view returns (uint256) {
        for (uint i = 0; i < feeThresholds.length; i++) {
            if (usdValue <= feeThresholds[i]) {
                return (amountIn * feeBps[i]) / 10_000;
            }
        }
        return (amountIn * feeBps[feeBps.length - 1]) / 10_000;
    }

    function getVaultBalances() public view returns (uint256 woneBalance, uint256 usdcBalance) {
        woneBalance = IERC20(wONE).balanceOf(address(this));
        usdcBalance = IERC20(usdc).balanceOf(address(this));
    }

    function getRoundInfo() external view returns (
        uint256 roundId,
        uint256 startTime,
        bool isActive,
        bool paused,
        uint256 limitUsd
    ) {
        (uint256 w, uint256 u) = getVaultBalances();
        return (currentRound, roundStart, !isLocked && block.timestamp >= roundStart && (w > 0 || u > 0), isLocked, dailyLimitUsd);
    }

    function getSupportedTokens() external view returns (address[] memory) {
        return supportedTokenList;
    }

    function getFeeTiers() external view returns (uint256[] memory thresholds, uint16[] memory bpsOut) {
        return (feeThresholds, feeBps);
    }

    function setMerkleRoot(bytes32 _root) external onlyOwner {
        merkleRoot = _root;
    }

    function setSupportedToken(address token, bool allowed) external onlyOwner {
        supportedToken[token] = allowed;
        bool exists;
        for (uint i = 0; i < supportedTokenList.length; i++) {
            if (supportedTokenList[i] == token) {
                exists = true;
                if (!allowed) {
                    supportedTokenList[i] = supportedTokenList[supportedTokenList.length - 1];
                    supportedTokenList.pop();
                }
                break;
            }
        }
        if (!exists && allowed) {
            supportedTokenList.push(token);
        }
        emit SupportedTokenUpdated(token, allowed);
    }

    function setLocked(bool _status) external onlyOwner {
        isLocked = _status;
        emit VaultPaused(_status);
    }

    function setDailyLimit(uint256 usdAmount) external onlyOwner {
        dailyLimitUsd = usdAmount;
    }

    function setOracle(address _oracle) external onlyOwner {
        oracle = IOracle(_oracle);
    }

    function setDevWallet(address wallet) external onlyOwner {
        devWallet = wallet;
    }

    function setRmcWallet(address wallet) external onlyOwner {
        rmcWallet = wallet;
    }

    function setFeeTiers(uint256[] calldata thresholds, uint16[] calldata bps) external onlyOwner {
        require(thresholds.length + 1 == bps.length, "Invalid fee config");
        feeThresholds = thresholds;
        feeBps = bps;
        emit FeeTiersUpdated(thresholds, bps);
    }

    function setFixedUsdPrice(address token, uint256 usdPrice18) external onlyOwner {
        require(supportedToken[token], "Not supported");
        fixedUsdPrice[token] = usdPrice18;
    }

    function withdrawFunds(address token) external onlyOwner {
        require(token == wONE || token == usdc, "Token not allowed");
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "Nothing to withdraw");
        IERC20(token).safeTransfer(rmcWallet, balance);
    }

    function startNewRound(uint256 _roundId) external onlyOwner {
        require(_roundId > currentRound, "Round ID must increase");
        (uint256 w, uint256 u) = getVaultBalances();
        require(w > 0 || u > 0, "No funds");
        currentRound = _roundId;
        roundStart = block.timestamp + ROUND_DELAY;
        emit NewRoundStarted(_roundId, w, u, roundStart);
    }

    function _verifyWhitelist(address user, bytes32[] calldata proof) internal view returns (bool) {
        return MerkleProof.verify(proof, merkleRoot, keccak256(abi.encodePacked(user)));
    }

    function _resetIfNeeded(address user) internal {
        if (block.timestamp - lastRedeemTimestamp[user] >= WALLET_RESET_INTERVAL) {
            redeemedInRound[currentRound][user] = 0;
        }
        lastRedeemTimestamp[user] = block.timestamp;
    }
}
