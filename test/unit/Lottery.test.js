const { getNamedAccounts, deployments, ethers, network } = require("hardhat");
const { developmentChains, networkConfig } = require("../../helper-hardhat.config");
const { assert, expect } = require("chai");
!developmentChains.includes(network.name)
	? describe.skip
	: describe("Lottery", async function () {
			let lottery, vrfCoordinatorV2Mock, lotteryEntranceFee, deployer, interval;
			const chainId = network.config.chainId;

			beforeEach(async function () {
				// const { deployer } = await getNamedAccounts();
				deployer = (await getNamedAccounts()).deployer;
				await deployments.fixture(["all"]);
				vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer);
				lottery = await ethers.getContract("Lottery", deployer);
				lotteryEntranceFee = await lottery.getEntranceFee();
				interval = await lottery.getInterval();
			});

			describe("Constructor", async function () {
				it("Initializes the lottery correctly", async function () {
					// Good practice: Have 1 assert per 'it' function
					const lotteryState = await lottery.getLotteryState();

					assert.equal(lotteryState.toString(), "0");

					assert.equal(interval.toString(), networkConfig[chainId]["interval"]);
					// Add more tests for other params
				});
			});
			describe("Enter Lottery", async function () {
				it("Reverts when you don't pay enough", async () => {
					await expect(lottery.enterLottery()).to.be.revertedWith(
						"Lottery__NotEnoughEthEntered"
					);
				});
				it("Records players when they enter", async () => {
					await lottery.enterLottery({ value: lotteryEntranceFee });
					const playerFromContract = await lottery.getPlayer(0);
					assert.equal(playerFromContract, deployer);
				});
				it("Emits an event on enter", async () => {
					// Similar to checking if enough ETH is provided
					await expect(lottery.enterLottery({ value: lotteryEntranceFee })).to.emit(
						lottery,
						"LotteryEnter"
					);
				});
				it("Doesn't allow anyone to enter while the lottery is calculating", async () => {
					await lottery.enterLottery({ value: lotteryEntranceFee });
					await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
					await network.provider.send("evm_mine", []); // Empty array because we jsut want it to mine one block
					// Same as above but a little slower await network.provider.request({method: "evm_mine", params :[]})
					// Now we pretend to be a chainlink Keeper to call performUpkeep/checkUpkeep
					await lottery.performUpkeep([]);
					await expect(
						lottery,
						enterLottery({ value: lotteryEntranceFee })
					).to.be.revertedWith("Lottery__NotOpen");
				});
			});
			describe("CheckUpKeep", async () => {
				it("Returns false if people haven't sent any ETH", async () => {
					await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
					await network.provider.send("evm_mine", []);
					/* Since checkUpKeep is a public function, if we just call await lottery.checkUpkeep(), it'll 
					execute a transaction. We don't want to send an actual transaction. Rather, over here we're 
					trying to simulate what the return value would be IF we were to send a tx */
					// We can use callstatic below to simulate a tx
					// To extrapolate just the upkeep value from the function call, we use the {} notation
					const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([]);
					assert(!upkeepNeeded);
				});
				it("Returns false if the lottery isn't open", async () => {
					await lottery.enterLottery({ value: lotteryEntranceFee });
					await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
					await network.provider.send("evm_mine", []);
					await lottery.performUpkeep("0x"); // hh is smart enough to know 0x translates to an empty bytes object
					const lotteryState = await lottery.getLotteryState();
					const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([]);
					assert.equal(lotteryState.toString(), "1");
					assert.equal(upkeepNeeded, false);
				});
				it("returns false if enough time hasn't passed", async () => {
					await lottery.enterLottery({ value: lotteryEntranceFee });
					await network.provider.send("evm_increaseTime", [interval.toNumber() - 5]); // use a higher number here if this test fails
					await network.provider.request({ method: "evm_mine", params: [] });
					const { upkeepNeeded } = await lottery.callStatic.checkUpkeep("0x"); // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
					assert(!upkeepNeeded);
				});
				it("returns true if enough time has passed, has players, eth, and is open", async () => {
					await lottery.enterLottery({ value: lotteryEntranceFee });
					await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
					await network.provider.request({ method: "evm_mine", params: [] });
					const { upkeepNeeded } = await lottery.callStatic.checkUpkeep("0x"); // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
					assert(upkeepNeeded);
				});
			});
			describe("performUpkeep", function () {
				it("Can only run if checkUpkeep is true", async () => {
					await lottery.enterLottery({ value: lotteryEntranceFee });
					await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
					await network.provider.request({ method: "evm_mine", params: [] });
					const tx = await lottery.performUpkeep([]);
					assert(tx);
				});
				it("Reverts when checkupkeep is false", async () => {
					await expect(lottery.performUpkeep([])).to.be.revertedWith(
						"Lottery__UpkeepNotNeeded"
					);
				});
				it("Updates the lottery state, emits an event and calls the VRF Coordinator", async () => {
					await lottery.enterLottery({ value: lotteryEntranceFee });
					await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
					await network.provider.request({ method: "evm_mine", params: [] });
					const txResponse = await lottery.performUpkeep([]);
					const txReceipt = await txResponse.wait(1);
					const requestId = txReceipt.events[1].args.requestId;
					const lotteryState = await lottery.getLotteryState();
					assert(requestId.toNumber() > 0);
					assert(lotteryState.toNumber() == 1);
				});
			});
			describe("Fullfill Random words", function () {
				beforeEach(async () => {
					await lottery.enterLottery({ value: lotteryEntranceFee });
					await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
					await network.provider.request({ method: "evm_mine", params: [] });
				});
				it("Can only be called after performUpkeep", async () => {
					await expect(
						vrfCoordinatorV2Mock.fulfillRandomWords(0, lottery.address)
					).to.be.revertedWith("nonexistent request");
					await expect(
						vrfCoordinatorV2Mock.fulfillRandomWords(1, lottery.address)
					).to.be.revertedWith("nonexistent request");
				});
			});
	  });
