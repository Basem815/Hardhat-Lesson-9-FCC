const { getNamedAccounts, deployments, ethers } = require("hardhat");
const { developmentChains, networkConfig } = require("../../helper-hardhat.config");
const { assert, expect } = require("chai");
!developmentChains.includes(network.name)
	? describe.skip
	: describe("Lottery", async function () {
			let lottery, vrfCoordinatorV2Mock, lotteryEntranceFee, deployer;
			const chainId = network.config.chainId;

			beforeEach(async function () {
				// const { deployer } = await getNamedAccounts();
				deployer = (await getNamedAccounts()).deployer;
				await deployments.fixture(["all"]);
				vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer);
				lottery = await ethers.getContract("Lottery", deployer);
				lotteryEntranceFee = await lottery.getEntranceFee();
			});

			describe("Constructor", async function () {
				it("Initializes the lottery correctly", async function () {
					// Good practice: Have 1 assert per 'it' function
					const lotteryState = await lottery.getLotteryState();
					const interval = await lottery.getInterval();
					assert.equal(lotteryState.toString(), "0");

					assert.equal(interval.toString(), networkConfig[chainId]["interval"]);
					// Add more tests for other params
				});
			});
			describe("Enter Lottery", async function () {
				it("Reverts when you don't pay enough", async () => {
					await expect(lottery.enterLottery()).to.be.revertedWithCustomError(
						"Lottery__NotEnoughEthEntered"
					);
				});
				it("Records players when they enter", async () => {
					await lottery.enterLottery({ value: lotteryEntranceFee });
					const playerFromContract = await lottery.getPlayer(0);
					assert.equal(playerFromContract, deployer);
				});
			});
	  });
