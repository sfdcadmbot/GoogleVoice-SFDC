var fs=require('fs');

var logger=function(msg){
    console.log(`Message came ${msg}`);
    fs.writeFileSync('logger.txt',`${new Date().toISOString()} :  ${msg} \n`);
    console.log('done');
}
module.exports.logger=logger;
