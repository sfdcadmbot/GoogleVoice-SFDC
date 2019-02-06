
 // dependencies

const express = require('express');
const http = require('https');
const bodyParser=require('body-parser');
const jsforce = require('jsforce'); 
const server = express();
const path = require('path');
const session = require('express-session');
const db = require('./db');
const config = require('./config/config');
const pg = require('pg');
const pool = new pg.Pool(config.db);
//var logger=require('./logger/logger').Logger;
var cookieParser = require('cookie-parser')
var strname = ''; 



var conn = new jsforce.Connection({ 
    loginUrl: 'https://login.salesforce.com', //'https://login.salesforce.com', 
    version: '43.0' 
}); 
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
server.use(cookieParser())
//initialize session
server.use(session({ secret: 'S3CRE7', resave: true, saveUninitialized: true }));
server.use(bodyParser.json());
server.use(bodyParser.urlencoded({ extended: true }))
// create serve and configure it.
//Simple request time logger
server.use(function(req, res, next){
  console.log("A new request received at " + Date.now() +" for "+req.url);

  next();
});
//jsForce connection
var oauth2 = new jsforce.OAuth2(config.oauth);

// Serve static assets
server.use('/', function(req,res,next){
  
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
server.all("/auth/login", function (req, res) {
  // Redirect to Salesforce login/authorization page
  if(req.body.redirect_uri){
    console.log("Setting redirect url "+req.body.redirect_uri)
    req.session.redirect_uri = req.body.redirect_uri
    req.session.state = req.body.state
  }
  if(req.body.orgurl){
   oauth2=new jsforce.OAuth2(Object.assign(config.oauth,{loginUrl:req.body.orgurl}))
  }else if(req.body.org=='Production'){
    oauth2=new jsforce.OAuth2(Object.assign(config.oauth,{loginUrl:'https://login.salesforce.com'}))
  }else if((req.body.org=='Sandbox')){
    oauth2=new jsforce.OAuth2(Object.assign(config.oauth,{loginUrl:'https://test.salesforce.com'}))
  }
  
  console.log(req.body)
  res.redirect(oauth2.getAuthorizationUrl({ scope: 'api id web refresh_token' }));
});

/**
* Login callback endpoint (only called by Force.com)
*/
server.all('/token2', async (req, res) => {
console.log('The request in token2:'+JSON.stringify(req.body));
  console.log("token"+ req.body.code||req.body.refresh_token)
  //code=req.body.code;
 
  if(req.body.grant_type=='authorization_code'){
	  
	var result = await db.query('SELECT * FROM public."googleauthenticatedusers" WHERE "authorizationcode" = $1',[req.body.code]);
     res.json({
    "token_type": "Bearer",
    "access_token": result.rows[0].accesstoken,
    "refresh_token":  result.rows[0].refreshtoken,
    //"expires_in": 1999900999,
    })
   
  }else if(req.body.grant_type=='refresh_token'){
	  
	   var result = await db.query('SELECT * FROM public."googleauthenticatedusers" WHERE "refreshtoken" = $1',[req.body.refresh_token]);
    const conn = new jsforce.Connection({ oauth2: oauth2 });
    var refreshTokenResult =await conn.oauth2.refreshToken(result.rows[0].refreshtoken)
    //await db.query('UPDATE public."googleauthenticatedusers" SET "accesstoken" = $1 WHERE "refreshtoken" =$2',[refreshTokenResult.access_token,result.rows[0].refreshtoken])
	
		pool.connect(function (err, client, done) {
        if (err) {
           console.log("Can not connect to the DB" + err);
		   //reject(err);
       }
       client.query('UPDATE public."googleauthenticatedusers" SET "accesstoken" = $1 WHERE "refreshtoken" =$2',[refreshTokenResult.access_token,result.rows[0].refreshtoken], function (err, result) {
            done();
            if (err) {
                console.log('The error ret data in refresh token mechanism:'+err);
				//reject(err);
                //res.status(400).send(err);
            }
			else
			{
            console.log('The value here then update refresh token mechanism-->'+JSON.stringify(result));
					 res.json({
			  "token_type": "Bearer",
			  "access_token":  refreshTokenResult.access_token,
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
console.log('The request in token:'+JSON.stringify(req.body));
  const conn = new jsforce.Connection({ oauth2: oauth2 });
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
    const {records}=await conn.query("SELECT Id, FirstName, LastName, Email FROM User where id='"+userInfo.id+"'")
    const user=records[0];
    console.log('The user detail in SFDC:'+JSON.stringify(user));
    await db.query('BEGIN')
    const result = await db.query('SELECT * FROM public."googleauthenticatedusers" WHERE "instanceurl" = $1 and "salesforceid"=$2',
      [conn.instanceUrl, userInfo.id])
    //if (result && result.rows.length == 0) {
      req.session.userid=await db.insertUser({
        email:user.Email,
        firstname:user.FirstName,
        lastname:user.LastName,
        accesstoken:conn.accessToken,
        refreshtoken:conn.refreshToken,
        instanceurl:conn.instanceUrl,
        salesforceid:userInfo.id,
        organizationid:userInfo.organizationId,
        authorizationcode:code,
		accesstokennew:''
      }) 
      await db.query('COMMIT')
      console.log('The inserted detail in SFDC:'+req.session.userid);
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
    if( req.session.redirect_uri){
      res.redirect(req.session.redirect_uri+'?code='+code+"&state="+req.session.state)
    }else
      res.redirect('/');
    ///res.send(JSON.stringify(Object.assign(userInfo,user,{session:req.session}, { rows: (!result ? result : result.rows) })))
  } catch (e) {
    await db.query('ROLLBACK')
    console.log(e.message)
    res.send(JSON.stringify(e))
  } 
});

//var app=dialogflow({clientId: '*.apps.googleusercontent.com'});
/*
app.intent('Default Welcome Intent', (conv) => {
    console.log('welcomeIntent');
	console.log('conv.user',conv.user);
	//console.log('conv.user.id',conv.user.id);
	console.log('conv.user.profile.payload.email',conv.user.profile.payload.email);
   // conv.ask(new SignIn('To get your account details'));
});*/
// Create a Dialogflow intent with the `actions_intent_SIGN_IN` event
app.intent('Get Sign In', (conv, params, signin) => {
    console.log('signIn');
    if (signin.status === 'OK') {
        console.log('userId', conv.user.raw.userId);
		console.log('conv.user.raw.accessToken', conv.user.raw.accessToken);
	    console.log('user det', conv.user.raw);

		conv.ask(new SimpleResponse({speech:"Hi Sagnik ! We are able to connect to your account. How can I help you today?",text:"Hi Sagnik ! We are able to connect to your account. How can I help you today?"}));
        //conv.ask(`I got your account details. your userId is ${conv.user.raw.userId}. What do you want to do next?`);
    } else {
        console.log('not signed in');
        //conv.ask('I won't be able to save your data, but what do you want to do next?');
		conv.ask(new SimpleResponse({speech:"Error while connecting to salesforce",text:"Error while connecting to salesforce"}));
    }
});

var signIN = new Promise((resolve,reject)=>{
	conn.login(process.env.username, process.env.pass, function(err, res){
		if(err){
			reject(err);
		}
		else{
			resolve(res);
		}
	});
});

var EstablishConnection=  function (accesstoken,callback)
{
	

	pool.connect(function (err, client, done) {
        if (err) {
           console.log("Can not connect to the DB" + err);
		   //reject(err);
       }
       client.query('SELECT * FROM public."googleauthenticatedusers" WHERE "accesstoken" = $1 or "accesstokennew" =$2',[accesstoken,accesstoken], function (err, result) {
            done();
            if (err) {
                console.log('The error ret google user id:'+err);
				//reject(err);
                //res.status(400).send(err);
            }
			else
			{
            console.log('The value here then google user id-->'+JSON.stringify(result.rows));
			
			 if(result.rows[0].accesstokennew=='')
           {
	var conn = new jsforce.Connection({
	    oauth2 : {
		clientId : '3MVG9YDQS5WtC11qk.ArHtRRClgxBVv6.UbLdC7H6Upq8xs2G1EepruAJuuuogDIdevglKadHRNQDhITAnhif',
		clientSecret :'4635706799290406853'
	     },
	  instanceUrl : result.rows[0].instanceurl,
	  accessToken :result.rows[0].accesstoken ,
	  refreshToken : result.rows[0].refreshtoken
	});
	conn.on("refresh", function(accessToken, res) {
	  // Refresh event will be fired when renewed access token
	  // to store it in your storage for next request
	   console.log('Salesforce accessToken a/c creation:' + accessToken);
       console.log('Salesforce res access a/c creation :' + JSON.stringify(res));
	  	pool.connect(function (err, client, done) {
        if (err) {
           console.log("Can not connect to the DB a/c creation" + err);
		   //return err;
		   //reject(err);
       }
       client.query('Update public."googleauthenticatedusers" set "accesstokennew" = ($1) WHERE "accesstoken" =($2)',[accessToken,result.rows[0].accesstoken], function (err, result) {
            done();
            if (err) {
                console.log('The error ret data a/c creation:'+err);
				//return err;
				//reject(err);
                //res.status(400).send(err);
            }
			else
			{
            console.log('The value here after updating renewed access token a/c creation-->'+JSON.stringify(result));
			 //resolve(conn);
			}
       })
     })
	});
	callback(conn); 
 
		
		
 }
 else if(result.rows[0].accesstokennew!='')
 {
	 console.log('here we go');
	 var conn = new jsforce.Connection({
	    oauth2 : {
		clientId : '3MVG9YDQS5WtC11qk.ArHtRRClgxBVv6.UbLdC7H6Upq8xs2G1EepruAJuuuogDIdevglKadHRNQDhITAnhif',
		clientSecret : '4635706799290406853'
	     },
	  instanceUrl : result.rows[0].instanceurl,
	  accessToken :result.rows[0].accesstokennew ,
	  refreshToken : result.rows[0].refreshtoken
	});
	conn.on("refresh", function(accessToken, res) {
	  // Refresh event will be fired when renewed access token
	  // to store it in your storage for next request
	   console.log('Salesforce accessToken line 338 :' + accessToken);
       console.log('Salesforce res line 339:' + JSON.stringify(res));
	  	pool.connect(function (err, client, done) {
        if (err) {
           console.log("Can not connect to the DB line 342" + err);
		   //return err;
		   //reject(err);
       }
       client.query('Update public."googleauthenticatedusers" set "accesstokennew" = ($1) WHERE "accesstokennew" =($2)',[accessToken,result.rows[0].accesstokennew], function (err, result) {
            done();
            if (err) {
                console.log('The error ret data line 349:'+err);
				//return err;
				//reject(err);
                //res.status(400).send(err);
            }
			else
			{
            console.log('The value here after updating renewed access token line 356-->'+JSON.stringify(result));
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

var accountCreation1=  function (acctName,conn){
	
	   conn.sobject("Account").create({ Name : acctName}, function(error, ret) {
					  if (error || !ret.success) { 	
						   console.log('err linr 364'+error);
                      				  
						  //reject(error); 
						  return error;
					  }
					  else{		 
						 console.log('created record id is line 369-->'+ret.id);
						 //resolve(ret);
						 return ret;
					  }
			 
				});
}


var accountCreation=  function (acctName,accesstoken){
	console.log('acctName here-->'+acctName);
	//return EstablishConnection(accesstoken);
	return new Promise((resolve,reject)=>{

       console.log('Call came here');
	   
	 	return EstablishConnection(accesstoken).sobject("Account").create({ Name : acctName}, function(error, ret) {
					  if (error || !ret.success) { 	
						   console.log('err linr 364'+error);
                      				  
						  reject(error); 
					  }
					  else{		 
						 console.log('created record id is line 369-->'+ret.id);
						 resolve(ret);
					  }
			 
				});
	});
}
/*

var dbconnect=function (param){
	return new Promise((resolve,reject)=>{
		console.log('param is -->',param);
		//const result = db.query('SELECT * FROM IdentityProviders')
	   pool.connect(function (err, client, done) {
        if (err) {
           console.log("Can not connect to the DB" + err);
		   reject(err);
       }
       client.query('SELECT * FROM public."googleauthenticatedusers" WHERE "userid" ='+param, function (err, result) {
            done();
            if (err) {
                console.log('The error ret data:'+err);
				reject(err);
                //res.status(400).send(err);
            }
			else
			{
            console.log('The value here then-->'+JSON.stringify(result.rows));
			 resolve(result.rows);
			}
       })
     })
	});
}*/

var dbconnectgoogleuserid=function (param){
	
	return new Promise((resolve,reject)=>{
		console.log('param is -->',param);

		//const result = db.query('SELECT * FROM IdentityProviders')
	   pool.connect(function (err, client, done) {
        if (err) {
           console.log("Can not connect to the DB" + err);
		   reject(err);
       }
       client.query('SELECT * FROM public."googleauthenticatedusers" WHERE "googleid"=$1',[param], function (err, result) {
            done();
            if (err) {
                console.log('The error ret google user id:'+err);
				reject(err);
                //res.status(400).send(err);
            }
			else
			{
            console.log('The value here then google user id-->'+JSON.stringify(result.rows));
			 resolve(result.rows);
			}
       })
     })
	});

}

var dbconnectupdate=function (googlevalpassed,herokutableid){
	return new Promise((resolve,reject)=>{
		console.log('googleid is -->',googlevalpassed);
		console.log('herokutableid is -->',herokutableid);
		//const result = db.query('SELECT * FROM IdentityProviders')
	   pool.connect(function (err, client, done) {
        if (err) {
           console.log("Can not connect to the DB" + err);
		   reject(err);
       }
       client.query('Update public."googleauthenticatedusers" set "googleid" = ($1) WHERE "userid" =($2)',[googlevalpassed,herokutableid], function (err, result) {
            done();
            if (err) {
                console.log('The error ret data:'+err);
				reject(err);
                //res.status(400).send(err);
            }
			else
			{
            console.log('The value here then update-->'+JSON.stringify(result));
			 resolve(result);
			}
       })
     })
	});
}

var updateAccInf = function (acctName,accFields,accFieldVals){
	return new Promise((resolve,reject)=>{
		
		console.log('Account Name in update function is -->',acctName);
		console.log('Account Fields is -->',accFields);
		
		conn.login(process.env.username, process.env.pass, function(err, res){
			if(err){
				reject(err);
			}
			else{
				console.log('conn.accessToken:'+conn.accessToken);
				var header='Bearer '+conn.accessToken;
				var options = { Authorization: header};
			
				
				conn.apex.get("/updateAccInf/?acctName="+acctName+"&accFields="+accFields+"&accFieldVals="+accFieldVals,options,function(err, res) {
					if (err){
						reject(err); 
					}
					else{
						resolve(res);
					}
				});
			}
		});
	});
}




var getMandFields = function(objectName){
	return new Promise((resolve,reject)=>{
		console.log('objectName in generic record creation '+objectName);
		conn.login(process.env.username, process.env.pass, function(err, res){
			if(err){
				reject(err);
				console.log(err);
			}
			else{
				console.log('conn.accessToken:'+conn.accessToken);
				var header='Bearer '+conn.accessToken;
				var options = { Authorization: header};
			
				
				conn.apex.get("/getMandFields/?objectName="+objectName,options,function(err, res) {
					if (err){
						reject(err); 
					}
					else{
						console.log("response: ", res);
						resolve(res);
					}
				});
			}
		});
	});
}

var accountSubmitForApproval = function (actname){
	return new Promise((resolve,reject)=>{
		console.log('actname -->',actname);

		conn.login(process.env.username, process.env.pass, function(err, res){
			if(err){
				reject(err);
			}
			else{
				console.log('conn.accessToken:'+conn.accessToken);
				var header='Bearer '+conn.accessToken;
				var options = { Authorization: header};
				conn.apex.get("/accSubmitForApproval/"+actname,options,function(err, res){
					if (err){
						reject(err);
					}
					else{
						resolve(res);
					}	
				});
            }
		});
	});
}

/*var getCrudInfo = function(objectName,profileName){
	return new Promise((resolve,reject)=>{
		conn.login(process.env.username, process.env.pass, (err, res)=>{
			if(err){reject(err);}
			else{ 
				console.log('conn.accessToken:'+conn.accessToken);
				var header='Bearer '+conn.accessToken;
				var options = { Authorization: header};
				
				conn.apex.get("/crudINFO?objectName="+objectName+"&profileName="+profileName,options,function(err, res){
					
                    if (err) {
                        reject(err);
                    }
                    else{
                        resolve(res);
                    }
                });
			
            }
		});
	});
}*/

var getCrudInfo = function(objectName,profileName,accesstoken){
	console.log('accesstoken line 595--->'+accesstoken);
	return new Promise((resolve,reject)=>{
	   pool.connect(function (err, client, done) {
        if (err) {
           console.log("Can not connect to the DB" + err);
		   reject(err);
       }
	   
	   client.query('SELECT * FROM public."googleauthenticatedusers" WHERE "accesstoken" = $1 or "accesstokennew" =$2',[accesstoken,accesstoken], function (err, result) {
            done();
            if (err) {
                console.log('The error ret google user id:'+err);
				reject(err);
                //res.status(400).send(err);
            }
			else
			{
	console.log('The value here then google user id line 612-->'+JSON.stringify(result));
            console.log('The value here then google user id-->'+JSON.stringify(result.rows));
			
			 if(result.rows[0].accesstokennew=='')
           {
	var conn = new jsforce.Connection({
	    oauth2 : {
		clientId : '3MVG9YDQS5WtC11qk.ArHtRRClgxBVv6.UbLdC7H6Upq8xs2G1EepruAJuuuogDIdevglKadHRNQDhITAnhif',
		clientSecret :'4635706799290406853'
	     },
	  instanceUrl : result.rows[0].instanceurl,
	  accessToken :result.rows[0].accesstoken ,
	  refreshToken : result.rows[0].refreshtoken
	});
	conn.on("refresh", function(accessToken, res) {
	  // Refresh event will be fired when renewed access token
	  // to store it in your storage for next request
	   console.log('Salesforce accessToken a/c creation:' + accessToken);
       console.log('Salesforce res access a/c creation :' + JSON.stringify(res));
	  	pool.connect(function (err, client, done) {
        if (err) {
           console.log("Can not connect to the DB a/c creation" + err);
		   //return err;
		   reject(err);
       }
       client.query('Update public."googleauthenticatedusers" set "accesstokennew" = ($1) WHERE "accesstoken" =($2)',[accessToken,result.rows[0].accesstoken], function (err, result) {
            done();
            if (err) {
                console.log('The error ret data a/c creation:'+err);
				//return err;
				reject(err);
                //res.status(400).send(err);
            }
			else
			{
            console.log('The value here after updating renewed access token a/c creation-->'+JSON.stringify(result));
			 //resolve(result);
			}
       })
     })
	});
        var header='Bearer '+accesstoken;
		var options = { Authorization: header};
		var records = [];
		var nameSpace = '';
		var nameSpace1 = '';
		conn.query("SELECT NamespacePrefix FROM Organization", function(err, result) {
		  if (err) { 
		  return console.error(err); 
		  }
		  //console.log("total : " + result.totalSize);
		  //console.log("fetched : " + JSON.stringify(result.records));
           else{
			var restURL = "/crudINFO?objectName="+objectName+"&profileName="+profileName;
		  //if (nameSpace1) {
		    //restURL = "/" + namespace1 + restURL;
		  //}
		  restURL =(result.records[0].NamespacePrefix!=null)?("/" + result.records[0].NamespacePrefix + restURL):(restURL);
		  console.log('nameSpace1 -- Line 748 --> ' + restURL);
		  	conn.apex.get(restURL,options,function(err, res)
			{
                    if (err) {
                        reject(err);
                    }
                    else{
                        resolve(res);
                    }
                });
		   }



		});
	
 }
 else if(result.rows[0].accesstokennew!='')
 {
	 console.log('here we go');
	 var conn = new jsforce.Connection({
	    oauth2 : {
		clientId : '3MVG9YDQS5WtC11qk.ArHtRRClgxBVv6.UbLdC7H6Upq8xs2G1EepruAJuuuogDIdevglKadHRNQDhITAnhif',
		clientSecret : '4635706799290406853'
	     },
	  instanceUrl : result.rows[0].instanceurl,
	  accessToken :result.rows[0].accesstokennew ,
	  refreshToken : result.rows[0].refreshtoken
	});
	conn.on("refresh", function(accessToken, res) {
	  // Refresh event will be fired when renewed access token
	  // to store it in your storage for next request
	   console.log('Salesforce accessToken line 681 :' + accessToken);
       console.log('Salesforce res line 682:' + JSON.stringify(res));
	  	pool.connect(function (err, client, done) {
        if (err) {
           console.log("Can not connect to the DB line 685" + err);
		   //return err;
		   reject(err);
       }
       client.query('Update public."googleauthenticatedusers" set "accesstokennew" = ($1) WHERE "accesstokennew" =($2)',[accessToken,result.rows[0].accesstokennew], function (err, result) {
            done();
            if (err) {
                console.log('The error ret data line 692:'+err);
				//return err;
				reject(err);
                //res.status(400).send(err);
            }
			else
			{
            console.log('The value here after updating renewed access token line 356-->'+JSON.stringify(result));
			 //resolve(result);
			}
       })
     })
	});
	
	var header='Bearer '+accesstoken;
		var options = { Authorization: header};
		
		var records = [];
		var nameSpace = '';
		var nameSpace1 = '';
		conn.query("SELECT NamespacePrefix FROM Organization", function(err, result) {
		  if (err) { 
		  return console.error(err); 
		  }
		  //console.log("total : " + result.totalSize);
		  //console.log("fetched : " + JSON.stringify(result.records));

          else
		  {
		   console.log('nameSpace1 -- Line 740 --> ' + result.records[0].NamespacePrefix);
		   //nameSpace = JSON.parse(JSON.stringify(result.records));
		   //nameSpace1 = JSON.parse(JSON.stringify(result.records)).NamespacePrefix;
		  var restURL = "/crudINFO?objectName="+objectName+"&profileName="+profileName;
		  //if (nameSpace1) {
		    //restURL = "/" + namespace1 + restURL;
		  //}
		  restURL =(result.records[0].NamespacePrefix!=null)?("/" + result.records[0].NamespacePrefix + restURL):(restURL);
		  console.log('nameSpace1 -- Line 748 --> ' + restURL);
		  	conn.apex.get(restURL,options,function(err, res)
			{
					
                    if (err) {
                        reject(err);
                    }
                    else{
                        resolve(res);
                    }
                });
		  
		  }
		 

		});

 }
			 //resolve(result.rows);
			}
       })
	});
});
}

var permSetAsgnmentCheck = function(permSetName,userName,accesstoken){
	console.log('accesstoken line 595--->'+accesstoken);
	return new Promise((resolve,reject)=>{
	   pool.connect(function (err, client, done) {
        if (err) {
           console.log("Can not connect to the DB" + err);
		   reject(err);
       }
	   
	   client.query('SELECT * FROM public."googleauthenticatedusers" WHERE "accesstoken" = $1 or "accesstokennew" =$2',[accesstoken,accesstoken], function (err, result) {
            done();
            if (err) {
                console.log('The error ret google user id:'+err);
				reject(err);
                //res.status(400).send(err);
            }
			else
			{
	console.log('The value here then google user id line 612-->'+JSON.stringify(result));
            console.log('The value here then google user id-->'+JSON.stringify(result.rows));
			
			 if(result.rows[0].accesstokennew=='')
           {
	var conn = new jsforce.Connection({
	    oauth2 : {
		clientId : '3MVG9YDQS5WtC11qk.ArHtRRClgxBVv6.UbLdC7H6Upq8xs2G1EepruAJuuuogDIdevglKadHRNQDhITAnhif',
		clientSecret :'4635706799290406853'
	     },
	  instanceUrl : result.rows[0].instanceurl,
	  accessToken :result.rows[0].accesstoken ,
	  refreshToken : result.rows[0].refreshtoken
	});
	conn.on("refresh", function(accessToken, res) {
	  // Refresh event will be fired when renewed access token
	  // to store it in your storage for next request
	   console.log('Salesforce accessToken a/c creation:' + accessToken);
       console.log('Salesforce res access a/c creation :' + JSON.stringify(res));
	  	pool.connect(function (err, client, done) {
        if (err) {
           console.log("Can not connect to the DB a/c creation" + err);
		   //return err;
		   reject(err);
       }
       client.query('Update public."googleauthenticatedusers" set "accesstokennew" = ($1) WHERE "accesstoken" =($2)',[accessToken,result.rows[0].accesstoken], function (err, result) {
            done();
            if (err) {
                console.log('The error ret data a/c creation:'+err);
				//return err;
				reject(err);
                //res.status(400).send(err);
            }
			else
			{
            console.log('The value here after updating renewed access token a/c creation-->'+JSON.stringify(result));
			 //resolve(result);
			}
       })
     })
	});
        var header='Bearer '+accesstoken;
		var options = { Authorization: header};
		var records = [];
		var nameSpace = '';
		var nameSpace1 = '';
		conn.query("SELECT NamespacePrefix FROM Organization", function(err, result) {
		  if (err) { 
		  return console.error(err); 
		  }
		  //console.log("total : " + result.totalSize);
		  //console.log("fetched : " + JSON.stringify(result.records));
           else{
			console.log('nameSpace1 -- Line 665.1 --> ' + result.records[0].NamespacePrefix);
		   //nameSpace = JSON.parse(JSON.stringify(result.records));
		   //nameSpace1 = JSON.parse(JSON.stringify(result.records)).NamespacePrefix;
		  var restURL = "/checkPermSetAssignment?permSetName="+permSetName+"&userName="+userName;
		  //if (nameSpace1) {
		    //restURL = "/" + namespace1 + restURL;
		  //}
		  restURL =(result.records[0].NamespacePrefix!=null)?("/" + result.records[0].NamespacePrefix + restURL):(restURL);
		  console.log('nameSpace1 -- Line 665 --> ' + nameSpace1);
		  	conn.apex.get(restURL,options,function(err, res)
			{
                    if (err) {
                        reject(err);
                    }
                    else{
                        resolve(res);
                    }
                });
		   }



		});
	
 }
 else if(result.rows[0].accesstokennew!='')
 {
	 console.log('here we go');
	 var conn = new jsforce.Connection({
	    oauth2 : {
		clientId : '3MVG9YDQS5WtC11qk.ArHtRRClgxBVv6.UbLdC7H6Upq8xs2G1EepruAJuuuogDIdevglKadHRNQDhITAnhif',
		clientSecret : '4635706799290406853'
	     },
	  instanceUrl : result.rows[0].instanceurl,
	  accessToken :result.rows[0].accesstokennew ,
	  refreshToken : result.rows[0].refreshtoken
	});
	conn.on("refresh", function(accessToken, res) {
	  // Refresh event will be fired when renewed access token
	  // to store it in your storage for next request
	   console.log('Salesforce accessToken line 681 :' + accessToken);
       console.log('Salesforce res line 682:' + JSON.stringify(res));
	  	pool.connect(function (err, client, done) {
        if (err) {
           console.log("Can not connect to the DB line 685" + err);
		   //return err;
		   reject(err);
       }
       client.query('Update public."googleauthenticatedusers" set "accesstokennew" = ($1) WHERE "accesstokennew" =($2)',[accessToken,result.rows[0].accesstokennew], function (err, result) {
            done();
            if (err) {
                console.log('The error ret data line 692:'+err);
				//return err;
				reject(err);
                //res.status(400).send(err);
            }
			else
			{
            console.log('The value here after updating renewed access token line 356-->'+JSON.stringify(result));
			 //resolve(result);
			}
       })
     })
	});
	
	var header='Bearer '+accesstoken;
		var options = { Authorization: header};
		
		var records = [];
		var nameSpace = '';
		var nameSpace1 = '';
		conn.query("SELECT NamespacePrefix FROM Organization", function(err, result) {
		  if (err) { 
		  return console.error(err); 
		  }
		  //console.log("total : " + result.totalSize);
		  //console.log("fetched : " + JSON.stringify(result.records));

          else
		  {
		   console.log('nameSpace1 -- Line 665.1 --> ' + result.records[0].NamespacePrefix);
		   //nameSpace = JSON.parse(JSON.stringify(result.records));
		   //nameSpace1 = JSON.parse(JSON.stringify(result.records)).NamespacePrefix;
		  var restURL = "/checkPermSetAssignment?permSetName="+permSetName+"&userName="+userName;
		  //if (nameSpace1) {
		    //restURL = "/" + namespace1 + restURL;
		  //}
		  restURL =(result.records[0].NamespacePrefix!=null)?("/" + result.records[0].NamespacePrefix + restURL):(restURL);
		  console.log('nameSpace1 -- Line 665 --> ' + nameSpace1);
		  	conn.apex.get(restURL,options,function(err, res)
			{
					
                    if (err) {
                        reject(err);
                    }
                    else{
                        resolve(res);
                    }
                });
		  
		  }
		 

		});

 }
			 //resolve(result.rows);
			}
       })
	});
});
}

var assignPermSet = function(permSetName,userName){
	return new Promise((resolve,reject)=>{
		conn.login(process.env.username, process.env.pass, (err, res)=>{
			if(err){reject(err);}
			else{ 
				var header='Bearer '+conn.accessToken;
				var options = { Authorization: header};
				
				conn.apex.get("/assignPermSet?permSetName="+permSetName+"&userName="+userName,options,function(err, res){
					
                    if (err) {
                        reject(err);
                    }
                    else{
                        resolve(res);
                    }
                });
			
            }
		});
	});
}

var executeBatchWithSize = function(batchClassName,batchSize){
	return new Promise((resolve,reject)=>{
		conn.login(process.env.username, process.env.pass, (err, res)=>{
			if(err){reject(err);}
			else{ 
				var header='Bearer '+conn.accessToken;
				var options = { Authorization: header};
				
				conn.apex.get("/runBatchJob?batchClassName="+batchClassName+"&batchSize="+batchSize,options,function(err, res){
					
                    if (err) {
                        reject(err);
                    }
                    else{
                        resolve(res);
                    }
                });
			
            }
		});
	});
}

var checkBatchStatus = function(batchClassName){
	return new Promise((resolve,reject)=>{
		conn.login(process.env.username, process.env.pass, (err, res)=>{
			if(err){reject(err);}
			else{ 
				var header='Bearer '+conn.accessToken;
				var options = { Authorization: header};
				
				conn.apex.get("/BatchJobStatus?batchClassName="+batchClassName,options,function(err, res){
					
                    if (err) {
                        reject(err);
                    }
                    else{
                        resolve(res);
                    }
                });
			
            }
		});
	});
}

var updateLabel = function(labelVal,labelName){
	return new Promise((resolve,reject)=>{
		conn.login(process.env.username, process.env.pass, (err, res)=>{
			if(err){
				reject(err);
			}
			else{ 
				var header='Bearer '+conn.accessToken;
				var options = { Authorization: header};
				
				conn.apex.get("/UpdateCustomLabel?labelName="+labelName+"&labelVal="+labelVal,options,function(err, res){
					
                    if (err) {
                        reject(err);
                    }
                    else{
                        resolve(res);
                    }
                });
            }
		});
	});
}

var updObjInf = function(objectName,fieldNames,fieldValues){
	return new Promise((resolve,reject)=>{
		conn.login(process.env.username, process.env.pass, (err, res)=>{
			if(err){
				reject(err);
			}
			else{ 
				var header='Bearer '+conn.accessToken;
				var options = { Authorization: header};
				
				conn.apex.get("/insertGenericRecSrvc?objectName="+objectName+"&fieldNames="+fieldNames+"&fieldValues="+fieldValues,options,function(err, res){
					
                    if (err) {
                        reject(err);
                    }
                    else{
                        resolve(res);
                    }
                });
            }
		});
	});
}


/*
app.intent('connect_salesforce',(conv,params)=>{
    
	signIN.then((resp)=>{
		console.log(resp);
		conv.ask(new SimpleResponse({speech:"Hi Sagnik ! We are able to connect to your account. How can I help you today?",text:"Hi Sagnik ! We are able to connect to your account. How can I help you today?"}));	
	},
	(error) => {
		console.log('Promise rejected.');
		console.log(error.message);
		conv.ask(new SimpleResponse({speech:"Error while connecting to salesforce",text:"Error while connecting to salesforce"}));


	});
});*/
/*
var jsforcesignin = function(accesstoken,refreshtoken,instanceurl){
		return new Promise((resolve,reject)=>{
		var conn = new jsforce.Connection({
	    oauth2 : {
		clientId : process.env.clientId,
		clientSecret : process.env.clientSecret,
		redirectUri : 'https://node-js-google-sfdc-app.herokuapp.com/token'
	  },
	  instanceUrl : instanceurl,
	  accessToken :accesstoken ,
	  refreshToken : refreshtoken
	});
	conn.on("refresh", function(accessToken, res) {
	  // Refresh event will be fired when renewed access token
	  // to store it in your storage for next request
	});

	// Alternatively, you can use the callback style request to fetch the refresh token
	conn.oauth2.refreshToken(refreshToken, (err, results) => {
	  if (err) return reject(err);
	  resolve(results);
	});
		});
}*/


app.intent('connect_salesforce',async(conv,params)=>{
    
 var result = await db.query('SELECT * FROM public."googleauthenticatedusers" WHERE "accesstoken" = $1 or "accesstokennew" =$2',[conv.user.access.token,conv.user.access.token]);
 console.log('New Access Token:'+result.rows[0].accesstokennew);
 if(result.rows[0].accesstokennew=='')
 {
	var conn = new jsforce.Connection({
	    oauth2 : {
		clientId : '3MVG9YDQS5WtC11qk.ArHtRRClgxBVv6.UbLdC7H6Upq8xs2G1EepruAJuuuogDIdevglKadHRNQDhITAnhif',
		clientSecret :'4635706799290406853'
	     },
	  instanceUrl : result.rows[0].instanceurl,
	  accessToken :result.rows[0].accesstoken ,
	  refreshToken : result.rows[0].refreshtoken
	});
	conn.on("refresh", function(accessToken, res) {
	  // Refresh event will be fired when renewed access token
	  // to store it in your storage for next request
	   console.log('Salesforce accessToken :' + accessToken);
       console.log('Salesforce res :' + JSON.stringify(res));
	  	pool.connect(function (err, client, done) {
        if (err) {
           console.log("Can not connect to the DB" + err);
		   return err;
		   //reject(err);
       }
       client.query('Update public."googleauthenticatedusers" set "accesstokennew" = ($1) WHERE "accesstoken" =($2)',[accessToken,result.rows[0].accesstoken], function (err, result) {
            done();
            if (err) {
                console.log('The error ret data:'+err);
				return err;
				//reject(err);
                //res.status(400).send(err);
            }
			else
			{
            console.log('The value here after updating renewed access token-->'+JSON.stringify(result));
			 //resolve(result);
			}
       })
     })
	});
	/*
 	conn.sobject("Account").create({ Name : 'testnow31jan' }, function(error, ret) {
					  if (error || !ret.success) { 	
                       return error;					  
						  //reject(error); 
					  }
					  else{		 
						 console.log('created record id is-->'+ret.id);
						 //resolve(ret);
					  }
			 
				});*/
		
		
 }
 else if(result.rows[0].accesstokennew!='')
 {
	 var conn = new jsforce.Connection({
	    oauth2 : {
		clientId : process.env.clientId,
		clientSecret : process.env.clientSecret
	     },
	  instanceUrl : result.rows[0].instanceurl,
	  accessToken :result.rows[0].accesstokennew ,
	  refreshToken : result.rows[0].refreshtoken
	});
	conn.on("refresh", function(accessToken, res) {
	  // Refresh event will be fired when renewed access token
	  // to store it in your storage for next request
	   console.log('Salesforce accessToken :' + accessToken);
       console.log('Salesforce res :' + JSON.stringify(res));
	  	pool.connect(function (err, client, done) {
        if (err) {
           console.log("Can not connect to the DB" + err);
		   return err;
		   //reject(err);
       }
       client.query('Update public."googleauthenticatedusers" set "accesstokennew" = ($1) WHERE "accesstokennew" =($2)',[accessToken,result.rows[0].accesstokennew], function (err, result) {
            done();
            if (err) {
                console.log('The error ret data:'+err);
				return err;
				//reject(err);
                //res.status(400).send(err);
            }
			else
			{
            console.log('The value here after updating renewed access token line 740-->'+JSON.stringify(result));
			 //resolve(result);
			}
       })
     })
	});
		/*conn.sobject("Account").create({ Name : 'testnow31jan' }, function(error, ret) {
					  if (error || !ret.success) { 	
                       return error;					  
						  //reject(error); 
					  }
					  else{		 
						 console.log('created record id is-->'+ret.id);
						 //resolve(ret);
					  }
			 
				});*/
	 
 }
 
 
 conv.ask(new SimpleResponse({speech:"Hello We are able to connect to your account. How can I help you today?",text:"Hello We are able to connect to your account. How can I help you today?"}));
 
});


app.intent('Default Welcome Intent',async(conv) => {
	//googleuserid=conv.user.raw.userId;

	console.log('Google user id:'+conv.user.raw.userId);
	 console.log('welcomeIntent line new');
	console.log('conv.user',conv.user);
		if(conv.user.access.token){
	 var result = await db.query('SELECT * FROM public."googleauthenticatedusers" WHERE "accesstoken" = $1',[conv.user.access.token]);
	console.log(JSON.stringify(result.rows[0]))
	if(result.rows[0].instanceurl)
	{
		console.log('Instance Url:'+ result.rows[0].instanceurl);
	}
	   conv.ask(new SimpleResponse({speech:"Hello, this is your friendly salesforce bot.I can help you with some basic salesforce functionalities.What can I do for you today?",text:"Hello, this is your friendly salesforce bot.I can help you with some basic salesforce functionalities.What can I do for you today?"}));
	}

});

/*app.intent('create account',(conv,params)=>{
	//var conn=EstablishConnection(conv.user.access.token);
	return new Promise((resolve,reject)=>
	{
	EstablishConnection(conv.user.access.token,function(response){ 
console.log('Val fetched-->'+response);
	//console.log('Val fetched JSON-->'+JSON.stringify(response));
	  response.sobject("Account").create({ Name : params.AccountName}, function(error, ret) {
					  if (error || !ret.success) { 	
						   console.log('err linr 364'+error);
                      	conv.ask(new SimpleResponse({speech:"Error while creating salesforce account",text:"Error while creating salesforce account"}));	  
						  reject(error); 
						  //return error;
					  }
					  else{		 
						 console.log('created record id is line 369-->'+ret.id);
						 conv.ask(new SimpleResponse({speech:"We are able to create your account named "+params.AccountName,text:"We are able to create your account named "+params.AccountName}));
		                 conv.ask(new Suggestions('update account details'));
						 resolve(ret);
						 //return ret;
						 
					  }
			 
				});
});

});
	
});*/


app.intent('update acc info',(conv,params)=>{
	const accName = conv.contexts.get('createaccount-followup').parameters['AccountName'];
	console.log(accName);
	return updateAccInf(accName,params.accFieldsToUpd,params.accFieldValues).then((resp)=>{
		conv.ask(new SimpleResponse({speech:"Account Information Updated.",text:"Account Information Updated."}));
		conv.ask(new Suggestions('Submit for approval'));
	})
	.catch((err)=>{
		conv.ask(new SimpleResponse({speech:"Error while updating",text:"Error while updating"}));
	});	
});

app.intent('Submit for Approval - account',(conv,params)=>{
	const accName = conv.contexts.get('createaccount-followup').parameters['AccountName'];
	console.log('Account name in approval intent--> ' +accName);
	return accountSubmitForApproval(accName).then((resp)=>{
		conv.ask(new SimpleResponse({speech:"Account record has been submitted for approval succesfully.",text:"Account record has been submitted for approval succesfully."}));
	})
	.catch((err)=>{
		conv.ask(new SimpleResponse({speech:"Error in submitting for approval.",text:"Error in submitting for approval."}));
	});	
});

app.intent('Get CRUD permissions',(conv,{objectName,profileName})=>{
    
    console.log('sobject passed from google '+objectName);
	console.log('profile passed from google '+profileName);
	
	return getCrudInfo(objectName,profileName,conv.user.access.token).then((resp)=>{
           
		conv.ask(new SimpleResponse({speech:resp,text:resp}));
		
	})
	.catch((err)=>{
        console.log('error',err);
	    conv.ask(new SimpleResponse({speech:"Error while fetching CRUD info",text:"Error while fetching CRUD info"}));
	});	
});

app.intent('Check Permission Set Assignment',(conv,{permSetName,userName})=>{
    
    console.log('perm set passed from google '+permSetName);
	console.log('userName passed from google '+userName);
	
	return permSetAsgnmentCheck(permSetName,userName,conv.user.access.token).then((resp)=>{
           
		conv.ask(new SimpleResponse({speech:resp,text:resp}));
		
	})
	.catch((err)=>{
        console.log('error',err);
	    conv.ask(new SimpleResponse({speech:"Error while doing permission set assignment check",text:"Error while doing permission set assignment check"}));
	});	
});

app.intent('assignPermSet',(conv)=>{
	//console.log(conv.contexts.get('checkpermissionsetassignment-followup'));
	const prmSet = conv.contexts.get('checkpermissionsetassignment-followup').parameters['permSetName'];
	const uName = conv.contexts.get('checkpermissionsetassignment-followup').parameters['userName'];
	
	console.log('perm set passed from google in perm set followup'+prmSet);
	console.log('userName passed from google in perm set followup'+uName);
	return assignPermSet(prmSet,uName).then((resp)=>{
		conv.ask(new SimpleResponse({speech:"Sure. Permission set " + prmSet + " has been assigned to " + uName,text:"Sure. Permission set " + prmSet + " has been assigned to " + uName}));
	})
	.catch((err)=>{
		console.log('err-->'+err);
		conv.ask(new SimpleResponse({speech:"Error while assigning permission set",text:"Error while assigning permission set"}));
	});	
});

app.intent('BatchSize-Custom',(conv,params)=>{
		
	console.log('this should be triggered for custom batch size');
	
	const batchClassName = conv.contexts.get('runabatchjob-followup').parameters['batchClassName'];
	console.log(batchClassName);

	return executeBatchWithSize(batchClassName,params.batchSize).then((resp)=>{
		if(resp == 'Pass'){
			conv.ask(new SimpleResponse({speech:"Okay. Batch job for batch class named " + batchClassName + " and scope " + params.batchSize + " has been submitted for execution.",text:"Okay. Batch job for batch class named " + batchClassName + " and scope " + params.batchSize + " has been submitted for execution."}));
		}
		else{
			conv.ask(new SimpleResponse({speech:"There is no batch class with "+batchClassName,text:"There is no batch class " + batchClassName}));
		}
	})
	.catch((err)=>{
		console.log('err-->'+err);
		conv.ask(new SimpleResponse({speech:"Error while submitting batch job for execution",text:"Error while submitting batch job for execution"}));
	});	
});

app.intent('BatchSize-Default',(conv,params)=>{
	
	console.log('this should be triggered for default batch size');
		
	const batchClassName = conv.contexts.get('runabatchjob-followup').parameters['batchClassName'];

	return executeBatchWithSize(batchClassName,200).then((resp)=>{
		if(resp == 'Pass'){
			conv.ask(new SimpleResponse({speech:"Okay. Batch job for batch class named " + batchClassName + " with default size 200" + " has been submitted for execution.",text:"Okay. Batch job for batch class named " + batchClassName + " with default size 200" + " has been submitted for execution."}));
		}
		else{
			conv.ask(new SimpleResponse({speech:"There is no batch class with "+batchClassName,text:"There is no batch class " + batchClassName}));
		}
	})
	.catch((err)=>{a
		console.log('err-->'+err);
		conv.ask(new SimpleResponse({speech:"Error while submitting batch job for execution",text:"Error while submitting batch job for execution"}));
	});	
});


app.intent('Check Batch Job Status',(conv,params)=>{
	console.log(params.className);
	return checkBatchStatus(params.className).then((resp)=>{
		console.log('resp in check batch status intent handler-->' + resp);
		if(!resp.includes('There')){
			conv.ask(new SimpleResponse({speech:"Sure! Status of batch job for class named " + params.className + " is " + resp+".",text:"Sure! Status of batch job for class named " + params.className + " is " + resp + "."}));
		}
		else{
			conv.ask(new SimpleResponse({speech:"There are no batch jobs for class "+params.className+".",text:"There are no batch jobs for class "+params.className+"."}));
		}
	})
	.catch((err)=>{
		console.log('err-->'+err);
		conv.ask(new SimpleResponse({speech:"Error while checking job status",text:"Error while checking job status"}));
	});	
});

app.intent('Update Custom Label Value',(conv,{customLabelVal,customLabelName})=>{
    
    console.log('LabelName passed from google'+customLabelName);
	console.log('Value passed from google'+customLabelVal);
	
	return updateLabel(customLabelVal,customLabelName).then((resp)=>{
	   if(resp=='Custom label updated successfully'){
			conv.ask(new SimpleResponse({speech:"Custom Label named "+customLabelName+" updated successfully",text:"Custom Label named "+customLabelName+" updated successfully"}));
	   }
	   else{
			conv.ask(new SimpleResponse({speech:"Custom Label named "+customLabelName+" not found",text:"Custom Label named "+customLabelName+" not found"})); 
	   }
		
	})
	.catch((err)=>{
        console.log('error',err);
	    conv.ask(new SimpleResponse({speech:"Error while updating Custom Label",text:"Error while updating Custom Label"}));
	});	
});

app.intent('create a generic object record',(conv,params)=>{
    
    console.log('sobject label passed from google'+params.objectName);
	
	return new Promise((resolve,reject)=>{
		EstablishConnection(conv.user.access.token,function(response){ 
			var header = 'Bearer '+ conv.user.access.token;
			var options = { Authorization: header};
			response.apex.get("/getMandFields/?objectName="+params.objectName,options,function(err, resp) {
				if (err){
					conv.ask(new SimpleResponse({speech:"Error while creating generic record",text:"Error while creating generic record"}));
					reject(err); 
				}
				else{
					console.log("response: ", resp);
					if(resp.length == 1){
						conv.ask(new SimpleResponse({speech:"Hey, there is a mandatory field named" + resp[0] + " required for record creation." + " " + "Should you want to proceed with record creation" + " , " + "enter the values for " + resp[0] + " ." ,text:"Hey, there is a mandatory field named" + resp[0] + " required for record creation." + " " + "Should you want to proceed with record creation" + " , " + "enter the values for " + resp[0] + " ."}));
					}
					else{
			
						for (var i = 0; i < resp.length; i++) {
							strName += resp[i] + ',';
						}
						conv.ask(new SimpleResponse({speech:"Hey, there are mandatory fields required for record creation. They are " +resp+ " . " + " Should you want to proceed with record creation" + " , " + "enter the values for respective fields.",text:"Hey, there are mandatory fields required for record creation. They are " +resp+ " . " + " Should you want to proceed with record creation" + " , " + "enter the values for respective fields." }));
						
						
					}	
					resolve(resp);
				}
			});
		});
	});	
});


app.intent('update record information',(conv,params)=>{
    
	const objectName = conv.contexts.get('createagenericobjectrecord-followup').parameters['objectName'];
	console.log('objectName in update acc followup ' +objectName);
	
	return updObjInf(objectName,params.fieldNames,params.fieldValues).then((resp)=>{

		if(resp === 'Success'){
			conv.ask(new SimpleResponse({speech: objectName + " record has been created successfully.",text:objectName + " record has been created successfully."}));
		}
		else{
			conv.ask(new SimpleResponse({speech: "Error received while creating record . " + resp,text:"Error received while creating record . " + resp}));
		}
		
	})
	.catch((err)=>{
        console.log('error',err);
	    conv.ask(new SimpleResponse({speech:"Error while creating record",text:"Error while creating record"}));
	});	
});

var port = process.env.PORT || 3000;
//var port=3306;
//var arr = new Array();
 

server.get('/',(req,res)=>{
	//res.send('Hello World!');
	});
server.post('/fulfillment',app);



server.listen(port, function () {
	console.log('port',port);
	//logger.log(port);
    console.log("Server is up and running...");
});
