const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const killPort = require('kill-port');
const path = require('path');
const itemsRouter = require('./routes/items');
const statsRouter = require('./routes/stats');
const { initRuntimeConfig } = require('./config/runtimeConfig');
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
 * @route    [HTTP_METHOD] /api/endpoint
 * @desc     [Short summary of what this endpoint does, e.g., Reads or sets value in smart contract]
 * @author   [Your Name]
 * @access   [public/private/auth-required]
 * @param    {Request}  req  - Express request object. [Describe relevant body/query/params fields]
 * @param    {Response} res  - Express response object.
 * @returns  {JSON}          [Describe the JSON structure returned]
 * @throws   [Error conditions, e.g., 400 on invalid input, 500 on contract failure]
 *
 * @example
 * // Example request
 * curl -X POST http://localhost:3001/contract/value -H "Content-Type: application/json" -d '{"value": 42}'
 *
 * // Example response
 * {
 *   "message": "Value updated",
 *   "txHash": "0x..."
 * }
 */

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