'use strict';

const mainProviders = require('../config/mainProviders');
const logger = require('../controllers/logger.controller');
const errorHandler = require('../utils/errorHandler');

module.exports = class SendResultsController {
    constructor(listsService, messagesService) {
        this.listsService = listsService;
        this.messagesService = messagesService;
    }

    getRecipientProvider (recipient) {
        let recipientDomain = recipient.split('@')[1];
        let recipientProvider = recipientDomain
        if (mainProviders[recipientDomain]) recipientProvider = mainProviders[recipientDomain];
        return recipientProvider;
    }
    
    /**
     * Descuenta el credito usado al usuario
     * @param {*} userId 
     */
    userUseCredit (userId) {
        global.db.query('UPDATE om_users_credits SET credits = credits - 1 WHERE userid = ? && expire_in >= NOW() && credits > 0 ORDER BY expire_in LIMIT 1', [userId]).catch(error => logger.error(error));
    }
    
    /**
     * Registra el envio para las estadisticas del mensaje
     * @param {*} mid 
     * @param {*} recipient 
     * @param {*} userId 
     */
    async setAsSent (mid, recipient, userId, lid, emailSent = false) {
        let res;
    
        if (emailSent) global.db.query('UPDATE om_mensajes SET sents = sents + 1 WHERE id = ?', [mid]).catch(error => logger.error(error));
        global.db.query(`UPDATE om_xtemp_list_${mid} SET sent = 1 WHERE email = ?`, [recipient]).catch(error => logger.error(error));
        global.db.query(`INSERT INTO om_xreports_${userId} ( mid, lid, email, dsent ) VALUES ( ?, ?, ?, UNIX_TIMESTAMP() )`, [mid, lid, recipient]).catch(error => logger.error(error));
    
        // obtengo parentId
        [res,] = await global.db.query('SELECT parent_id FROM om_users WHERE `id` = ?', [userId]);
        let parentId = res && res[0] && res[0].parent_id;
    
        this.setInLog(userId, mid, parentId);
    }
    
    /**
     * Marco envio como rechazado
     * @param {*} dsn 
     * @param {*} mid 
     * @param {*} recipient 
     * @param {*} userId 
     * @param {*} lid 
     */
    async setAsBounced (dsn, mid, recipient, userId, lid, message) {
        let errorType = parseInt(dsn[0]);
        let errorSubType = dsn.slice(0, 3);
        let recipientProvider = this.getRecipientProvider(recipient);
    
        // determino tipo de rechazo
        let type = errorType == 5 || errorType == 8 ? 'hard' : 'soft';
        if (errorSubType === '5.7') type = "spam";
        if (dsn === '5.8.1' || dsn === '7.6.2') type = "conn";
        if (dsn === '5.8.4' || dsn === '5.1.1' || dsn === '5.4.4') type = "invalid";
    
        global.db.query('UPDATE om_mensajes SET bounced = bounced + 1 WHERE id = ?', [mid]).catch(error => logger.error(error));
        global.db.query(`UPDATE om_xtemp_list_${mid} SET tries = tries + 1, sent = 2 WHERE email = ?`, [recipient]).catch(error => logger.error(error));
        global.db.query(`INSERT INTO om_xreports_${userId} ( mid, lid, email, dsent ) VALUES ( ?, ?, ?, UNIX_TIMESTAMP() )`, [mid, lid, recipient]).catch(error => logger.error(error));
        global.db.query(`INSERT INTO om_bounce ( bounce_code, type, date, email, lid, mid, message ) VALUES ( ?, ?, UNIX_TIMESTAMP(), ?, ?, ?, ? )`, [dsn, type, recipient, lid, mid, message]).catch(error => logger.error(error));
    
        // bloqueo por no existir
        if (global.config.blocking_dsn.includes(dsn)) {
            global.db.query(`UPDATE om_xlista_${lid} SET bkl = 1 WHERE email = ?`, [recipient]).catch(error => logger.error(error));
        } else if (!global.config.exclude_from_fail_dsn.includes(dsn)) {
            global.db.query(`UPDATE om_xlista_${lid} SET fail = fail + 1 WHERE email = ?`, [recipient]).catch(error => logger.error(error));
        }
    
        // obtengo parentId
        [res,] = await global.db.query('SELECT parent_id FROM om_users WHERE `id` = ?', [userId]);
        let parentId = res && res[0] && res[0].parent_id;
    
        this.setInLog(userId, mid, parentId);
    }
    
    async setInLog (userId, mid, parentId) {
        let res;
    
        // obtengo ID de la row de om_logs y si no hay, la creo
        [res,] = await global.db.query('SELECT id FROM om_logs WHERE user_id = ? && mid = ? && date = CURDATE() LIMIT 1', [userId, mid]).catch(error => logger.error(error));
        if (!res || !res[0]) {
            global.db.query(`INSERT INTO om_logs (user_id, parent_id, mid, date, sents, creditos) VALUES(?, ?, ?, CURDATE(), 1, 0)`, [userId, parentId, mid]).catch(error => logger.error(error));
        } else {
            let logId = res[0].id;
            global.db.query('UPDATE om_logs SET sents = sents + 1 WHERE id = ?', [logId]).catch(error => logger.error(error));
        }
    }
    
    /**
     * Marco el envio como retry. Se podria reenviar segun cantidad de errores que tenga
     * @param {*} mid 
     * @param {*} recipient 
     */
    setToRetry (mid, recipient) {
        global.db.query(`UPDATE om_xtemp_list_${mid} SET tries = tries + 1 WHERE email = ?`, [recipient]).catch(error => logger.error(error));
        return true;
    }
    
    setSuscriberAsSent (mid, recipient) {
        global.db.query(`UPDATE om_xtemp_list_${mid} SET sent = 1 WHERE email = ?`, [recipient]).catch(error => logger.error(error));
        return true;
    }
    
    /**
     * Marca el mensaje como demorado
     * @param {*} mid 
     * @param {*} recipient 
     */
    setToDelayed (mid, recipient) {
        global.db.query(`UPDATE om_xtemp_list_${mid} SET \`delayed\` = 1 WHERE email = ?`, [recipient]).catch(error => logger.error(error));
        return true;
    }
    
    /**
     * Devuelve la cantidad de intentos de envio que se hicieron a ese suscriptor
     * @param {*} recipient 
     * @param {*} mid 
     */
    async getSubscriberRetries (recipient, mid) {
        const [res,] = await global.db.query(`SELECT tries, sent FROM om_xtemp_list_${mid} WHERE email = ?`, [recipient]);
        return res && res[0] && parseInt(res[0].tries) || 0;
    }
    
    async processResponse ({ dsn, recipient, mid, lid, bindingIP, delayed, message }) {

        await global.db.query(`SELECT 1`)
            .then(errorHandler.catchThrow.call(this, `No se encontro suscriptor con el email`))
            .catch(error => { throw error });
    
        if (!dsn || !recipient || !mid || !lid || !bindingIP) throw 'missing data';
    
        logger.info(`[${recipient}] dns=${dsn} bindingIP=${bindingIP} messageID=${mid} listID=${lid}`);
    
        const [res,] = await global.db.query('SELECT user_id as userId FROM om_mensajes WHERE `id` = ?', [mid]);
        let userId = res && res[0] && res[0].userId;
    
        if (!userId) {
            logger.error(`[${recipient}] message=no se encontró usuario o mensaje`);
            throw 'mid no encontrado';
        }
    
        // si esta demorado, lo marco como demorado.
        if (delayed) {
            return this.setToDelayed(mid, recipient);
        }
    
        // envio duplicado
        if (dsn == '8.5.0') {
            return this.setSuscriberAsSent(mid, recipient);
        }
    
        // obtengo tipo de error (2, 4, 5, 7, 8)
        let errorType = parseInt(dsn[0]);
    
        // si se configuro que todos los rebotados fallen
        if (global.config.count_all_bounces && errorType === 4) errorType = 5;
    
        switch (errorType) {
            case 7:
                this.setToRetry(mid, recipient)
                break;
            case 2:
                this.setAsSent(mid, recipient, userId, lid, true);
                break;
            case 4:
            case 5:
            case 8:
                this.setAsBounced(dsn, mid, recipient, userId, lid, message);
                if (global.config.count_all_bounces || errorType !== 4) this.userUseCredit(userId);
                break;
        }
    
        return true;
    
    }
}