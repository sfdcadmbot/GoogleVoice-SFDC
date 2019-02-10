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
var logger=require('./logger/logger');


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

    /*
    if((req.url=='/'||req.url=='index.html') && req.session.userid){
      req.url = '/user.html' // add something to lead to different directory
    }*/
    next();
});
server.use(express.static('public'))


/**
 * Login endpoint
 */
server.all("/auth/login", function(req, res) {
    // Redirect to Salesforce login/authorization page
    if (req.body.redirect_uri) {
        console.log("Setting redirect url " + req.body.redirect_uri)
        req.session.redirect_uri = req.body.redirect_uri
        req.session.state = req.body.state
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
            accesstokennew: ''
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
        if (req.session.redirect_uri) {
            res.redirect(req.session.redirect_uri + '?code=' + code + "&state=" + req.session.state)
        } else
            res.redirect('/');
        ///res.send(JSON.stringify(Object.assign(userInfo,user,{session:req.session}, { rows: (!result ? result : result.rows) })))
    } catch (e) {
        await db.query('ROLLBACK')
        console.log(e.message)
        res.send(JSON.stringify(e))
    }
});


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
                        pool.connect(function(err, client, done) {
                            if (err) {
                                console.log("Can not connect to the DB a/c creation" + err);
                                //return err;
                                //reject(err);
                            }
                            client.query('Update public."googleauthenticatedusers" set "accesstokennew" = ($1) WHERE "accesstoken" =($2)', [accessToken, result.rows[0].accesstoken], function(err, result) {
                                done();
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
                        pool.connect(function(err, client, done) {
                            if (err) {
                                console.log("Can not connect to the DB line 342" + err);
                                //return err;
                                //reject(err);
                            }
                            client.query('Update public."googleauthenticatedusers" set "accesstokennew" = ($1) WHERE "accesstokennew" =($2)', [accessToken, result.rows[0].accesstokennew], function(err, result) {
                                done();
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
                        })
                    });
                    callback(conn);

                }
                //resolve(result.rows);
            }
        })
    })

}



var executeBatchWithSize = function(batchClassName, batchSize) {
    return new Promise((resolve, reject) => {
        conn.login(process.env.username, process.env.pass, (err, res) => {
            if (err) {
                reject(err);
            } else {
                var header = 'Bearer ' + conn.accessToken;
                var options = {
                    Authorization: header
                };

                conn.apex.get("/runBatchJob?batchClassName=" + batchClassName + "&batchSize=" + batchSize, options, function(err, res) {

                    if (err) {
                        reject(err);
                    } else {
                        resolve(res);
                    }
                });

            }
        });
    });
}




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


app.intent('BatchSize-Custom', (conv, params) => {

    console.log('this should be triggered for custom batch size');

    const batchClassName = conv.contexts.get('runabatchjob-followup').parameters['batchClassName'];
    console.log(batchClassName);

    return executeBatchWithSize(batchClassName, params.batchSize).then((resp) => {
            if (resp == 'Pass') {
                conv.ask(new SimpleResponse({
                    speech: "Okay. Batch job for batch class named " + batchClassName + " and scope " + params.batchSize + " has been submitted for execution.",
                    text: "Okay. Batch job for batch class named " + batchClassName + " and scope " + params.batchSize + " has been submitted for execution."
                }));
            } else {
                conv.ask(new SimpleResponse({
                    speech: "There is no batch class with " + batchClassName,
                    text: "There is no batch class " + batchClassName
                }));
            }
        })
        .catch((err) => {
            console.log('err-->' + err);
            conv.ask(new SimpleResponse({
                speech: "Error while submitting batch job for execution",
                text: "Error while submitting batch job for execution"
            }));
        });
});

app.intent('BatchSize-Default', (conv, params) => {

    console.log('this should be triggered for default batch size');

    const batchClassName = conv.contexts.get('runabatchjob-followup').parameters['batchClassName'];

    return executeBatchWithSize(batchClassName, 200).then((resp) => {
            if (resp == 'Pass') {
                conv.ask(new SimpleResponse({
                    speech: "Okay. Batch job for batch class named " + batchClassName + " with default size 200" + " has been submitted for execution.",
                    text: "Okay. Batch job for batch class named " + batchClassName + " with default size 200" + " has been submitted for execution."
                }));
            } else {
                conv.ask(new SimpleResponse({
                    speech: "There is no batch class with " + batchClassName,
                    text: "There is no batch class " + batchClassName
                }));
            }
        })
        .catch((err) => {
            a
            console.log('err-->' + err);
            conv.ask(new SimpleResponse({
                speech: "Error while submitting batch job for execution",
                text: "Error while submitting batch job for execution"
            }));
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
									speech: "Sure! Status of batch job for class named " + s + " is " + resp + ".",
									text: "Sure! Status of batch job for class named " + s + " is " + resp + "."
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





app.intent('create a generic object record', (conv, params) => {

    console.log('sobject label passed from google' + params.objectName);

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
});


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
					var restURL = "/insertGenericRecSrvc?objectName=" + objectName + "&fieldNames=" + params.fieldNames + "&fieldValues=" + params.fieldValues;
                    restURL = (result.records[0].NamespacePrefix != null) ? ("/" + result.records[0].NamespacePrefix + restURL) : (restURL);
					response.apex.get(restURL, options, function(err, resp) {
						if (err){
							conv.ask(new SimpleResponse({
								speech: "Error while creating record",
								text: "Error while creating record"
							}));
							reject(err);
						} 
						else{
							if (resp === 'Success') {
								conv.ask(new SimpleResponse({
										speech: objectName + " record has been created successfully.",
										text: objectName + " record has been created successfully."
								}));
								resolve(resp);
							} 
							else{
								conv.ask(new SimpleResponse({
									speech: "Error received while creating record . " + resp,
									text: "Error received while creating record . " + resp
								}));
								reject(err);
							}
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
	logger.logger('Server is up and running..');
});
