  
// dependencies
const express = require('express');
const bodyParser = require('body-parser');
const jsforce = require('jsforce');
const server = express();
const path = require('path');
const session = require('express-session');
const db = require('./db');
const config = require('./config/config');
const pg = require('pg');
const pool = new pg.Pool(config.db);
//var logger=require('./logger/logger');


const {
    dialogflow,
    SignIn,
    SimpleResponse,
    Image,
    Suggestions,
    BasicCard
} = require('actions-on-google');

const app = dialogflow({
    debug: true,
    clientId: config.oauth.clientId
});

//initialize session
server.use(session({
    secret: 'S3CRE7',
    resave: true,
    saveUninitialized: true
}));
server.use(bodyParser.json());
server.use(bodyParser.urlencoded({
    extended: true
}))
// create serve and configure it.
//Simple request time logger
server.use(function(req, res, next) {
    console.log("A new request received at " + Date.now() + " for " + req.url);

    next();
});
//jsForce connection
var oauth2 = new jsforce.OAuth2(config.oauth);

// Serve static assets
server.use('/', function(req, res, next) {
    console.log('Header:'+JSON.stringify(req.headers));
    let token = req.headers['x-access-token'] || req.headers['authorization']; // Express headers are auto converted to lowercase
	 //console.log('req.headers['x-access-token']'+req.headers['x-access-token']);
         //console.log('req.headers['authorization']:'+req.headers['authorization']);
	
    next();
});
server.use(express.static('public'))
server.get('/searching', function(req, res){

 // input value from search
 var val = req.query.orgnameval;
 console.log('search val:'+val);
 //res.send('Hello world');
	
	 pool.connect(function(err, client, done) {
        if (err) {
            console.log("Can not connect to the DB" + err);
         
        }
        client.query('SELECT * FROM public."googleauthenticatedusers" WHERE "organizationnickname" = $1', [val], function(err, result) {
            done();
            if (err) {
                console.log('The error ret org nick name:' + err);
                
            } else {
                console.log('The value here then org nickname-->' + JSON.stringify(result.rows));
		    console.log('The value here then org nickname-->' + result.rows.length);

                if (result.rows.length > 0) {
                    
		res.send('Duplicate');

                } 
		else
		{
		res.send('Not Duplicate');

		}
              
            }
        })
    })
});

/**
 * Login endpoint
 */
server.all("/auth/login", function(req, res) {
    // Redirect to Salesforce login/authorization page
	
	
    if (!req.body.redirect_uri) {
        console.log("Setting redirect url " + req.body.redirect_uri)
        req.session.redirect_uri = req.body.redirect_uri
        req.session.state = req.body.state
    }
	else{
		console.log('here redirect');
		req.session.redirect_uri = null;
        
	}
	
    if (req.body.orgurl) {
        oauth2 = new jsforce.OAuth2(Object.assign(config.oauth, {
            loginUrl: req.body.orgurl
        }))
    } else if (req.body.org == 'Production') {
        oauth2 = new jsforce.OAuth2(Object.assign(config.oauth, {
            loginUrl: 'https://login.salesforce.com'
        }))
    } else if ((req.body.org == 'Sandbox')) {
        oauth2 = new jsforce.OAuth2(Object.assign(config.oauth, {
            loginUrl: 'https://test.salesforce.com'
        }))
    }
     req.session.organizationnickname=req.body.OrgName;
	 req.session.googleid=req.body.googleemailaddress;
    console.log(req.body)
    res.redirect(oauth2.getAuthorizationUrl({
        scope: 'api id web refresh_token'
    }));
});

/**
 * Login callback endpoint (only called by Force.com)
 */
server.all('/token2', async (req, res) => {
    console.log('The request in token2:' + JSON.stringify(req.body));
    console.log("token" + req.body.code || req.body.refresh_token)
    //code=req.body.code;

    if (req.body.grant_type == 'authorization_code') {

        var result = await db.query('SELECT * FROM public."googleauthenticatedusers" WHERE "authorizationcode" = $1', [req.body.code]);
        res.json({
            "token_type": "Bearer",
            "access_token": result.rows[0].accesstoken,
            "refresh_token": result.rows[0].refreshtoken,
            //"expires_in": 1999900999,
        })

    } else if (req.body.grant_type == 'refresh_token') {

        var result = await db.query('SELECT * FROM public."googleauthenticatedusers" WHERE "refreshtoken" = $1', [req.body.refresh_token]);
        const conn = new jsforce.Connection({
            oauth2: oauth2
        });
        var refreshTokenResult = await conn.oauth2.refreshToken(result.rows[0].refreshtoken)
        //await db.query('UPDATE public."googleauthenticatedusers" SET "accesstoken" = $1 WHERE "refreshtoken" =$2',[refreshTokenResult.access_token,result.rows[0].refreshtoken])

        pool.connect(function(err, client, done) {
            if (err) {
                console.log("Can not connect to the DB" + err);
                //reject(err);
            }
            client.query('UPDATE public."googleauthenticatedusers" SET "accesstoken" = $1 WHERE "refreshtoken" =$2', [refreshTokenResult.access_token, result.rows[0].refreshtoken], function(err, result) {
                done();
                if (err) {
                    console.log('The error ret data in refresh token mechanism:' + err);
                    //reject(err);
                    //res.status(400).send(err);
                } else {
                    console.log('The value here then update refresh token mechanism-->' + JSON.stringify(result));
                    res.json({
                        "token_type": "Bearer",
                        "access_token": refreshTokenResult.access_token,
                        //"expires_in": 1999900999,
                    })
                    //resolve(result);
                }
            })
        })

        //console.log('Refresh token flow:'+result)


    }
})
server.get('/token', async (req, res) => {
    console.log('The request in token:' + JSON.stringify(req.body));
    const conn = new jsforce.Connection({
        oauth2: oauth2
    });
    const code = req.query.code;
    try {
        const userInfo = await conn.authorize(code);

        //if (err) { return console.error("This error is in the auth callback: " + err); }

        console.log('Access Token: ' + conn.accessToken);
        console.log('Instance URL: ' + conn.instanceUrl);
        console.log('refreshToken: ' + conn.refreshToken);
        console.log('User ID: ' + userInfo.id);
        console.log('Org ID: ' + userInfo.organizationId);
        console.log('Org ID: ' + JSON.stringify(userInfo));

        req.session.accessToken = conn.accessToken;
        req.session.instanceUrl = conn.instanceUrl;
        req.session.refreshToken = conn.refreshToken;
        const {
            records
        } = await conn.query("SELECT Id, FirstName, LastName, Email FROM User where id='" + userInfo.id + "'")
        const user = records[0];
        console.log('The user detail in SFDC:' + JSON.stringify(user));
        await db.query('BEGIN')
        const result = await db.query('SELECT * FROM public."googleauthenticatedusers" WHERE "instanceurl" = $1 and "salesforceid"=$2',
            [conn.instanceUrl, userInfo.id])
        //if (result && result.rows.length == 0) {
        req.session.userid = await db.insertUser({
            email: user.Email,
            firstname: user.FirstName,
            lastname: user.LastName,
            accesstoken: conn.accessToken,
            refreshtoken: conn.refreshToken,
            instanceurl: conn.instanceUrl,
            salesforceid: userInfo.id,
            organizationid: userInfo.organizationId,
            authorizationcode: code,
            accesstokennew: '',
			organizationnickname :req.session.organizationnickname,
			googleid: req.session.googleid
        })
        await db.query('COMMIT')
        console.log('The inserted detail in SFDC:' + req.session.userid);
        //} else if (result) {
        //console.log('Called if result is present in the postgre table');
        //console.log(JSON.stringify(result.rows))
        //req.session.userid=result.rows[0].userid

        /*await db.updateUser({
        accesstoken:conn.accessToken,
        refreshtoken:conn.refreshToken,
	authorizationcode:code,
	salesforceid:userInfo.id
	})
	  await db.query('COMMIT')*/

        /*
	  	   pool.connect(function (err, client, done) {
        if (err) {
           console.log("Can not connect to the DB" + err);
		   //reject(err);
       }
       client.query('Update public."googleauthenticatedusers" set "authorizationcode" = ($1),"accesstoken" = ($2), "refreshtoken" =($3) WHERE "salesforceid" =($4)',[code,conn.accessToken,conn.refreshToken,userInfo.id], function (err, result) {
            done();
            if (err) {
                console.log('The error ret data:'+err);
				//reject(err);
                //res.status(400).send(err);
            }
			else
			{
            console.log('The value here then update-->'+JSON.stringify(result));
			 //resolve(result);
			}
       })
     })*/

        // }
        console.log(req.session.redirect_uri)
        if (req.session.redirect_uri!=null) {
			console.log('value redirect');
            res.redirect(req.session.redirect_uri + '?code=' + code + "&state=" + req.session.state)
        } else
            //res.redirect('/');
		      res.redirect('https://node-js-google-sfdc-app.herokuapp.com/user.html');
        ///res.send(JSON.stringify(Object.assign(userInfo,user,{session:req.session}, { rows: (!result ? result : result.rows) })))
    } catch (e) {
        await db.query('ROLLBACK')
        console.log(e.message)
        res.send(JSON.stringify(e))
    }
});

/*
var EstablishConnection = function(accesstoken, callback) {


    pool.connect(function(err, client, done) {
        if (err) {
            console.log("Can not connect to the DB" + err);
            //reject(err);
        }
        client.query('SELECT * FROM public."googleauthenticatedusers" WHERE "accesstoken" = $1 or "accesstokennew" =$2', [accesstoken, accesstoken], function(err, result) {
            done();
            if (err) {
                console.log('The error ret google user id:' + err);
                //reject(err);
                //res.status(400).send(err);
            } else {
                console.log('The value here then google user id-->' + JSON.stringify(result.rows));

                if (result.rows[0].accesstokennew == '') {
                    var conn = new jsforce.Connection({
                        oauth2: {
                            clientId: '3MVG9YDQS5WtC11qk.ArHtRRClgxBVv6.UbLdC7H6Upq8xs2G1EepruAJuuuogDIdevglKadHRNQDhITAnhif',
                            clientSecret: '4635706799290406853'
                        },
                        instanceUrl: result.rows[0].instanceurl,
                        accessToken: result.rows[0].accesstoken,
                        refreshToken: result.rows[0].refreshtoken
                    });
                    conn.on("refresh", function(accessToken, res) {
                        // Refresh event will be fired when renewed access token
                        // to store it in your storage for next request
                        console.log('Salesforce accessToken a/c creation:' + accessToken);
                        console.log('Salesforce res access a/c creation :' + JSON.stringify(res));
                      
                         client.query('Update public."googleauthenticatedusers" set "accesstokennew" = ($1) WHERE "accesstoken" =($2)', [accessToken, result.rows[0].accesstoken], function(err, result) {
                                //done();
                                if (err) {
                                    console.log('The error ret data a/c creation:' + err);
                                    //return err;
                                    //reject(err);
                                    //res.status(400).send(err);
                                } else {
                                    console.log('The value here after updating renewed access token a/c creation-->' + JSON.stringify(result));
                                    //resolve(conn);
                                }
                            })
                        
                    });
					callback(conn);
                    



                } else if (result.rows[0].accesstokennew != '') {
                    console.log('here we go');
                    var conn = new jsforce.Connection({
                        oauth2: {
                            clientId: '3MVG9YDQS5WtC11qk.ArHtRRClgxBVv6.UbLdC7H6Upq8xs2G1EepruAJuuuogDIdevglKadHRNQDhITAnhif',
                            clientSecret: '4635706799290406853'
                        },
                        instanceUrl: result.rows[0].instanceurl,
                        accessToken: result.rows[0].accesstokennew,
                        refreshToken: result.rows[0].refreshtoken
                    });
                    conn.on("refresh", function(accessToken, res) {
                        // Refresh event will be fired when renewed access token
                        // to store it in your storage for next request
                        console.log('Salesforce accessToken line 338 :' + accessToken);
                        console.log('Salesforce res line 339:' + JSON.stringify(res));
                      
                            client.query('Update public."googleauthenticatedusers" set "accesstokennew" = ($1) WHERE "accesstokennew" =($2)', [accessToken, result.rows[0].accesstokennew], function(err, result) {
                                //done();
                                if (err) {
                                    console.log('The error ret data line 349:' + err);
                                    //return err;
                                    //reject(err);
                                    //res.status(400).send(err);
                                } else {
                                    console.log('The value here after updating renewed access token line 356-->' + JSON.stringify(result));
                                    //resolve(conn);
                                }
                            })
                        
                    });
					callback(conn);
                   

                }
                //resolve(result.rows);
            }
        })
    })

}*/

var EstablishConnection = function(accesstoken) {
	return new Promise((resolve,reject)=>{
		var accesstokendetails={};
		
		pool.connect(function(err, client, done) {
        if (err) {
            console.log("Can not connect to the DB" + err);
            reject(err);
        }
        client.query('SELECT * FROM public."googleauthenticatedusers" WHERE "accesstoken" = $1 or "accesstokennew" =$2', [accesstoken, accesstoken], function(err, result) {
            done();
            if (err) {
                console.log('The error ret google user id:' + err);
                reject(err);
                //res.status(400).send(err);
            } else {
                console.log('The value here then google user id-->' + JSON.stringify(result.rows));

                if (result.rows[0].accesstokennew == '') {
                    var conn = new jsforce.Connection({
                        oauth2: {
                            clientId: '3MVG9YDQS5WtC11qk.ArHtRRClgxBVv6.UbLdC7H6Upq8xs2G1EepruAJuuuogDIdevglKadHRNQDhITAnhif',
                            clientSecret: '4635706799290406853'
                        },
                        instanceUrl: result.rows[0].instanceurl,
                        accessToken: result.rows[0].accesstoken,
                        refreshToken: result.rows[0].refreshtoken
                    });
					accesstokendetails.oldaccesstoken=result.rows[0].accesstoken;
					accesstokendetails.accesstokennew='';
					accesstokendetails.instanceUrl=result.rows[0].instanceurl;
					accesstokendetails.refreshToken=result.rows[0].refreshtoken;
					//var returnedTarget = Object.assign(conn, accesstokendetails);
                    conn.on("refresh", function(accessToken, res) {
                        // Refresh event will be fired when renewed access token
                        // to store it in your storage for next request
                        console.log('Salesforce accessToken a/c creation:' + accessToken);
                        console.log('Salesforce res access a/c creation :' + JSON.stringify(res));
                      
                         client.query('Update public."googleauthenticatedusers" set "accesstokennew" = ($1) WHERE "accesstoken" =($2)', [accessToken, result.rows[0].accesstoken], function(err, result) {
                                //done();
                                if (err) {
                                    console.log('The error ret data a/c creation:' + err);
                                    //return err;
                                    reject(err);
                                    //res.status(400).send(err);
                                } else {
                                    console.log('The value here after updating renewed access token a/c creation-->' + JSON.stringify(result));
									accesstokendetails.oldaccesstoken=result.rows[0].accesstoken;
					                accesstokendetails.accesstokennew=accessToken;
									accesstokendetails.instanceUrl=result.rows[0].instanceurl;
					                accesstokendetails.refreshToken=result.rows[0].refreshtoken;
									//var returnedTarget = Object.assign(conn, accesstokendetails);
                                    resolve(accesstokendetails);
                                }
                            })
                        
                    });
					
                    
                   resolve(accesstokendetails);


                } else if (result.rows[0].accesstokennew != '') {
                    console.log('here we go');
                    var conn = new jsforce.Connection({
                        oauth2: {
                            clientId: '3MVG9YDQS5WtC11qk.ArHtRRClgxBVv6.UbLdC7H6Upq8xs2G1EepruAJuuuogDIdevglKadHRNQDhITAnhif',
                            clientSecret: '4635706799290406853'
                        },
                        instanceUrl: result.rows[0].instanceurl,
                        accessToken: result.rows[0].accesstokennew,
                        refreshToken: result.rows[0].refreshtoken
                    });
					accesstokendetails.oldaccesstoken=result.rows[0].accesstoken;
					accesstokendetails.accesstokennew=result.rows[0].accesstokennew;
					accesstokendetails.instanceUrl=result.rows[0].instanceurl;
					accesstokendetails.refreshToken=result.rows[0].refreshtoken;
					//var returnedTarget = Object.assign(conn, accesstokendetails);
                    conn.on("refresh", function(accessToken, res) {
                        // Refresh event will be fired when renewed access token
                        // to store it in your storage for next request
                        console.log('Salesforce accessToken line 338 :' + accessToken);
                        console.log('Salesforce res line 339:' + JSON.stringify(res));
                      
                            client.query('Update public."googleauthenticatedusers" set "accesstokennew" = ($1) WHERE "accesstokennew" =($2)', [accessToken, result.rows[0].accesstokennew], function(err, result) {
                                //done();
                                if (err) {
                                    console.log('The error ret data line 349:' + err);
                                    //return err;
                                    reject(err);
                                    //res.status(400).send(err);
                                } else {
                                    console.log('The value here after updating renewed access token line 356-->' + JSON.stringify(result));
									accesstokendetails.oldaccesstoken=result.rows[0].accesstoken;
					                accesstokendetails.accesstokennew=accessToken;
									accesstokendetails.instanceUrl=result.rows[0].instanceurl;
					                accesstokendetails.refreshToken=result.rows[0].refreshtoken;
									//var returnedTarget = Object.assign(conn, accesstokendetails);
                                    resolve(accesstokendetails);
                                }
                            })
                        
                    });
					resolve(accesstokendetails);
                   

                }
                //resolve(result.rows);
            }
        })
    })
		
	});
};



app.intent('Connect to salesforce', (conv,params) => {
	return new Promise((resolve,reject)=>{
		EstablishConnection(conv.user.access.token).then(function(value)
	{
		conv.user.storage.accesstoneold=value.oldaccesstoken;
		conv.user.storage.accesstokennew=value.accesstokennew;
		conv.user.storage.instanceUrl=value.instanceUrl; 
		conv.user.storage.refreshToken=value.refreshToken;
		
		//Code to fetch the Namespace - Start
		/*value.query("SELECT NamespacePrefix FROM Organization", function(err, result) {
			console.log('Namespace result ----> ' + result.records[0].NamespacePrefix);
			//conv.ask(new SimpleResponse({speech:result,text:result}));
			if (err) {
				conv.ask(new SimpleResponse({speech:"Error while fetching Namespace",text:"Error while fetching namespace"}));
			}
			else{
				conv.user.storage.namespace = result.records[0].NamespacePrefix;
			}
		}*/
		//Code to fetch the Namespace - End
		
		console.log('value.oldaccesstoken:' + value.oldaccesstoken);
		console.log('value.accesstokennew:' + value.accesstokennew);
		console.log('value.instanceUrl:' + value.instanceUrl);
		console.log('value.refreshToken:' + value.refreshToken);
		//console.log('value.conn:' + value);
		resolve('connected');
		conv.ask(new SimpleResponse({
								speech: "Connected to Salesforce",
								text: "Connected to Salesforce"
							}));
							
		
	}).catch(function(value)
	{
		reject('Not connected');
		conv.ask(new SimpleResponse({
								speech: "Error while Connecting to Salesforce",
								text: "Error while Connecting to Salesforce"
							}));
							
	})
	});
	

});

app.intent('create a generic object record', (conv, params) => {
     return new Promise((resolve,reject)=>{
		  console.log('sobject label passed from google' + params.objectName);
      conv.user.storage.sandboxname='Dev';
	  console.log('conv.user.storage.sandboxname:'+conv.user.storage.sandboxname);
	  console.log('conv.user.storage.instanceUrl:'+conv.user.storage.instanceUrl);
	  console.log('conv.user.storage.accesstoneold:'+conv.user.storage.accesstoneold);
	  console.log('conv.user.storage.refreshToken:'+conv.user.storage.refreshToken);
	  console.log('conv.user.storage.accesstokennew:'+conv.user.storage.accesstokennew);
	  if(conv.user.storage.accesstokennew=='')
	  {
		  console.log('here');
		  
		   var header = 'Bearer ' + conv.user.storage.accesstoneold;
		      var conn = new jsforce.Connection({
                        oauth2: {
                            clientId: '3MVG9YDQS5WtC11qk.ArHtRRClgxBVv6.UbLdC7H6Upq8xs2G1EepruAJuuuogDIdevglKadHRNQDhITAnhif',
                            clientSecret: '4635706799290406853'
                        },
                        instanceUrl: conv.user.storage.instanceUrl,
                        accessToken: conv.user.storage.accesstoneold,
                        refreshToken: conv.user.storage.refreshToken
                    });
	  }
	  else if(conv.user.storage.accesstokennew!='')
	  {
		  console.log('here 556');
		  var header = 'Bearer ' + conv.user.storage.accesstokennew;
		     var conn = new jsforce.Connection({
                        oauth2: {
                            clientId: '3MVG9YDQS5WtC11qk.ArHtRRClgxBVv6.UbLdC7H6Upq8xs2G1EepruAJuuuogDIdevglKadHRNQDhITAnhif',
                            clientSecret: '4635706799290406853'
                        },
                        instanceUrl: conv.user.storage.instanceUrl,
                        accessToken: conv.user.storage.accesstokennew,
                        refreshToken: conv.user.storage.refreshToken
                    });
	  }
	 
            var options = {
                Authorization: header
            };
			//var response=conv.user.storage.connectionprop;
            conn.apex.get("/getMandFields/?objectName=" + params.objectName, options, function(err, resp) {
                if (err) {
                    conv.ask(new SimpleResponse({
                        speech: "Error while creating generic record",
                        text: "Error while creating generic record"
                    }));
                    reject(err);
                }
				else {
                    console.log("response: ", resp);
                    if (resp.length == 1) {
                        conv.ask(new SimpleResponse({
                            speech: "Hey, there is a mandatory field named " + resp[0] + " required for record creation." + " " + "Should you want to proceed with record creation " + " , " + " enter the values for " + resp[0] + " .",
                            text: "Hey, there is a mandatory field named " + resp[0] + " required for record creation." + " " + "Should you want to proceed with record creation " + " , " + " enter the values for " + resp[0] + " ."
                        }));
                    } 
					else{
						var strName = '';
                        for (var i = 0; i < resp.length; i++) {
                            strName += resp[i] + ',';
                        }
                        conv.ask(new SimpleResponse({
                            speech: "Hey, there are mandatory fields required for record creation. They are " + resp + " . " + " Should you want to proceed with record creation" + " , " + "enter the values for respective fields.",
                            text: "Hey, there are mandatory fields required for record creation. They are " + resp + " . " + " Should you want to proceed with record creation" + " , " + "enter the values for respective fields."
                        }));


                    }
                    resolve(resp);
                }
            });
		 
	 });
});



app.intent('Get CRUD permissions', (conv,params) => {
    return new Promise((resolve, reject) => {
        EstablishConnection(conv.user.access.token, function(response) {
            var header = 'Bearer ' + conv.user.access.token;
            var options = {
                Authorization: header
            };
			response.query("SELECT NamespacePrefix FROM Organization", function(err, result) {
				console.log('Namespace result ----> ' + result.records[0].NamespacePrefix);
				//conv.ask(new SimpleResponse({speech:result,text:result}));
				if (err) {
                    conv.ask(new SimpleResponse({speech:"Error while fetching Namespace",text:"Error while fetching namespace"}));
				}
				else{
					var restURL = "/crudINFO?objectName=" + params.objectName + "&profileName=" + params.profileName;
                    restURL = (result.records[0].NamespacePrefix != null) ? ("/" + result.records[0].NamespacePrefix + restURL) : (restURL);
					response.apex.get(restURL, options, function(err, resp) {
						if (err) {
							conv.ask(new SimpleResponse({
								speech: "Error while checking CRUD Permission",
								text: "Error while creating CRUD Permission"
							}));
							reject(err);
						} else {
							conv.ask(new SimpleResponse({speech:resp,text:resp}));
							resolve(resp);
						}
					});
				}
			});
        });
    });
});

app.intent('Default Welcome Intent', (conv,params) => {
	 return new Promise((resolve, reject) => {
        pool.connect(function(err, client, done) {
        if (err) {
            console.log("Can not connect to the DB" + err);
         
        }
        client.query('SELECT * FROM public."googleauthenticatedusers" WHERE "googleid" = $1', [params.EmailAddress], function(err, result) {
            done();
            if (err) {
                console.log('The error occured while retrieved record:' + err);
				conv.ask(new SimpleResponse({
								speech: "Sorry the email address is not linked to Google",
								text: "Sorry the email address is not linked to Google"
							}));
							reject(err);
                
            } 
			else {
                console.log('The value here then line 438-->' + JSON.stringify(result.rows));
		    console.log('The value here then line 439-->' + result.rows.length);

		  
			 if(result.rows.length >0)
			 {
		     var strNamefinal='You are connected to ';
		     var strName='';
		  for (var i = 0; i < result.rows.length; i++) {
           strName += result.rows[i].organizationnickname + ',';
            }
			strName = strName.replace(/,\s*$/, "");
             strNamefinal=strNamefinal+ strName;
			 conv.ask(new SimpleResponse({
								speech: strNamefinal,
								text: strNamefinal
							}));
							resolve(err);
			 }
			 else
			 {
				 conv.ask(new SimpleResponse({
								speech: "Sorry the email address is not linked to Google",
								text: "Sorry the email address is not linked to Google"
							}));
							resolve(err);
			 }
            }
        })
    })
    });
});



app.intent('Check Permission Set Assignment', (conv,params) => {
    return new Promise((resolve, reject) => {
        EstablishConnection(conv.user.access.token, function(response) {
            var header = 'Bearer ' + conv.user.access.token;
            var options = {
                Authorization: header
            };
			response.query("SELECT NamespacePrefix FROM Organization", function(err, result) {
				console.log('Namespace result ----> ' + result.records[0].NamespacePrefix);
				//conv.ask(new SimpleResponse({speech:result,text:result}));
				if (err) {
                    conv.ask(new SimpleResponse({speech:"Error while fetching Namespace",text:"Error while fetching namespace"}));
				}
				else{
					var restURL = "/checkPermSetAssignment?permSetName=" + params.permSetName + "&userName=" + params.userName;
                    restURL = (result.records[0].NamespacePrefix != null) ? ("/" + result.records[0].NamespacePrefix + restURL) : (restURL);
					response.apex.get(restURL, options, function(err, resp) {
						if (err) {
							conv.ask(new SimpleResponse({
								speech: "Error while checking permission set assignment",
								text: "Error while checking permission set assignment"
							}));
							reject(err);
						} else {
							conv.ask(new SimpleResponse({speech:resp,text:resp}));
							resolve(resp);
						}
					});
				}
			});
        });
    });
});

/*app.intent('Search for custom settings', (conv,params) => {
    return new Promise((resolve, reject) => {
        EstablishConnection(conv.user.access.token, function(response) {
            var header = 'Bearer ' + conv.user.access.token;
            var options = {
                Authorization: header
            };
			response.query("SELECT NamespacePrefix FROM Organization", function(err, result) {
				console.log('Namespace result ----> ' + result.records[0].NamespacePrefix);
				//conv.ask(new SimpleResponse({speech:result,text:result}));
				if (err) {
                    conv.ask(new SimpleResponse({speech:"Error while fetching Namespace",text:"Error while fetching namespace"}));
				}
				else{
					var restURL = "/getCustomSettings?custSettName=" + params.custSettName + "&namespace=" + result.records[0].NamespacePrefix;
                    restURL = (result.records[0].NamespacePrefix != null) ? ("/" + result.records[0].NamespacePrefix + restURL) : (restURL);
					response.apex.get(restURL, options, function(err, resp) {
						if (err) {
							conv.ask(new SimpleResponse({
								speech: "Error while fetching recent records",
								text: "Error while fetching recent records"
							}));
							reject(err);
						} else {
							conv.ask(new SimpleResponse({speech:resp,text:resp}));
							resolve(resp);
						}
					});
				}
			});
        });
    });
});*/

app.intent('Search for custom settings', (conv, params) => {
     return new Promise((resolve,reject)=>{
		  console.log('sobject label passed from google' + params.objectName);
      conv.user.storage.sandboxname='Dev';
	  console.log('conv.user.storage.sandboxname:'+conv.user.storage.sandboxname);
	  console.log('conv.user.storage.instanceUrl:'+conv.user.storage.instanceUrl);
	  console.log('conv.user.storage.accesstoneold:'+conv.user.storage.accesstoneold);
	  console.log('conv.user.storage.refreshToken:'+conv.user.storage.refreshToken);
	  console.log('conv.user.storage.accesstokennew:'+conv.user.storage.accesstokennew);
	  if(conv.user.storage.accesstokennew=='')
	  {
		  console.log('here');
		  
		   var header = 'Bearer ' + conv.user.storage.accesstoneold;
		      var conn = new jsforce.Connection({
                        oauth2: {
                            clientId: '3MVG9YDQS5WtC11qk.ArHtRRClgxBVv6.UbLdC7H6Upq8xs2G1EepruAJuuuogDIdevglKadHRNQDhITAnhif',
                            clientSecret: '4635706799290406853'
                        },
                        instanceUrl: conv.user.storage.instanceUrl,
                        accessToken: conv.user.storage.accesstoneold,
                        refreshToken: conv.user.storage.refreshToken
                    });
	  }
	  else if(conv.user.storage.accesstokennew!='')
	  {
		  console.log('here 556');
		  var header = 'Bearer ' + conv.user.storage.accesstokennew;
		  var conn = new jsforce.Connection({
                        oauth2: {
                            clientId: '3MVG9YDQS5WtC11qk.ArHtRRClgxBVv6.UbLdC7H6Upq8xs2G1EepruAJuuuogDIdevglKadHRNQDhITAnhif',
                            clientSecret: '4635706799290406853'
                        },
                        instanceUrl: conv.user.storage.instanceUrl,
                        accessToken: conv.user.storage.accesstokennew,
                        refreshToken: conv.user.storage.refreshToken
                    });
	  }
	 
            var options = {
                Authorization: header
            };
			//var response=conv.user.storage.connectionprop;
			conn.query("SELECT NamespacePrefix FROM Organization", function(err, result) {
				console.log('Namespace result ----> ' + result.records[0].NamespacePrefix);
				//conv.ask(new SimpleResponse({speech:result,text:result}));
				if (err) {
					conv.ask(new SimpleResponse({speech:"Error while fetching Namespace",text:"Error while fetching namespace"}));
				}
				else{
					var restURL = "/getCustomSettings?custSettName=" + params.custSettName + "&namespace=" + result.records[0].NamespacePrefix;
                    restURL = (result.records[0].NamespacePrefix != null) ? ("/" + result.records[0].NamespacePrefix + restURL) : (restURL);
					conn.apex.get(restURL, options, function(err, resp) {
						if (err) {
							conv.ask(new SimpleResponse({
								speech: "Error while fetching recent records",
								text: "Error while fetching recent records"
							}));
							reject(err);
						} else {
							conv.ask(new SimpleResponse({speech:resp,text:resp}));
							resolve(resp);
						}
					});
				}
			});
	    });
});

app.intent('Search for Custom Setting Name', (conv, params) => {
     return new Promise((resolve,reject)=>{
		  console.log('sobject label passed from google' + params.objectName);
      conv.user.storage.sandboxname='Dev';
	  console.log('conv.user.storage.sandboxname:'+conv.user.storage.sandboxname);
	  console.log('conv.user.storage.instanceUrl:'+conv.user.storage.instanceUrl);
	  console.log('conv.user.storage.accesstoneold:'+conv.user.storage.accesstoneold);
	  console.log('conv.user.storage.refreshToken:'+conv.user.storage.refreshToken);
	  console.log('conv.user.storage.accesstokennew:'+conv.user.storage.accesstokennew);
	  if(conv.user.storage.accesstokennew=='')
	  {
		  console.log('here');
		  
		   var header = 'Bearer ' + conv.user.storage.accesstoneold;
		      var conn = new jsforce.Connection({
                        oauth2: {
                            clientId: '3MVG9YDQS5WtC11qk.ArHtRRClgxBVv6.UbLdC7H6Upq8xs2G1EepruAJuuuogDIdevglKadHRNQDhITAnhif',
                            clientSecret: '4635706799290406853'
                        },
                        instanceUrl: conv.user.storage.instanceUrl,
                        accessToken: conv.user.storage.accesstoneold,
                        refreshToken: conv.user.storage.refreshToken
                    });
	  }
	  else if(conv.user.storage.accesstokennew!='')
	  {
		  console.log('here 556');
		  var header = 'Bearer ' + conv.user.storage.accesstokennew;
		    var conn = new jsforce.Connection({
                        oauth2: {
                            clientId: '3MVG9YDQS5WtC11qk.ArHtRRClgxBVv6.UbLdC7H6Upq8xs2G1EepruAJuuuogDIdevglKadHRNQDhITAnhif',
                            clientSecret: '4635706799290406853'
                        },
                        instanceUrl: conv.user.storage.instanceUrl,
                        accessToken: conv.user.storage.accesstokennew,
                        refreshToken: conv.user.storage.refreshToken
                    });
	  }
	 
            var options = {
                Authorization: header
            };
			//var response=conv.user.storage.connectionprop;
			conn.query("SELECT NamespacePrefix FROM Organization", function(err, result) {
				console.log('Namespace result ----> ' + result.records[0].NamespacePrefix);
				//conv.ask(new SimpleResponse({speech:result,text:result}));
				if (err) {
					conv.ask(new SimpleResponse({speech:"Error while fetching Namespace",text:"Error while fetching namespace"}));
				}
				else{
					const custSettName = conv.contexts.get('Searchforcustomsettings-followup').parameters['custSettName'];
					var restURL = "/getCustomSettings?custSettName=" + custSettName + "&recordName=" + params.recordName;
                    restURL = (result.records[0].NamespacePrefix != null) ? ("/" + result.records[0].NamespacePrefix + restURL) : (restURL);
					conn.apex.get(restURL, options, function(err, resp) {
						if (err) {
							conv.ask(new SimpleResponse({
								speech: "Error while fetching recent records",
								text: "Error while fetching recent records"
							}));
							reject(err);
						} else {
							conv.ask(new SimpleResponse({speech:resp,text:resp}));
							resolve(resp);
						}
					});
				}
			});
	    });
});

app.intent('Search Custom Settings Field Values', (conv,params) => {
    return new Promise((resolve, reject) => {
        EstablishConnection(conv.user.access.token, function(response) {
            var header = 'Bearer ' + conv.user.access.token;
            var options = {
                Authorization: header
            };
			response.query("SELECT NamespacePrefix FROM Organization", function(err, result) {
				//console.log('Namespace result ----> ' + result.records[0].NamespacePrefix);
				//conv.ask(new SimpleResponse({speech:result,text:result}));
				if (err) {
                    conv.ask(new SimpleResponse({speech:"Error while fetching Namespace",text:"Error while fetching namespace"}));
				}
				else{
					console.log('fieldNames----------->'+params.fieldNames);
					console.log('custSettName----------->'+params.custSettName);
					console.log('recordName----------->'+params.recordName);
					console.log('namespace ------------->'+result.records[0].NamespacePrefix);
					var restURL = "/getCustomSettings?custSettName=" + params.custSettName + "&fieldNames=" + params.fieldNames + "&recordName=" + params.recordName + "&namespace=" + result.records[0].NamespacePrefix + "&isUpdate=false";
					restURL = (result.records[0].NamespacePrefix != null) ? ("/" + result.records[0].NamespacePrefix + restURL) : (restURL);
					console.log('URL ----------->'+restURL);
					response.apex.get(restURL, options, function(err, resp) {
						console.log('resp line 806--->'+resp);
						if (err){
							console.log('err line 808 --->'+err);
							conv.ask(new SimpleResponse({
								speech: "Error while creating record",
								text: "Error while creating record"
							}));
							reject(err);
						} 
						else{
							conv.ask(new SimpleResponse({speech:resp,text:resp}));
							resolve(resp);
						}
					});
				}
			});
        });
    });
});

app.intent('Update Custom Settings Field Values', (conv,params) => {
    return new Promise((resolve, reject) => {
        EstablishConnection(conv.user.access.token, function(response) {
            var header = 'Bearer ' + conv.user.access.token;
            var options = {
                Authorization: header
            };
			response.query("SELECT NamespacePrefix FROM Organization", function(err, result) {
				console.log('Namespace result ----> ' + result.records[0].NamespacePrefix);
				//conv.ask(new SimpleResponse({speech:result,text:result}));
				if (err) {
                    conv.ask(new SimpleResponse({speech:"Error while fetching Namespace",text:"Error while fetching namespace"}));
				}
				else{
					console.log('fieldNames----------->'+params.fieldNames);
					console.log('custSettName----------->'+params.custSettName);
					console.log('recordName----------->'+params.recordName);
					var restURL = "/getCustomSettings?custSettName=" + params.custSettName + "&fieldNames=" + params.fieldNames + "&recordName=" + params.recordName + "&namespace=" + result.records[0].NamespacePrefix + "&isUpdate=true" + "&fieldValues=" + params.fieldValues;
					restURL = (result.records[0].NamespacePrefix != null) ? ("/" + result.records[0].NamespacePrefix + restURL) : (restURL);
					response.apex.get(restURL, options, function(err, resp) {
						console.log('resp line 806--->'+resp);
						if (err){
							console.log('err line 808 --->'+err);
							conv.ask(new SimpleResponse({
								speech: "Error while creating record",
								text: "Error while creating record"
							}));
							reject(err);
						} 
						else{
							conv.ask(new SimpleResponse({speech:resp,text:resp}));
							resolve(resp);
						}
					});
				}
			});
        });
    });
});

/*app.intent('Search for Custom Setting Name', (conv,params) => {
	console.log('Inside Search for Cust sett name');
    return new Promise((resolve, reject) => {
        EstablishConnection(conv.user.access.token, function(response) {
            var header = 'Bearer ' + conv.user.access.token;
            var options = {
                Authorization: header
            };
			response.query("SELECT NamespacePrefix FROM Organization", function(err, result) {
				console.log('Namespace result ----> ' + result.records[0].NamespacePrefix);
				//conv.ask(new SimpleResponse({speech:result,text:result}));
				if (err) {
                    conv.ask(new SimpleResponse({speech:"Error while fetching Namespace",text:"Error while fetching namespace"}));
				}
				else{
					const custSettName = conv.contexts.get('Searchforcustomsettings-followup').parameters['custSettName'];
					var restURL = "/getCustomSettings?custSettName=" + custSettName + "&recordName=" + params.recordName;
                    restURL = (result.records[0].NamespacePrefix != null) ? ("/" + result.records[0].NamespacePrefix + restURL) : (restURL);
					response.apex.get(restURL, options, function(err, resp) {
						if (err) {
							conv.ask(new SimpleResponse({
								speech: "Error while fetching recent records",
								text: "Error while fetching recent records"
							}));
							reject(err);
						} else {
							conv.ask(new SimpleResponse({speech:resp,text:resp}));
							resolve(resp);
						}
					});
				}
			});
        });
    });
});*/


app.intent('Get Recent Records', (conv,params) => {
    return new Promise((resolve, reject) => {
        EstablishConnection(conv.user.access.token, function(response) {
            var header = 'Bearer ' + conv.user.access.token;
            var options = {
                Authorization: header
            };
			response.query("SELECT NamespacePrefix FROM Organization", function(err, result) {
				console.log('Namespace result ----> ' + result.records[0].NamespacePrefix);
				//conv.ask(new SimpleResponse({speech:result,text:result}));
				if (err) {
                    conv.ask(new SimpleResponse({speech:"Error while fetching Namespace",text:"Error while fetching namespace"}));
				}
				else{
					var restURL = "/getRecords?objectName=" + params.objectName;
                    restURL = (result.records[0].NamespacePrefix != null) ? ("/" + result.records[0].NamespacePrefix + restURL) : (restURL);
					response.apex.get(restURL, options, function(err, resp) {
						if (err) {
							conv.ask(new SimpleResponse({
								speech: "Error while fetching recent records",
								text: "Error while fetching recent records"
							}));
							reject(err);
						} else {
							conv.ask(new SimpleResponse({speech:resp,text:resp}));
							resolve(resp);
						}
					});
				}
			});
        });
    });
});


app.intent('Assign Permission Set', (conv,params) => {
    return new Promise((resolve, reject) => {
        EstablishConnection(conv.user.access.token, function(response) {
            var header = 'Bearer ' + conv.user.access.token;
            var options = {
                Authorization: header
            };
			response.query("SELECT NamespacePrefix FROM Organization", function(err, result) {
				console.log('Namespace result ----> ' + result.records[0].NamespacePrefix);
				//conv.ask(new SimpleResponse({speech:result,text:result}));
				if (err) {
                    conv.ask(new SimpleResponse({speech:"Error while fetching Namespace",text:"Error while fetching namespace"}));
				}
				else{
					//const permSetName = conv.contexts.get('CheckPermissionSetAssignment-followup').parameters['permSetName'];
					//const userName = conv.contexts.get('CheckPermissionSetAssignment-followup').parameters['userName'];
					var restURL = "/assignPermSet?permSetName=" + params.permSetName + "&userName=" + params.userName;
                    restURL = (result.records[0].NamespacePrefix != null) ? ("/" + result.records[0].NamespacePrefix + restURL) : (restURL);
					response.apex.get(restURL, options, function(err, resp) {
						if (err) {
							conv.ask(new SimpleResponse({
								speech: "Error while assigning Permission Set",
								text: "Error while assigning Permission Set"
							}));
							reject(err);
						} else {
							conv.ask(new SimpleResponse({speech:resp,text:resp}));
							resolve(resp);
						}
					});
				}
			});
        });
    });
});

app.intent('Run Batch Job With Size now', (conv,params) => {
    return new Promise((resolve, reject) => {
        EstablishConnection(conv.user.access.token, function(response) {
            var header = 'Bearer ' + conv.user.access.token;
            var options = {
                Authorization: header
            };
			response.query("SELECT NamespacePrefix FROM Organization", function(err, result) {
				
				if (err) {
                    conv.ask(new SimpleResponse({speech:"Error while fetching Namespace",text:"Error while fetching namespace"}));
				}
				else{
					
					
					
					var restURL = "/runBatchJob?batchClassName=" + params.batchClsName + "&batchSize=" + params.batchSz;
                    restURL = (result.records[0].NamespacePrefix != null) ? ("/" + result.records[0].NamespacePrefix + restURL) : (restURL);
					response.apex.get(restURL, options, function(err, resp) {
						if (err) {
							conv.ask(new SimpleResponse({
								speech: "Exception encountered. Please contact your admin team",
								text: "Exception encountered. Please contact your admin team"
							}));
							reject(err);
						} 
						else{
							if (resp == 'Pass') {
								conv.ask(new SimpleResponse({
								speech: "Okay. Batch job for batch class named " + params.batchClsName + " has been submitted for execution.",
								text: "Okay. Batch job for batch class named " + params.batchClsName + " has been submitted for execution."
								}));
							} 
							else {
								conv.ask(new SimpleResponse({
									speech: "There is no batch class with name " + params.batchClsName + " Please try again with the correct class name.",
									text: "There is no batch class with name " + params.batchClsName + " Please try again with the correct class name."
								}));
							}
							resolve(resp);
						}
					});
				}
			});
        });
    });
});

app.intent('Run a batch job', (conv,params) => {
    return new Promise((resolve, reject) => {
        EstablishConnection(conv.user.access.token, function(response) {
            var header = 'Bearer ' + conv.user.access.token;
            var options = {
                Authorization: header
            };
			response.query("SELECT NamespacePrefix FROM Organization", function(err, result) {
				console.log('Namespace result ----> ' + result.records[0].NamespacePrefix);
				if (err) {
                    conv.ask(new SimpleResponse({speech:"Error while fetching Namespace",text:"Error while fetching namespace"}));
				}
				else{
					
					//var finlClassName = params.className.replace(/\s/g,'').replace(/underscore/g,'_');
					
					var restURL = "/runBatchJob?batchClassName=" + params.batchClassName + "&batchSize=" + "";
                    restURL = (result.records[0].NamespacePrefix != null) ? ("/" + result.records[0].NamespacePrefix + restURL) : (restURL);
					response.apex.get(restURL, options, function(err, resp) {
						console.log('resp from run batch job-->'+resp);
						if (err) {
							conv.ask(new SimpleResponse({
								speech: "Exception encountered. Please contact your admin team",
								text: "Exception encountered. Please contact your admin team"
							}));
							reject(err);
						} 
						else {
							if (resp == 'Pass') {
								conv.ask(new SimpleResponse({
								speech: "Would you like to set any specific batch size ?  Please note that if you don't then default size of the batch would be set to 200.",
								text: "Would you like to set any specific batch size ?  Please note that if you don't then default size of the batch would be set to 200."
								}));
							} 
							else if(resp != 'Pass' && resp != 'Fail'){
								conv.ask(new SimpleResponse({
									speech: resp,
									text: resp
								}));
							}
							else if(resp == 'Fail'){
								conv.ask(new SimpleResponse({
									speech: "There is no batch class with name " + params.batchClassName + ". Please try again with the correct class name.",
									text: "There is no batch class with name " + params.batchClassName + ". Please try again with the correct class name."
								}));
							}
							resolve(resp);
						}
					});
				}
			});
        });
    });
});

app.intent('BatchSize-Custom', (conv,params) => {
    return new Promise((resolve, reject) => {
        EstablishConnection(conv.user.access.token, function(response) {
            var header = 'Bearer ' + conv.user.access.token;
            var options = {
                Authorization: header
            };
			response.query("SELECT NamespacePrefix FROM Organization", function(err, result) {
				console.log('Namespace result ----> ' + result.records[0].NamespacePrefix);
				//conv.ask(new SimpleResponse({speech:result,text:result}));
				if (err) {
                    conv.ask(new SimpleResponse({speech:"Error while fetching Namespace",text:"Error while fetching namespace"}));
				}
				else{
					const batchClassName = conv.contexts.get('runabatchjob-followup').parameters['batchClassName'];
					console.log(batchClassName);
					//var finlClassNme = batchClassName.replace(/\s/g,'').replace(/underscore/g,'_');
					var restURL = "/runBatchJob?batchClassName=" + batchClassName + "&batchSize=" + params.batchSize;
                    restURL = (result.records[0].NamespacePrefix != null) ? ("/" + result.records[0].NamespacePrefix + restURL) : (restURL);
					response.apex.get(restURL, options, function(err, resp) {
						if (err) {
							conv.ask(new SimpleResponse({
								speech: "Exception encountered. Please contact your admin team",
								text: "Exception encountered. Please contact your admin team"
							}));
							reject(err);
						} 
						else {
							if (resp == 'Pass') {
								conv.ask(new SimpleResponse({
								speech: "Okay. Batch job for batch class named " + batchClassName + " with scope " + params.batchSize + " has been submitted for execution.",
								text: "Okay. Batch job for batch class named " + batchClassName + " with scope " + params.batchSize + " has been submitted for execution."
								}));
							} 
							else {
								conv.ask(new SimpleResponse({
									speech: "There is no batch class with name " + batchClassName + " Please try again with the correct class name.",
									text: "There is no batch class with name " + batchClassName + " Please try again with the correct class name."
								}));
							}
							resolve(resp);
						}
					});
				}
			});
        });
    });
});


app.intent('BatchSize-Default', (conv,params) => {
	console.log('conv.user.storage.sandboxname line 653:'+conv.user.storage.sandboxname);
    return new Promise((resolve, reject) => {
        EstablishConnection(conv.user.access.token, function(response) {
            var header = 'Bearer ' + conv.user.access.token;
            var options = {
                Authorization: header
            };
			response.query("SELECT NamespacePrefix FROM Organization", function(err, result) {
				console.log('Namespace result ----> ' + result.records[0].NamespacePrefix);
				//conv.ask(new SimpleResponse({speech:result,text:result}));
				if (err) {
                    conv.ask(new SimpleResponse({speech:"Error while fetching Namespace",text:"Error while fetching namespace"}));
				}
				else{
					const batchClassName = conv.contexts.get('runabatchjob-followup').parameters['batchClassName'];
					console.log(batchClassName);
					//var fnlClassNme = batchClassName.replace(/\s/g,'').replace(/underscore/g,'_');
					var defaultBatchSize = '200';
					var restURL = "/runBatchJob?batchClassName=" + batchClassName + "&batchSize=" + "200";
                    restURL = (result.records[0].NamespacePrefix != null) ? ("/" + result.records[0].NamespacePrefix + restURL) : (restURL);
					response.apex.get(restURL, options, function(err, resp) {
						if (err) {
							conv.ask(new SimpleResponse({
								speech: "Exception encountered. Please contact your admin team",
								text: "Exception encountered. Please contact your admin team"
							}));
							reject(err);
						} 
						else {
							if (resp == 'Pass') {
								conv.ask(new SimpleResponse({
								speech: "Okay. Batch job for batch class named " + batchClassName + " with default scope 200 has been submitted for execution.",
								text: "Okay. Batch job for batch class named " + batchClassName + " with default scope 200 has been submitted for execution."
								}));
							} 
							else {
								conv.ask(new SimpleResponse({
									speech: "There is no batch class with name " + batchClassName + " Please try again with the correct class name.",
									text: "There is no batch class with name " + batchClassName + " Please try again with the correct class name."
								}));
							}
							resolve(resp);
						}
					});
				}
			});
        });
    });
});





app.intent('Check Batch Job Status', (conv,params) => {
    return new Promise((resolve, reject) => {
        EstablishConnection(conv.user.access.token, function(response) {
            var header = 'Bearer ' + conv.user.access.token;
            var options = {
                Authorization: header
            };
			response.query("SELECT NamespacePrefix FROM Organization", function(err, result) {
				console.log('Namespace result ----> ' + result.records[0].NamespacePrefix);
				//conv.ask(new SimpleResponse({speech:result,text:result}));
				if (err) {
                    conv.ask(new SimpleResponse({speech:"Error while fetching Namespace",text:"Error while fetching namespace"}));
				}
				else{
					console.log('params.className ---> ' + params.className);
					console.log('params ---> ' + JSON.stringify(params));
					var restURL = "/BatchJobStatus?batchClassName=" + params.className;
                    restURL = (result.records[0].NamespacePrefix != null) ? ("/" + result.records[0].NamespacePrefix + restURL) : (restURL);
					response.apex.get(restURL, options, function(err, resp) {
						if (err) {
							conv.ask(new SimpleResponse({
								speech: "Error while checking job status",
								text: "Error while checking job status"
							}));
							reject(err);
						} else {
							//conv.ask(new SimpleResponse({speech:resp,text:resp}));
							resolve(resp);
							var s = params.className.replace(/\s/g,'').replace(/underscore/g,'_');
							if (!resp.includes('There')) {
								conv.ask(new SimpleResponse({
									speech: "Status of apex batch job for class named " + s + " is " + resp + ".",
									text: "Status of apex batch job for class named " + s + " is " + resp + "."
								}));
							} else {
								conv.ask(new SimpleResponse({
									speech: "There are no batch jobs for class " + params.className + ".",
									text: "There are no batch jobs for class " + params.className + "."
								}));
							}
						}
					});
				}
			});
			console.log('Here');
        });
    });
});




/*
app.intent('create a generic object record', (conv, params) => {

    console.log('sobject label passed from google' + params.objectName);
      conv.user.storage.sandboxname='Dev';
	  console.log('conv.user.storage.sandboxname:'+conv.user.storage.sandboxname);
    return new Promise((resolve, reject) => {
        EstablishConnection(conv.user.access.token, function(response) {
            var header = 'Bearer ' + conv.user.access.token;
            var options = {
                Authorization: header
            };
            response.apex.get("/getMandFields/?objectName=" + params.objectName, options, function(err, resp) {
                if (err) {
                    conv.ask(new SimpleResponse({
                        speech: "Error while creating generic record",
                        text: "Error while creating generic record"
                    }));
                    reject(err);
                }
				else {
                    console.log("response: ", resp);
                    if (resp.length == 1) {
                        conv.ask(new SimpleResponse({
                            speech: "Hey, there is a mandatory field named " + resp[0] + " required for record creation." + " " + "Should you want to proceed with record creation " + " , " + " enter the values for " + resp[0] + " .",
                            text: "Hey, there is a mandatory field named " + resp[0] + " required for record creation." + " " + "Should you want to proceed with record creation " + " , " + " enter the values for " + resp[0] + " ."
                        }));
                    } 
					else{
						var strName = '';
                        for (var i = 0; i < resp.length; i++) {
                            strName += resp[i] + ',';
                        }
                        conv.ask(new SimpleResponse({
                            speech: "Hey, there are mandatory fields required for record creation. They are " + resp + " . " + " Should you want to proceed with record creation" + " , " + "enter the values for respective fields.",
                            text: "Hey, there are mandatory fields required for record creation. They are " + resp + " . " + " Should you want to proceed with record creation" + " , " + "enter the values for respective fields."
                        }));


                    }
                    resolve(resp);
                }
            });
        });
    });
});*/


app.intent('Enter Mandatory Fields Data', (conv,params) => {
    return new Promise((resolve, reject) => {
        EstablishConnection(conv.user.access.token, function(response) {
            var header = 'Bearer ' + conv.user.access.token;
            var options = {
                Authorization: header
            };
			response.query("SELECT NamespacePrefix FROM Organization", function(err, result) {
				
				if (err) {
                    conv.ask(new SimpleResponse({speech:"Error while fetching Namespace",text:"Error while fetching namespace"}));
				}
				else{
					const objectName = conv.contexts.get('createagenericobjectrecord-followup').parameters['objectName'];
					console.log('fieldNames----------->'+params.fieldNames);
					console.log('fieldNames----------->'+params.fieldValues);
					if(params.fieldNames != null && params.fieldValues != null){
						var restURL = "/insertGenericRecSrvc?objectName=" + objectName + "&fieldNames=" + params.fieldNames + "&fieldValues=" + params.fieldValues;
						restURL = (result.records[0].NamespacePrefix != null) ? ("/" + result.records[0].NamespacePrefix + restURL) : (restURL);
						response.apex.get(restURL, options, function(err, resp) {
							console.log('resp line 806--->'+resp);
							if (err){
								console.log('err line 808 --->'+err);
								conv.ask(new SimpleResponse({
									speech: "Error while creating record",
									text: "Error while creating record"
								}));
								reject(err);
							} 
							else{
								console.log('resp line 816 --->'+resp);
								if (resp === 'Success') {
									console.log('resp line 818 --->'+resp);
									conv.ask(new SimpleResponse({
											speech: objectName + " record has been created successfully.",
											text: objectName + " record has been created successfully."
									}));
									resolve(resp);
								} 
								else{
									console.log('resp line 826 --->'+resp);
									conv.ask(new SimpleResponse({
										speech: "Error received while creating record . " + resp,
										text: "Error received while creating record . " + resp
									}));
									reject(err);
								}
							}
						});
					}
					else{
						conv.ask(new SimpleResponse({
							speech: "Could you please repeat the sentence again with correct wordings.",
							text: "Could you please repeat the sentence again with correct wordings. "
						}));
					}
				}
			});
        });
    });
});


app.intent('Get Opportunity Details', (conv,params) => {
    return new Promise((resolve, reject) => {
        EstablishConnection(conv.user.access.token, function(response) {
            var header = 'Bearer ' + conv.user.access.token;
            var options = {
                Authorization: header
            };
			response.query("SELECT NamespacePrefix FROM Organization", function(err, result) {
				
				if (err) {
                    conv.ask(new SimpleResponse({speech:"Error while fetching Namespace",text:"Error while fetching namespace"}));
				}
				else{
					
					var restURL = "/getOpptyInfo?oppName=" + params.oppName + "&fieldNames=" + params.fieldNames;
                    restURL = (result.records[0].NamespacePrefix != null) ? ("/" + result.records[0].NamespacePrefix + restURL) : (restURL);
					response.apex.get(restURL, options, function(err, resp) {
						if (err){
							conv.ask(new SimpleResponse({
								speech: "Error while fetching information",
								text: "Error while fetching information"
							}));
							reject(err);
						} 
						else{
							
							conv.ask(new SimpleResponse({
									speech: resp,
									text: resp
							}));
							resolve(resp);
							
						}
					});
				}
			});
        });
    });
});


app.intent('Update Opportunity', (conv,params) => {
    return new Promise((resolve, reject) => {
        EstablishConnection(conv.user.access.token, function(response) {
            var header = 'Bearer ' + conv.user.access.token;
            var options = {
                Authorization: header
            };
			response.query("SELECT NamespacePrefix FROM Organization", function(err, result) {
				
				if (err) {
                    conv.ask(new SimpleResponse({speech:"Error while fetching Namespace",text:"Error while fetching namespace"}));
				}
				else{
					console.log('should be here');
					
					//const opptName = conv.contexts.get('GetOpportunityDetails-followup').parameters['oppName'];
					//console.log(opptName);
					
					//console.log('fieldNames-->'+params.fieldNames);
					//console.log('fieldVal---->'+params.fieldValues);
					
					var restURL = "/updateOpptyInfo?oppName=" + params.oppName + "&fieldNames=" + params.fieldNames + "&fieldValues=" + params.fieldValues;
                    restURL = (result.records[0].NamespacePrefix != null) ? ("/" + result.records[0].NamespacePrefix + restURL) : (restURL);
					response.apex.get(restURL, options, function(err, resp) {
						if (err){
							conv.ask(new SimpleResponse({
								speech: "Error while fetching information. Request you to report this issue to your admin team.",
								text: "Error while fetching information. Request you to report this issue to your admin team."
							}));
							reject(err);
						} 
						else{
							
							conv.ask(new SimpleResponse({
								speech: resp,
								text: resp
							}));
							resolve(resp);							
						}
					});
				}
			});
        });
    });
});


app.intent('Create Task on Opportunity', (conv,params) => {
    return new Promise((resolve, reject) => {
        EstablishConnection(conv.user.access.token, function(response) {
            var header = 'Bearer ' + conv.user.access.token;
            var options = {
                Authorization: header
            };
			response.query("SELECT NamespacePrefix FROM Organization", function(err, result) {
				
				if (err) {
                    conv.ask(new SimpleResponse({speech:"Error while fetching Namespace",text:"Error while fetching namespace"}));
				}
				else{
					
					var restURL = "/createTask?oppName=" + params.oppName + "&taskSubject=" + params.taskSubject + "&taskPriority=" + params.taskPriority;
                    restURL = (result.records[0].NamespacePrefix != null) ? ("/" + result.records[0].NamespacePrefix + restURL) : (restURL);
					response.apex.get(restURL, options, function(err, resp) {
						if (err){
							conv.ask(new SimpleResponse({
								speech: "Error while creating task",
								text: "Error while creating task"
							}));
							reject(err);
						} 
						else{
							
							conv.ask(new SimpleResponse({
									speech: resp,
									text: resp
							}));
							resolve(resp);
							
						}
					});
				}
			});
        });
    });
});

app.intent('Create a New Custom Label', (conv,params) => {
    return new Promise((resolve, reject) => {
        EstablishConnection(conv.user.access.token, function(response) {
            var header = 'Bearer ' + conv.user.access.token;
            var options = {
                Authorization: header
            };
			response.query("SELECT NamespacePrefix FROM Organization", function(err, result) {			
				if (err) {
                    conv.ask(new SimpleResponse({speech:"Error while fetching Namespace",text:"Error while fetching namespace"}));
				}
				else{	
					var restURL = "/createCustomLabel?customLabelName=" + params.customLabelName + "&customLabelValue=" + params.customLabelValue;
                    restURL = (result.records[0].NamespacePrefix != null) ? ("/" + result.records[0].NamespacePrefix + restURL) : (restURL);
					response.apex.get(restURL, options, function(err, resp) {
						if (err){
							conv.ask(new SimpleResponse({
								speech: "Error while creating Custom Label",
								text: "Error while creating Custom Label"
							}));
							reject(err);
						} 
						else{
							conv.ask(new SimpleResponse({
									speech: resp,
									text: resp
							}));
							resolve(resp);
						}
					});
				}
			});
        });
    });
});

app.intent('Update Value of Custom Label', (conv,params) => {
    return new Promise((resolve, reject) => {
        EstablishConnection(conv.user.access.token, function(response) {
            var header = 'Bearer ' + conv.user.access.token;
            var options = {
                Authorization: header
            };
			response.query("SELECT NamespacePrefix FROM Organization", function(err, result) {			
				if (err) {
                    conv.ask(new SimpleResponse({speech:"Error while fetching Namespace",text:"Error while fetching namespace"}));
				}
				else{	
					var restURL = "/updateCustomLabel?customLabelName=" + params.customLabelName + "&customLabelValue=" + params.customLabelValue;
                    restURL = (result.records[0].NamespacePrefix != null) ? ("/" + result.records[0].NamespacePrefix + restURL) : (restURL);
					response.apex.get(restURL, options, function(err, resp) {
						if (err){
							conv.ask(new SimpleResponse({
								speech: "Error while updating Custom Label",
								text: "Error while updating Custom Label"
							}));
							reject(err);
						} 
						else{
							conv.ask(new SimpleResponse({
									speech: resp,
									text: resp
							}));
							resolve(resp);
						}
					});
				}
			});
        });
    });
});



var port = process.env.PORT || 3000;


server.get('/', (req, res) => {
    //res.send('Hello World!');
});
server.post('/fulfillment', app);



server.listen(port, function() {
    console.log('port', port);
    console.log("Server is up and running...");
	//logger.logger('Server is up and running..');
});
