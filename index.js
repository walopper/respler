/**
 * Respler se conecta cpn
 */

'use strict';

const socketio = require("socket.io");
const mysql = require('mysql2/promise');
const logger = require('./controllers/logger.controller');
const SendResultsController = require('./controllers/sendResults.controller');
const listsService = require('./services/lists.service');
const messagesService = require('./services/messages.service');
const config = require('./config/config');
const mysqlConfig = require('./config/.mysql');

logger.info("Starting Respler app...");

var db;

async function initDb() {
    db = await mysql.createConnection(mysqlConfig)
        .then(result => {
            logger.info("Conectado con MySQL");
            return result;
        }).catch(error => {
            logger.error("Error al conectar con mysql");
            logger.error(error);
        });

    global.db = db; // TODO: eliminar

    const defaulfBlockingDsn = ['5.1.1', '5.8.4'];

    await db.query('SELECT clave, valor FROM om_config')
        .then(([results]) => {
            results.forEach(row => row.clave ? config[row.clave] = row.valor : 0);

            config.exclude_from_fail_dsn = config.exclude_from_fail_dsn
                ? JSON.parse(config.exclude_from_fail_dsn) || defaulfBlockingDsn
                : defaulfBlockingDsn;

            config.blocking_dsn = config.blocking_dsn
                ? JSON.parse(config.blocking_dsn) || defaulfBlockingDsn
                : defaulfBlockingDsn;

            initApp(db);
        })
        .catch(error => logger.error(error));
}

async function initApp(db) {
    const Lists = new listsService(db);
    const Messages = new messagesService(db);
    const sendResultsController = new SendResultsController(Lists, Messages);

    const io = socketio.listen(config.socketIO.port);

    process.stdout.write("Socket escuchando en puerto ");
    console.log(config.socketIO.port);

    io.on("connection", (socket) => {
        var clientIp = socket.request.connection.remoteAddress.split(':').pop();
        logger.info("Cliente conectado: " + clientIp);

        socket.on("SEND_RESPONSE", (data, fn) => {

            try {
                data = JSON.parse(data);
            } catch (e) {
                logger.error('Error en JSON.parse(data)');
                return;
            }

            logger.info('Mensaje recibido de ' + clientIp);

            sendResultsController.processResponse(data)
                .then(response => {
                    logger.info('Mensaje procesado');
                    fn(true);
                })
                .catch(error => {
                    logger.error(error);
                    fn(error);
                });
        });
    });
}

initDb();