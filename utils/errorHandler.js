'use strinc';

const logger = require('../controllers/logger.controller');

const catchThrow = (error, message = null) => {
    if(error) {
        logger.error(error);
        throw error;
    }
}

module.exports = {
    catchThrow
};