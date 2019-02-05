var fileSystem=require('fs');

var Logger = exports.Logger = {};

var logupdated = fileSystem.createWriteStream('https://github.com/sfdcadmbot/GoogleVoice-SFDC/blob/master/logs/log.txt',{flags:'a'});

Logger.log = function(msg) {
  var message = new Date().toISOString() + " : " + msg + "\n";
  logupdated.write(message);
};
