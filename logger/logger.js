var fileSystem=require('fs');

var Logger = exports.Logger = {};

var log = fs.createWriteStream('logs/log.txt');

Logger.log = function(msg) {
  var message = new Date().toISOString() + " : " + msg + "\n";
  fileSystem.write(message);
};
