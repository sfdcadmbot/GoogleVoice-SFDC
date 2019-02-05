var fileSystem=require('fs');

var Logger = exports.Logger = {};

var logupdated = fileSystem.createWriteStream('logtesting.txt',{flags:'a'});

Logger.log = function(msg) {
  console.log('Req came here'+msg);
  var message = new Date().toISOString() + " : " + msg + "\n";
  console.log('message came here'+message);
  logupdated.writeFileSync(message);
};

