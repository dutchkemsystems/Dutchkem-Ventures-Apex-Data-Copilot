// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title Dutchkem Enterprise QA Escrow (Polygon PoS USDC)
 * @notice Fail-closed smart contract escrow for enterprise AI data contracts > $10,000 USDC.
 *         - Polygon PoS Mainnet USDC (Circle Native, 6 decimals): 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359
 *         - Client deposits USDC -> Locked in contract custody
 *         - Backend QA Oracle confirms pass -> Releases 85% USDC to freelancer, 15% to treasury
 *         - Backend QA Oracle marks failure (or deadline expires) -> Refunds 100% USDC to client
 */

interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

library SafeERC20 {
    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        (bool ok, bytes memory data) = address(token).call(
            abi.encodeWithSelector(token.transfer.selector, to, value)
        );
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "SafeERC20: transfer failed");
    }

    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        (bool ok, bytes memory data) = address(token).call(
            abi.encodeWithSelector(token.transferFrom.selector, from, to, value)
        );
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "SafeERC20: transferFrom failed");
    }
}

contract Escrow {
    using SafeERC20 for IERC20;

    enum EscrowState {
        None,
        Locked,
        Released,
        Refunded
    }

    struct ContractEscrow {
        bytes32 jobId;
        address client;
        address freelancer;
        uint256 amountUsdc;
        uint64 createdAt;
        uint64 deadline;
        bytes32 qaReportHash;
        bool qaPassed;
        EscrowState state;
    }

    // Polygon PoS Native USDC uses 6 decimals ($10,000 = 10_000_000_000 base units)
    uint256 public constant MIN_ENTERPRISE_USDC = 10_000 * 1e6;
    uint256 public constant FREELANCER_SHARE_BPS = 8500; // 85.00%
    uint256 public constant PLATFORM_FEE_BPS = 1500;     // 15.00%
    uint256 public constant BPS_DENOMINATOR = 10_000;

    IERC20 public immutable usdc;
    address public owner;
    address public qaOracle;
    address public platformTreasury;

    bool private _locked;
    mapping(bytes32 => ContractEscrow) public escrows;

    event EscrowDeposited(
        bytes32 indexed jobId,
        address indexed client,
        address indexed freelancer,
        uint256 amountUsdc,
        uint64 deadline
    );

    event EscrowReleased(
        bytes32 indexed jobId,
        address indexed freelancer,
        uint256 freelancerAmountUsdc,
        uint256 platformFeeUsdc,
        bytes32 qaReportHash
    );

    event EscrowRefunded(
        bytes32 indexed jobId,
        address indexed client,
        uint256 amountUsdc,
        bytes32 qaReportHash,
        string reason
    );

    event QaOracleRotated(address indexed previousOracle, address indexed nextOracle);

    modifier nonReentrant() {
        require(!_locked, "Escrow: reentrant call");
        _locked = true;
        _;
        _locked = false;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Escrow: caller is not owner");
        _;
    }

    modifier onlyOracle() {
        require(msg.sender == qaOracle, "Escrow: caller is not authorized QA Oracle");
        _;
    }

    constructor(address _usdc, address _qaOracle, address _platformTreasury) {
        require(_usdc != address(0), "Escrow: zero USDC address");
        require(_qaOracle != address(0), "Escrow: zero QA Oracle address");
        require(_platformTreasury != address(0), "Escrow: zero treasury address");
        usdc = IERC20(_usdc);
        owner = msg.sender;
        qaOracle = _qaOracle;
        platformTreasury = _platformTreasury;
    }

    function setQaOracle(address nextOracle) external onlyOwner {
        require(nextOracle != address(0), "Escrow: zero QA Oracle address");
        address prev = qaOracle;
        qaOracle = nextOracle;
        emit QaOracleRotated(prev, nextOracle);
    }

    /**
     * @notice Client locks USDC into smart contract custody.
     *         Fail-closed threshold: strictly enforces contract > $10,000 USDC (MIN_ENTERPRISE_USDC).
     */
    function deposit(
        bytes32 jobId,
        address freelancer,
        uint256 amountUsdc,
        uint64 deadline
    ) external nonReentrant {
        require(jobId != bytes32(0), "Escrow: invalid jobId");
        require(freelancer != address(0) && freelancer != msg.sender, "Escrow: invalid freelancer");
        require(amountUsdc > MIN_ENTERPRISE_USDC, "Escrow: contract must exceed $10,000 USDC");
        require(deadline > block.timestamp + 1 hours, "Escrow: deadline too soon");
        require(escrows[jobId].state == EscrowState.None, "Escrow: job already exists");

        // Record state before external transferFrom (Checks-Effects-Interactions)
        escrows[jobId] = ContractEscrow({
            jobId: jobId,
            client: msg.sender,
            freelancer: freelancer,
            amountUsdc: amountUsdc,
            createdAt: uint64(block.timestamp),
            deadline: deadline,
            qaReportHash: bytes32(0),
            qaPassed: false,
            state: EscrowState.Locked
        });

        usdc.safeTransferFrom(msg.sender, address(this), amountUsdc);

        emit EscrowDeposited(jobId, msg.sender, freelancer, amountUsdc, deadline);
    }

    /**
     * @notice Backend QA Oracle confirms automated QA pass and releases locked USDC
     *         with 85% going to the freelancer and 15% to platform treasury.
     */
    function confirmQaAndRelease(
        bytes32 jobId,
        bytes32 qaReportHash
    ) external onlyOracle nonReentrant {
        ContractEscrow storage item = escrows[jobId];
        require(item.state == EscrowState.Locked, "Escrow: not in Locked state");
        require(qaReportHash != bytes32(0), "Escrow: missing QA report digest");

        item.state = EscrowState.Released;
        item.qaPassed = true;
        item.qaReportHash = qaReportHash;

        uint256 freelancerAmount = (item.amountUsdc * FREELANCER_SHARE_BPS) / BPS_DENOMINATOR;
        uint256 platformFee = item.amountUsdc - freelancerAmount;

        usdc.safeTransfer(item.freelancer, freelancerAmount);
        usdc.safeTransfer(platformTreasury, platformFee);

        emit EscrowReleased(
            jobId,
            item.freelancer,
            freelancerAmount,
            platformFee,
            qaReportHash
        );
    }

    /**
     * @notice Backend QA Oracle triggers immediate 100% USDC refund to client when QA fails.
     */
    function refundOnQaFailure(
        bytes32 jobId,
        bytes32 qaReportHash,
        string calldata reason
    ) external onlyOracle nonReentrant {
        ContractEscrow storage item = escrows[jobId];
        require(item.state == EscrowState.Locked, "Escrow: not in Locked state");
        require(qaReportHash != bytes32(0), "Escrow: missing QA failure digest");

        item.state = EscrowState.Refunded;
        item.qaPassed = false;
        item.qaReportHash = qaReportHash;

        uint256 refundAmount = item.amountUsdc;
        usdc.safeTransfer(item.client, refundAmount);

        emit EscrowRefunded(jobId, item.client, refundAmount, qaReportHash, reason);
    }

    /**
     * @notice Client failsafe refund if SLA deadline passes without QA Oracle clearance.
     */
    function claimExpiredRefund(bytes32 jobId) external nonReentrant {
        ContractEscrow storage item = escrows[jobId];
        require(item.state == EscrowState.Locked, "Escrow: not in Locked state");
        require(msg.sender == item.client, "Escrow: only client may claim timeout refund");
        require(block.timestamp > item.deadline, "Escrow: deadline not expired");

        item.state = EscrowState.Refunded;
        uint256 refundAmount = item.amountUsdc;
        usdc.safeTransfer(item.client, refundAmount);

        emit EscrowRefunded(
            jobId,
            item.client,
            refundAmount,
            bytes32(0),
            "Deadline expired without QA completion"
        );
    }
}
