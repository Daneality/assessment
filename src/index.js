const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const killPort = require('kill-port');
const path = require('path');
const itemsRouter = require('./routes/items');
const statsRouter = require('./routes/stats');
const { initRuntimeConfig } = require('./config/runtimeConfig');
const { ethers } = require('ethers');
require('dotenv').config();

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3001;

// Middleware
app.use(cors({ origin: `http://localhost:${PORT}` }));
app.use(express.json());
app.use(morgan('dev'));

// Routes
app.use('/api/items', itemsRouter);
app.use('/api/stats', statsRouter);

/**
 * @desc     Get Chainlink feed contract helper
 * @param    {ethers.JsonRpcProvider} provider - JSON RPC provider
 * @param    {string} feedAddress - Chainlink feed address
 * @returns  {ethers.Contract} - Chainlink feed contract
 */
function getChainlinkFeedContract(provider, feedAddress) {
    const feedAbi = [
        'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
        'function decimals() view returns (uint8)',
        'function description() view returns (string)'
    ];
    return new ethers.Contract(feedAddress, feedAbi, provider);
}

/**
 * @route    GET /api/DanyilApiTest
 * @desc     Fetch Chainlink ETH/USD price from mainnet AggregatorV3
 * @author   Danyil Sas
 * @access   public
 * @param    {Request}  req - Express request
 * @param    {Response} res - Express response
 * @returns  {JSON}     { ok: boolean, data?: { description, decimals, price, roundId, answeredInRound, startedAt, updatedAt, contract }, error?: string }
 * @throws   500 on provider/contract call failures
 *
 * @example
 * // Request
 * curl -X GET http://localhost:{PORT}/api/DanyilApiTest
 *
 * // Response (example)
 * {
 *   "ok": true,
 *   "data": {
 *     "description": "ETH / USD",
 *     "decimals": 8,
 *     "price": 3500.12,
 *     "roundId": "123456789",
 *     "answeredInRound": "123456789",
 *     "startedAt": "2025-09-09T11:59:30.000Z",
 *     "updatedAt": "2025-09-09T12:00:00.000Z",
 *     "contract": "0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419"
 *   }
 * }
 */
app.get('/api/DanyilApiTest', async (req, res) => {
    // Chainlink ETH/USD AggregatorV3 on Ethereum mainnet
    const feedAddress = '0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419';
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://ethereum.publicnode.com');
    try {
        const feed = getChainlinkFeedContract(provider, feedAddress);
        const [decimals, description, latest] = await Promise.all([
            feed.decimals(),
            feed.description(),
            feed.latestRoundData()
        ]);

        const [roundId, answer, startedAt, updatedAt, answeredInRound] = latest;

        const data = {
            description,
            decimals: Number(decimals),
            price: Number(ethers.formatUnits(answer, Number(decimals))),
            roundId: roundId.toString(),
            answeredInRound: answeredInRound.toString(),
            startedAt: new Date(Number(startedAt) * 1000).toISOString(),
            updatedAt: new Date(Number(updatedAt) * 1000).toISOString(),
            contract: feedAddress
        };

        console.log('[DanyilApiTest] Feed data:', data);
        return res.json({ ok: true, data });
    } catch (error) {
        const message = (error && (error.shortMessage || (error.info && error.info.error && error.info.error.message) || error.reason || error.message)) || 'Unknown error';
        const code = (error && error.code) || 'UNEXPECTED_ERROR';
        const isNetworkIssue = code === 'NETWORK_ERROR' || message.toLowerCase().includes('network');
        const status = isNetworkIssue ? 502 : 500;
        console.error('[DanyilApiTest] Error fetching feed data:', { code, message, rpcUrl, contract: feedAddress });
        return res.status(status).json({ ok: false, error: message, details: { code, contract: feedAddress } });
    }
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
    app.use(express.static('client/build'));
    app.get('*', (req, res) => {
        res.sendFile(path.resolve(__dirname, 'client', 'build', 'index.html'));
    });
}

const startServer = async (port) => {
    await initRuntimeConfig();
    const server = app.listen(port, () => {
        console.log(`Backend running on http://localhost:${port}`);
    });

    const shutdownHandler = (signal) => {
        console.log(`\nCaught ${signal}. Shutting down gracefully...`);
        server.close(() => {
            console.log('Server closed. Port released.');
            process.exit(0);
        });

        setTimeout(() => {
            console.error('Force exiting after timeout');
            process.exit(1);
        }, 5000);
    };

    process.on('SIGINT', () => shutdownHandler('SIGINT'));
    process.on('SIGTERM', () => shutdownHandler('SIGTERM'));
    process.on('uncaughtException', (err) => {
        console.error('Uncaught Exception:', err);
        shutdownHandler('uncaughtException');
    });
};

const safeStart = (port) => {
    // Kill port BEFORE starting server
    killPort(port, 'tcp')
        .then(() => {
            console.log(`Port ${port} free. Starting fresh server...`);
            startServer(port);
        })
        .catch((err) => {
            console.log(`Port ${port} use. restart server...`);
            safeStart(port + 1);
        });
}

safeStart(PORT);