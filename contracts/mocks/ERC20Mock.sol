// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/refs/tags/v4.9.3/contracts/token/ERC20/ERC20.sol";

contract ERC20Mock is ERC20 {
    constructor(string memory name, string memory symbol, uint8 decimals_) ERC20(name, symbol) {
        _decimals = decimals_;
    }

    uint8 private _decimals;

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
