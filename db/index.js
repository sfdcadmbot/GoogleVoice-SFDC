const { Pool } = require('pg')
const config = require('../config/config');

const pool = new Pool(config.db)

module.exports = {
  query: async (text, params, callback) => {
    const start = Date.now()
    return await pool.query(text, params)
  },
  insertUser:async (params) => {
    //console.log(JSON.stringify(params))
    const userInsertStatement = 'INSERT INTO public."user"("firstname", "lastname","primaryemail") VALUES($1, $2, $3) RETURNING *'
    const userInsertValues = [params.firstname,params.lastname,params.Email]
    const  userrows  = await pool.query(userInsertStatement,userInsertValues )
    //console.log(JSON.stringify(userrows.rows[0]))
    const idpInsertStatement = 'INSERT INTO public."IdentityProviders"("instanceUrl", "access_token","refresh_token","Email","userId","salesforceId","organizationId") VALUES($1, $2, $3, $4, $5, $6, $7) RETURNING *'
    const idpInsertValues = [params.instanceUrl,params.access_token,params.refresh_token,params.Email,userrows.rows[0].Id,params.salesforceId,params.organizationId]
    const idprows = await pool.query(idpInsertStatement,idpInsertValues )
    //console.log(JSON.stringify(idprows.rows[0]))
    return userrows.rows[0].Id 
  }
}