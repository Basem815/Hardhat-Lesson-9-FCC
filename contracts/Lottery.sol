// SPDX-License-Identifier: MIT

pragma solidity ^0.8.7;

import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/interfaces/KeeperCompatibleInterface.sol";

error Lottery__NotEnoughEthEntered();
error Lottery__TransferFailed();
error Lottery__NotOpen();
error Lottery__UpkeepNotNeeded(uint256 currentBalance, uint256 numPlayers, uint256 lotteryState);

contract Lottery is VRFConsumerBaseV2, KeeperCompatibleInterface {
	/*Type declarations */
	enum LotteryState {
		OPEN,
		CALCULATING
	}
	/* State variables */
	uint256 private immutable i_entranceFee;
	// We want to keep track of all the players who have entered the lottery
	// Payable because if one of these players win, we will have to pay them
	address payable[] private s_players;
	VRFCoordinatorV2Interface private immutable i_vrfCoordinator;
	bytes32 private immutable i_gasLane;
	uint64 private immutable i_subscriptionId;
	uint16 private constant REQUEST_CONFIRMATIONS = 3;
	uint32 private immutable i_callbackGasLimit;
	uint32 private constant NUM_WORDS = 1;
	/* Events */
	event LotterEnter(address indexed player);
	event RequestLotteryWinner(uint256 indexed requestId);
	event WinnerPicked(address indexed winner);
	/* Lottery Variables */
	address private s_recentWinner;
	LotteryState private s_lotteryState;
	uint256 private s_lastTimeStamp;
	uint256 private immutable i_interval;

	constructor(
		address vrfCoordinatorV2,
		uint256 entranceFee,
		bytes32 gasLane,
		uint64 subscriptionId,
		uint32 callbackGasLimit,
		uint256 interval
	) VRFConsumerBaseV2(vrfCoordinatorV2) {
		i_entranceFee = entranceFee;
		i_vrfCoordinator = VRFCoordinatorV2Interface(vrfCoordinatorV2);
		i_gasLane = gasLane;
		i_subscriptionId = subscriptionId;
		i_callbackGasLimit = callbackGasLimit;
		s_lotteryState = LotteryState.OPEN; // Same as LotterState(0)
		s_lastTimeStamp = block.timestamp;
		i_interval = interval;
	}

	function enterLottery() public payable {
		// require(msg.value > i_entranceFee, "Not enough ETH!")
		// Error codes save a lot more gas as we aren't storing an entire string
		if (msg.value < i_entranceFee) {
			revert Lottery__NotEnoughEthEntered();
		}
		if (s_lotteryState != LotteryState.OPEN) {
			revert Lottery__NotOpen();
		}
		/* This won't work because msg.sender by default is not a payable address (so typecasting required)
    s_players.push(msg.sender)
    */
		s_players.push(payable(msg.sender));
		// We should emit an event whenever we update a dynamic array or mapping
		// Best practice: Name events with the function name reversed
		emit LotterEnter(msg.sender);
	}

	// Parmaeters obtained from VRFConsumeBaseV2.sol contract (under node-modules -> Chainlink> src -> v0.8 )
	// The function defined there is virtual by default to indicate that it will be overridden
	function fulfillRandomWords(
		uint256 /* requestId */,
		uint256[] memory randomWords
	) internal override {
		uint256 indexOfWinner = randomWords[0] % s_players.length;
		address payable recentWinner = s_players[indexOfWinner];
		s_recentWinner = recentWinner;
		s_lotteryState = LotteryState.OPEN;
		// We reset the players array
		s_players = new address payable[](0);
		s_lastTimeStamp = block.timestamp;
		(bool success, ) = recentWinner.call{value: address(this).balance}("");

		if (!success) {
			revert Lottery__TransferFailed();
		}
		emit WinnerPicked(s_recentWinner);
	}

	/**
	 *
	 * @dev This is the function that the Chainlink Keeper nodes calls
	 * They look for the "upkeepneeded' to return true
	 * The following should be true in order for the function to return true:
	 *      1.  Our specified time interval should have passed
	 *      2. The lotter should have at least 1 player and some ETH
	 *      3. Our subscription should be funded with LINK
	 *      4. The lottery should be in a 'Open' state
	 */
	// In order to be able to call this function within our contract, we have to change it from external to public
	function checkUpkeep(
		bytes memory /*calldata checkData*/ /*external*/ // Calldata doesn't work with strings so we changed it to memory
	) public view override returns (bool upkeepNeeded, bytes memory /*performData*/) {
		bool isOpen = (LotteryState.OPEN == s_lotteryState);
		bool timePassed = (block.timestamp - s_lastTimeStamp) > i_interval;
		bool hasPlayers = (s_players.length > 0);
		bool hasBalance = address(this).balance > 0;
		upkeepNeeded = (isOpen && timePassed && hasPlayers && hasBalance);
		return (upkeepNeeded, "0x0");
	}

	// external: solidity knows that our own contract can't call this function (it is a little cheaper than
	// public functions)
	function performUpkeep(bytes calldata /*performData*/) external override {
		/* This is where we use chainlink VRFs and chainlink keepers
        // This function will be called automatically by the chainlink keeps so we don't have to constatnly 
        // keep interacting with it
        // Chainlink VRF is a 2-step process
             First we have to request the random number
             Then we have to do something with it
        */
		(bool upkeepNeeded, ) = checkUpkeep("");
		if (!upkeepNeeded) {
			// We'll pass some parameters so that the person knows what might have caused this error
			revert Lottery__UpkeepNotNeeded(
				address(this).balance,
				s_players.length,
				uint256(s_lotteryState)
			);
		}
		// We change the state so that nobody can enter while the calculating procedure is going on
		s_lotteryState = LotteryState.CALCULATING;
		uint256 request_id = i_vrfCoordinator.requestRandomWords(
			i_gasLane, // Gaslane: The max amount of gas you're willing to sepnd to generate a rand number
			i_subscriptionId,
			REQUEST_CONFIRMATIONS,
			i_callbackGasLimit,
			NUM_WORDS
		);
		emit RequestLotteryWinner(request_id);
	}

	/*   Getters (view/pure)*/
	function getEntranceFee() public view returns (uint256) {
		return i_entranceFee;
	}

	function getPlayer(uint256 index) public view returns (address) {
		return s_players[index];
	}

	function getRecentWinner() public view returns (address) {
		return s_recentWinner;
	}

	function getLotteryState() public view returns (LotteryState) {
		return s_lotteryState;
	}

	function getNumWords() public pure returns (uint256) {
		return NUM_WORDS;
	}

	function getNumberOfPlayers() public view returns (uint256) {
		return s_players.length;
	}

	function getLatestTimeStamp() public view returns (uint256) {
		return s_lastTimeStamp;
	}

	function getRequestConfirmations() public pure returns (uint256) {
		return REQUEST_CONFIRMATIONS;
	}

	function getInterval() public view returns (uint256) {
		return i_interval;
	}
}
/*14:28:27   */
