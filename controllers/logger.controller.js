'use strict';

const { createLogger, format, transports } = require('winston');
const { combine, timestamp, label, printf } = format;

const winstonConfig = require('../config/winston');

const myFormat = printf(({ level, message, timestamp }) => {
    return `${timestamp} ${message}`;
});

const _logger = createLogger({
    level: 'debug',
    // format: format.json(),
    format: combine(
        timestamp(),
        myFormat
    ),
    transports: [
        // loggeo errores
        new transports.File({
            filename: '/var/log/respler-error.log',
            level: 'error',
            ...winstonConfig.transports.error
        }),
        // loggeo todo
        new transports.File({
            filename: '/var/log/respler.log',
            ...winstonConfig.transports.main
        })
    ],
    'outputCapture': 'std'
});

const logger = (process.env.NODE_ENV !== 'production')
    ? {
        info: console.log,
        error: console.error
    }
    : _logger;

global.logger = logger;

module.exports = logger;