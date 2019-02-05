var fileSystem=require('fs');

var Logger = exports.Logger = {};

var logupdated = fileSystem.createWriteStream('/logs/log.txt',{flags:'a'});

Logger.log = function(msg) {
  console.log('Req came here');
  var message = new Date().toISOString() + " : " + msg + "\n";
  logupdated.write(message,function(err) {
    if(err) {
        console.log('Err here-->'+err);
    }

    console.log("The file was saved!");
});
};
