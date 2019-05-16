'use strict';

class Messages {
    constructor(db) {
        this.db = db
    }

    /**
     * Obtiene datos del mensaje
     * @param {*} mid 
     */
    fetch(mid = null) {
        if (mid) {
            return this.db.query('SELECT * FROM om_mensajes WHERE `id` = ?', [mid])
                .then(([response]) => {
                    this.messageData = response && response[0];
                    return this.messageData;
                });
        }
    }

    /**
     * Incrementa la cantidad de rechazados
     * @param {*} mid 
     */
    incrementBounces(mid) {
        return this.dbdb.query('UPDATE om_mensajes SET bounced = bounced + 1 WHERE id = ?', [mid]).then(() => true).catch(() => false);
    }

    /**
     * Incrementa los enviados
     * @param {*} mid 
     */
    incrementSents(mid) {
        return this.dbdb.query('UPDATE om_mensajes SET sents = sents + 1 WHERE id = ?', [mid]).then(() => true).catch(() => false);
    }

}

module.exports = Messages;