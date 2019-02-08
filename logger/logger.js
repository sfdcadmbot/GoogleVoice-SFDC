/*var fileSystem=require('fs');

var Logger = exports.Logger = {};

//var logupdated = fileSystem.createWriteStream('logtesting.txt');

Logger.log = function(msg) {
  console.log('Req came here'+msg);
  var message = new Date().toISOString() + " : " + msg + "\n";
  console.log('message came here'+message);
  //fileSystem.writeFileSync(logupdated,message);
  fileSystem.writeFileSync('./logtesting.txt', message);
};*/


/**
 * Configurations of logger.
 */
const winston = require('winston');
const winstonRotator = require('winston-daily-rotate-file');

const consoleConfig = [
  new winston.transports.Console({
    'colorize': true
  })
];

const createLogger = new winston.Logger({
  'transports': consoleConfig
});

const successLogger = createLogger;
successLogger.add(winstonRotator, {
  'name': 'access-file',
  'level': 'info',
  'filename': './logs/access.log',
  'json': false,
  'datePattern': 'yyyy-MM-dd-',
  'prepend': true
});

const errorLogger = createLogger;
errorLogger.add(winstonRotator, {
  'name': 'error-file',
  'level': 'error',
  'filename': './logs/error.log',
  'json': false,
  'datePattern': 'yyyy-MM-dd-',
  'prepend': true
});

