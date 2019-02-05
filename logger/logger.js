var fileSystem=require('fs');

var Logger = exports.Logger = {};

var logupdated = fileSystem.createWriteStream('logs/log.txt');

Logger.log = function(msg) {
  var message = new Date().toISOString() + " : " + msg + "\n";
  logupdated.write(message);
};
