require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-etherscan");
require("hardhat-deploy");
require("solidity-coverage");
require("hardhat-gas-reporter");
require("hardhat-contract-sizer");
require("dotenv").config();

const SEPOLIA_RPC_URL =
	process.env.SEPOLIA_RPC_URL ||
	"https://eth-sepolia.g.alchemy.com/v2/Bb1vDq6uoI5I0m2K8oDjtUMIlupXG_Sx";
/* In order to be able to pull the sepolia rpc url from the .env file we must run yarn add --dev dotenv first
Then include the second require statement above*/
const PRIVATE_KEY =
	process.env.PRIVATE_KEY || "cae6586fff22dc97ff75a7084f5b828efe92ebbf1e20e374bc465fb72a779825";

const COINMARKETCAP_API_KEY = process.env.COINMARKETCAP_API_KEY;
/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
	defaultNetwork: "hardhat",
	networks: {
		hardhat: {
			chainId: 31337,
			blockConfirmations: 1,
		},
		sepolia: {
			chainId: 11155111, // Retrieved via sepolia etherscan
			blockConfirmations: 6,
			url: SEPOLIA_RPC_URL,
			accounts: [PRIVATE_KEY],
		},
	},
	solidity: "0.8.8",
	namedAccounts: {
		deployer: {
			default: 0,
		},
		player: {
			default: 1,
		},
	},
	gasReporter: {
		// Generates a nice report when yarn hardhat test is run
		enabled: false, // Installed via yarn add hardhat-gas-reporter --dev
		outputFile: "gas-report.txt",
		noColors: true, // When we output ot a file the colors get messy
		currency: "USD", // In order to get the currecy we will ne to make an API call to a place like coinMarketCap
		coinmarketcap: COINMARKETCAP_API_KEY,
		token: "ETH",
	},
};
