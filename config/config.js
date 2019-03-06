
const config = {
  // Salesforce client settings for Force.com connection
  'oauth': {
    // you can change loginUrl to connect to sandbox or prerelease env.
    //loginUrl: 'https://login.salesforce.com',
    //clientId and Secret will be provided when you create a new connected app in your SF developer account
    clientId: '3MVG9YDQS5WtC11qk.ArHtRRClgxBVv6.UbLdC7H6Upq8xs2G1EepruAJuuuogDIdevglKadHRNQDhITAnhif',
    clientSecret: '4635706799290406853',
    //redirectUri : 'http://localhost:' + port +'/token'
    redirectUri: 'https://node-js-google-sfdc-app.herokuapp.com/token'
  },
 
 
  "db": {
    user: 'avtzfmffgvnnfl',
    host: 'ec2-54-235-68-3.compute-1.amazonaws.com',
    database: 'd41ucomsjv429s',
    password: '05ff739dc717eb7a35a99def70bf30b21f407d0651d3eb09b45123fe29442b92',
    port: 5432,
  },
  // Express server configuration
  'server': {
    // Server HTTP port
    port: 3000,

    // Whether the server is configured with HTTPS
    isHttps: false,

    // Secret key used to encrypt user sessions
    sessionSecretKey: 'mySecretK3y!'
  }
}


module.exports = config;
