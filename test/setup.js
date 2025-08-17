import chai from "chai";
import { hardhatChaiMatchers } from "@nomicfoundation/hardhat-chai-matchers";

chai.use(hardhatChaiMatchers);
global.expect = chai.expect;
