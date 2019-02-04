var fileSystem=require('fs');
var path=require('path');
var folderName='https://github.com//sfdcadmbot//GoogleVoice-SFDC//tree//master//logs';
var fileName=new Date().getDate().toString()+'-'+(new Date().getMonth()+1).toString()+'-log.txt';
//var folderName = require(path.join(__dirname + '/logs'));
exports.log=(data)=>{
    var stream=fileSystem.createWriteStream(path.join(folderName,fileName),{flags:'a'});
    stream.write(new Date()+' '+data+'\r\n');
};
