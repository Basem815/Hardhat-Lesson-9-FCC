const { network, ethers } = require("hardhat");
const { developmentChains } = require("../helper-hardhat.config");

/* These two constants are teh constructor arguments for VRFCoordinatorV2Mock */
const BASE_FEE = ethers.utils.parseEther("0.25"); // 0.25 is the Coordinator Flat Fee mwntioed for Sepolia on chainlink docs
// It costs 0.25 LINK per request (the premium)
const GAS_PRICE_LINK = 1e9; // A calculated value based on the gas price of the chain.  (link per gas)

/* Chainlink nodes are the ones that pay the gas price of the functions checkUpKeep and performUpKeep
They get payed in oracle gas to offset those costs 
The price of requests therefore changes based on the price of gas
*/

module.exports = async ({ getNamedAccounts, deployments }) => {
	const { deploy, log } = deployments;
	const { deployer } = await getNamedAccounts(); // Need to update config file to include namedAccounts

	// const chainId = network.config.chainId;

	if (developmentChains.includes(network.name)) {
		log("Local network detected! Deploying mocks..");
		await deploy("VRFCoordinatorV2Mock", {
			from: deployer,
			log: true,
			args: [BASE_FEE, GAS_PRICE_LINK], // Look at the constructor of this .sol file
		});
		log("Mock deployed!");
		log("_------------------------------");
	}
};
module.exports.tags = ["all", "mocks"];
