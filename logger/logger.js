var fileSystem=require('fs');

var Logger = exports.Logger = {};

var logupdated = fileSystem.createWriteStream('logs/log.txt',{flags:'a'});

Logger.log = function(msg) {
  console.log('Req came here');
  var message = new Date().toISOString() + " : " + msg + "\n";
  logupdated.write(message);
};
