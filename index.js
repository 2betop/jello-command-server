/*
 * fis
 * http://fis.baidu.com/
 */

'use strict';

var server = require('./lib/server.js');

exports.name = 'server';
exports.usage = '<command> [options]';
exports.desc = 'launch a embeded tomcat server';

exports.register = function(commander) {

    // 默认 document root 路径
    var serverRoot = (function() {
        var key = 'FIS_SERVER_DOCUMENT_ROOT';
        var path;

        if (process.env && process.env[key]) {
            path = process.env[key];

            if (fis.util.exists(path) && !fis.util.isDir(path)) {
                fis.log.error('invalid environment variable [' + key + '] of document root [' + path + ']');
            }

            return path;
        } else {
            return fis.project.getTempPath('www');
        }
    })();

    // an filter for commander to obtain the input of document root from user.
    function getRoot(root) {

        if (fis.util.exists(root)) {
            if (!fis.util.isDir(root)) {
                fis.log.error('invalid document root');
            }
        } else {
            fis.util.mkdir(root);
        }

        return fis.util.realpath(root);
    }

    commander
        .option('-p, --port <int>', 'server listen port', parseInt, process.env.FIS_SERVER_PORT || 8080)
        .option('--root <path>', 'document root', getRoot, serverRoot)
        .option('--timeout <seconds>', 'start timeout', parseInt, 15)
        .option('--include <glob>', 'clean include filter', String)
        .option('--exclude <glob>', 'clean exclude filter', String)
        .action(function(){
            var args = Array.prototype.slice.call(arguments);
            var options = args.pop();
            var cmd = args.shift();

            var root = options.root;

            if(root){
                if(fis.util.exists(root) && !fis.util.isDir(root)){
                    fis.log.error('invalid document root [' + root + ']');
                } else {
                    fis.util.mkdir(root);
                }
            } else {
                fis.log.error('missing document root');
            }

            switch (cmd) {
                // todo
                default :
                    commander.help();
            }
        });


    // 注册 cmd
    commander
        .command('start')
        .description('start server');

    commander
        .command('stop')
        .description('shutdown server');

    commander
        .command('restart')
        .description('restart server');

    commander
        .command('info')
        .description('output server info');

    commander
        .command('open')
        .description('open document root directory');

    commander
        .command('clean')
        .description('clean files in document root');
};
