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
    console.log('value for user table:'+JSON.stringify(userrows.rows[0]))
    const idpInsertStatement = 'INSERT INTO public."IdentityProviders"("instanceUrl", "access_token","refresh_token","Email","userId","salesforceId","organizationId") VALUES($1, $2, $3, $4, $5, $6, $7) RETURNING *'
    const idpInsertValues = [params.instanceUrl,params.access_token,params.refresh_token,params.Email,userrows.rows[0].Id,params.salesforceId,params.organizationId]
    const idprows = await pool.query(idpInsertStatement,idpInsertValues )
    console.log('value for IP table:'+JSON.stringify(idprows.rows[0]))
    return userrows.rows[0].Id 
  },
    updateUser:async (params) => {
    //console.log(JSON.stringify(params))
    const idpUpdateStatement = 'Update public."IdentityProviders" set "googleid" = ($1) WHERE "Id" =($2)'
    const idpUpdateValues = [params.userId,params.Id]
    const idprowsupdate = await pool.query(idpUpdateStatement,idpUpdateValues)
    console.log('value for IP table update:'+JSON.stringify(idprowsupdate.rows[0]))
    return idprowsupdate.rows[0].Id 
  }
}
