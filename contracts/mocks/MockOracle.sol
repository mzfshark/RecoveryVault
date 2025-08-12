// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "../RecoveryVault.sol"; // optional if you want interface reuse

contract MockOracle is IOracle {
    uint256 private _price;

    constructor(uint256 initialPrice) {
        _price = initialPrice;
    }

    function setPrice(uint256 newPrice) external {
        _price = newPrice;
    }

    function getPrice() external view override returns (uint256) {
        return _price;
    }
}
