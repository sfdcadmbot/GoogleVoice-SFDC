var fileSystem=require('fs');

var Logger = exports.Logger = {};

//var logupdated = fileSystem.createWriteStream('logtesting.txt',{flags:'a'});

Logger.log = function(msg) {
  console.log('Req came here');
  var message = new Date().toISOString() + " : " + msg + "\n";
  
    fileSystem.appendFile('logtesting.txt',message, (err) => {
        //response.writeHead(200);
        //response.end();
    });
};

