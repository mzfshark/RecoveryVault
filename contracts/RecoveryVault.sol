// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {Ownable} from "./hub/access/Ownable.sol"; 
import {IERC20} from "./hub/token/ERC20/IERC20.sol";
import {MerkleProof} from "./hub/utils/cryptography/MerkleProof.sol";

interface IOracle {
    function getPrice() external view returns (uint256);
}

contract RecoveryVault is Ownable {
    event BurnToken(address indexed tokenIn, uint256 amountIn, address refundToken, uint256 amountOut);
    event NewRoundStarted(uint256 roundId, uint256 availableFunds, uint256 startTime);
    event RedeemProcessed(address indexed user, address indexed tokenIn, uint256 amountIn, uint256 amountOut);
    event VaultPaused(bool isPaused);

    uint256 public constant ROUND_DELAY = 24 hours;
    uint256 public constant WALLET_RESET_INTERVAL = 24 hours;

    address public immutable wONE;
    address public devWallet;
    address public rmcWallet;
    bytes32 public merkleRoot;
    uint256 public currentRound;
    uint256 public roundStart;
    uint256 public roundFunds;
    uint256 public dailyLimitUsd;
    bool public isLocked;

    IOracle public oracle;

    mapping(address => bool) public supportedToken;
    mapping(uint256 => mapping(address => uint256)) public redeemedInRound;
    mapping(address => uint256) public lastRedeemTimestamp;

    modifier onlyWhitelisted(bytes32[] calldata proof) {
        require(_verifyWhitelist(msg.sender, proof), "Not whitelisted");
        _;
    }

    modifier roundActive() {
        require(!isLocked, "Contract is locked");
        require(block.timestamp >= roundStart, "Round not started");
        require(roundFunds > 0, "No funds");
        _;
    }

    constructor(
        address _owner,
        address _devWallet,
        address _rmcWallet,
        address[] memory _supportedTokens,
        uint256 _dailyLimitUsd,
        address _oracle
    ) {
        _transferOwnership(_owner);
        devWallet = _devWallet;
        rmcWallet = _rmcWallet;
        wONE = 0xcF664087a5bB0237a0BAd6742852ec6c8d69A27a;
        dailyLimitUsd = _dailyLimitUsd;
        oracle = IOracle(_oracle);

        for (uint i = 0; i < _supportedTokens.length; i++) {
            supportedToken[_supportedTokens[i]] = true;
        }
    }

    function setMerkleRoot(bytes32 _root) external onlyOwner {
        merkleRoot = _root;
    }

    function setSupportedToken(address token, bool allowed) external onlyOwner {
        supportedToken[token] = allowed;
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

    function withdrawFunds() external onlyOwner {
        uint256 balance = IERC20(wONE).balanceOf(address(this));
        require(balance > 0, "Nothing to withdraw");
        require(IERC20(wONE).transfer(rmcWallet, balance), "Withdraw failed");
    }

    function startNewRound(uint256 _roundId) external onlyOwner {
        require(_roundId > currentRound, "Round ID must increase");
        uint256 balance = IERC20(wONE).balanceOf(address(this));
        require(balance > 0, "No funds");
        currentRound = _roundId;
        roundFunds = balance;
        roundStart = block.timestamp + ROUND_DELAY;
        emit NewRoundStarted(_roundId, roundFunds, roundStart);
    }

    function redeem(
        address tokenIn,
        uint256 amountIn,
        bytes32[] calldata proof
    ) external roundActive {
        require(_verifyWhitelist(msg.sender, proof), "Not whitelisted");
        require(supportedToken[tokenIn], "Token not supported");
        require(amountIn > 0, "Invalid amount");

        _resetIfNeeded(msg.sender);

        uint256 usdToOneRate = oracle.getPrice();
        uint256 maxAmount = (dailyLimitUsd * 1e18) / usdToOneRate;

        require(redeemedInRound[currentRound][msg.sender] + amountIn <= maxAmount, "Exceeds daily limit");

        require(IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn), "Transfer failed");

        uint256 fee = _calculateFee(amountIn, usdToOneRate);
        uint256 refundAmount = amountIn - fee;

        require(refundAmount <= roundFunds, "Insufficient vault funds");

        redeemedInRound[currentRound][msg.sender] += amountIn;
        roundFunds -= refundAmount;

        require(IERC20(wONE).transfer(msg.sender, refundAmount), "Refund failed");
        require(IERC20(wONE).transfer(devWallet, fee), "Fee transfer failed");

        emit BurnToken(tokenIn, amountIn, wONE, refundAmount);
        emit RedeemProcessed(msg.sender, tokenIn, amountIn, refundAmount);
    }

    function getUserLimit(address wallet) external view returns (uint256 remainingUSD) {
        uint256 usdToOneRate = oracle.getPrice();
        uint256 maxAmount = (dailyLimitUsd * 1e18) / usdToOneRate;
        uint256 redeemed = redeemedInRound[currentRound][wallet];

        if (block.timestamp - lastRedeemTimestamp[wallet] >= WALLET_RESET_INTERVAL) {
            redeemed = 0;
        }
        uint256 remaining = maxAmount > redeemed ? maxAmount - redeemed : 0;
        return (remaining * usdToOneRate) / 1e18;
    }

    function _calculateFee(uint256 amountIn, uint256 usdToOneRate) internal pure returns (uint256) {
        uint256 usdValue = (amountIn * usdToOneRate) / 1e18;
        if (usdValue <= 100_000e18) return (amountIn * 100) / 10_000;
        if (usdValue <= 250_000e18) return (amountIn * 50) / 10_000;
        if (usdValue <= 1_000_000e18) return (amountIn * 25) / 10_000;
        return (amountIn * 10) / 10_000;
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
