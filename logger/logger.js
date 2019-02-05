var fileSystem=require('fs');

var Logger = exports.Logger = {};

//var logupdated = fileSystem.createWriteStream('logtesting.txt');

Logger.log = function(msg) {
  console.log('Req came here'+msg);
  var message = new Date().toISOString() + " : " + msg + "\n";
  console.log('message came here'+message);
  //fileSystem.writeFileSync(logupdated,message);
  fileSystem.writeFileSync('logtesting.txt', message, { mode: 0o755 });
};
