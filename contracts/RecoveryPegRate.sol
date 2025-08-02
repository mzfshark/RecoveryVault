// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {Ownable} from "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/refs/tags/v4.9.3/contracts/access/Ownable.sol";
import {IERC20} from "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/refs/tags/v4.9.3/contracts/token/ERC20/IERC20.sol";
import {MerkleProof} from "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/refs/tags/v4.9.3/contracts/utils/cryptography/MerkleProof.sol";

contract RecoveryPegRate is Ownable {
    event BurnToken(address indexed tokenIn, uint256 amountIn, address refundToken, uint256 amountOut);
    event NewRoundStarted(uint256 roundId, uint256 availableFunds, uint256 startTime);
    event RedeemProcessed(address indexed user, address indexed tokenIn, uint256 amountIn, uint256 amountOut);

    uint256 public constant FEE_BPS = 100;
    uint256 public constant MAX_REDEEM_PER_WALLET = 200e6;
    uint256 public constant ROUND_DELAY = 24 hours;
    uint256 public constant WALLET_RESET_INTERVAL = 48 hours;

    address public refundToken;
    bytes32 public merkleRoot;
    uint256 public currentRound;
    uint256 public roundStart;
    uint256 public roundFunds;
    bool public isLocked;

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

    function setMerkleRoot(bytes32 _root) external onlyOwner {
        merkleRoot = _root;
    }

    function setRefundToken(address _usdc) external onlyOwner {
        refundToken = _usdc;
    }

    function lock(bool _status) external onlyOwner {
        isLocked = _status;
    }

    function startNewRound(uint256 _roundId) external onlyOwner {
        require(_roundId > currentRound, "Round ID must increase");
        uint256 balance = IERC20(refundToken).balanceOf(address(this));
        require(balance > 0, "No USDC");
        currentRound = _roundId;
        roundFunds = balance;
        roundStart = block.timestamp + ROUND_DELAY;
        emit NewRoundStarted(_roundId, roundFunds, roundStart);
    }

    function redeem(
        address tokenIn,
        uint256 amountIn,
        bytes32[] calldata proof
    ) external roundActive onlyWhitelisted(proof) {
        require(amountIn > 0, "Invalid amount");
        require(IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn), "Transfer failed");

        _resetIfNeeded(msg.sender);
        require(redeemedInRound[currentRound][msg.sender] + amountIn <= MAX_REDEEM_PER_WALLET, "Exceeds limit");

        uint256 fee = (amountIn * FEE_BPS) / 10_000;
        uint256 refundAmount = amountIn - fee;
        redeemedInRound[currentRound][msg.sender] += amountIn;
        roundFunds -= refundAmount;

        require(IERC20(refundToken).transfer(msg.sender, refundAmount), "Refund failed");

        emit BurnToken(tokenIn, amountIn, refundToken, refundAmount);
        emit RedeemProcessed(msg.sender, tokenIn, amountIn, refundAmount);
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
