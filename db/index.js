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
    const userInsertValues = [params.firstname,params.lastname,params.email]
    const  userrows  = await pool.query(userInsertStatement,userInsertValues )
    console.log('value for user table:'+JSON.stringify(userrows.rows[0]))
    const idpInsertStatement = 'INSERT INTO public."googleauthenticatedusers"("instanceurl", "accesstoken","refreshtoken","email","userid","salesforceid","organizationid","authorizationcode","accesstokennew","organizationnickname","googleid") VALUES($1, $2, $3, $4, $5, $6, $7,$8,$9,$10,$11) RETURNING *'
    const idpInsertValues = [params.instanceurl,params.accesstoken,params.refreshtoken,params.email,userrows.rows[0].Id,params.salesforceid,params.organizationid,params.authorizationcode,params.accesstokennew,params.organizationnickname,params.googleid]
    const idprows = await pool.query(idpInsertStatement,idpInsertValues )
    console.log('value for IP table:'+JSON.stringify(idprows.rows[0]))
    return userrows.rows[0].Id 
  },
    updateUser:async (params) => {
    //console.log(JSON.stringify(params))
      console.log('params.authorizationcode:'+params.authorizationcode);
      console.log('params.accesstoken:'+params.accesstoken);
      console.log('params.refreshtoken:'+params.refreshtoken);
      console.log('params.salesforceid:'+params.salesforceid);
    const idpUpdateStatement = 'Update public."googleauthenticatedusers" set "authorizationcode" = ($1),"accesstoken" = ($2), "refreshtoken" =($3) WHERE "salesforceid" =($4)'
    const idpUpdateValues = [params.authorizationcode,params.accesstoken,params.refreshtoken,params.salesforceid]
    const idprowsupdate = await pool.query(idpUpdateStatement,idpUpdateValues)
    console.log('value for IP table update:'+JSON.stringify(idprowsupdate.rows[0]))
    return idprowsupdate.rows[0].Id 
  }
}
