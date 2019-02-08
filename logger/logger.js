var fs=require('fs');

var logger=function(msg){
    console.log(`Message came ${msg}`);
    fs.readdir('../',(err,files)=>{console.log('Directory Info-->',files);});
    fs.writeFile('logger.txt',`${new Date().toISOString()} :  ${msg} \n`,(err)=>{
            if(err){
                console.log('Error happened at logging-->',err);
            }
            else{
                console.log('Done');
            }
        });
    console.log('done');
}
module.exports.logger=logger;
