'use strict';

const errorHandler = require('../utils/errorHandler');

class Lists {
    constructor(db) {
        this.db = db;
    }

    /**
     * Obtiene datos de suscriptor por medio del email
     */
    async getByEmail(email, lid) {
        let [res,] = await this.db.query(`SELECT * FROM om_xlista_${lid} WHERE email LIKE ?`, [email])
            .catch(errorHandler.catchThrow.call(this, `No se encontro suscriptor con el email ${email} en la lista ${lid}`));

        return res && res[0]
            ? res[0]
            : null;
    }

    /** escribe log */
    async subscriberActionLog(email, lid, mid, action, data = '', from_source = '', convertion = '') {

        let [res,] = await this.db.query(`SELECT creator FROM om_xlistas WHERE id = ?`, [lid]).catch(error => {
            logger.error(error)
            throw 'No se pudo ejecutar la query';
        });

        if (!res || !res[0] || !res[0].creator) throw 'No se encuentra la lista con ese ID';

        let subscriberData = await this.getByEmail(email, lid).catch(error => {
            logger.error(error)
            throw 'No se pudo ejecutar la query';
        });

        if (!subscriberData) throw 'No se encuentra suscriptor en ese email';

        try {
            if (data && typeof data === 'object') data = JSON.stringify(data);
        } catch (error) {
        }

        let queryString = `INSERT INTO om_xsusrec_${uid} (lid, sid, email, action, data, mid, \`date\`, from_source, convertion) VALUES(?, ?, ?, ?, ?, ?, UNIX_TIMESTAMP(), ?, ?);`;
        await this.db.query(queryString, [lid, subscriberData.id, email, action, data, mid, from_source, convertion]).catch(error => {
            logger.error(error)
            throw 'No se pudo ejecutar la query';
        });

        return true;
    }

}

module.exports = Lists;