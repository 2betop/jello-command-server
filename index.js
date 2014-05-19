/*
 * fis
 * http://fis.baidu.com/
 */

'use strict';

var server = require('./server.js');

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

    //support glob: a**,b**,/usr**,/*/*
    function glob(str, prefix) {
        var globArr = str.split(',');
        var group = [];
        var s_reg;
        globArr.forEach(function(g) {
            if (g.length > 0) {
                s_reg = fis.util.glob(g).toString();
                //replace
                // '/^' => ''
                // '$/i' => ''
                s_reg = s_reg.substr(2, s_reg.length - 5);
                group.push(s_reg);
            }
        });
        prefix = prefix || '';
        if (prefix) {
            s_reg = fis.util.glob(prefix).toString();
            // '/^' => '', '%/i' => ''
            prefix = s_reg.substr(2, s_reg.length - 5);
        }
        return new RegExp('^'+ prefix + '(' + group.join('|') + ')$', 'i');
    }

    commander
        .option('-p, --port <int>', 'server listen port', parseInt, process.env.FIS_SERVER_PORT || 8080)
        .option('--root <path>', 'document root', getRoot, serverRoot)
        .option('--timeout <seconds>', 'start timeout', parseInt, 15)
        .option('--include <glob>', 'clean include filter', String)
        .option('--exclude <glob>', 'clean exclude filter', String)
        .option('--debug', 'debug mode')
        .action(function(){
            var args = Array.prototype.slice.call(arguments);
            var options = args.pop();
            var cmd = args.shift();
            var root = options.root;
            var opt;

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
                case 'restart':
                case 'start':
                    opt = {};
                    fis.util.map(options, function(key, value) {
                        if (typeof value !== 'object' && key[0] !== '_') {
                            opt[key] = value;
                        }
                    });

                    server.start(opt);

                    break;

                case 'stop':
                    server.stop();
                    break;

                case 'info':
                    server.info();
                    break;
                case 'open':
                    server.open();
                    break;
                case 'clean':
                    process.stdout.write(' δ '.bold.yellow);
                    var now = Date.now();
                    var user_include = fis.config.get('server.clean.include');
                    var user_exclude = fis.config.get('server.clean.exclude');
                    //flow: command => user => default
                    var include = options.include  ? glob(options.include, root) : (user_include ? glob(user_include, root) : null);
                    var exclude = options.exclude ? glob(options.exclude, root) : (user_exclude ? glob(user_exclude, root) : /\/WEB-INF\/cgi\//);
                    fis.util.del(root, include, exclude);
                    process.stdout.write((Date.now() - now + 'ms').green.bold);
                    process.stdout.write('\n');
                    break;

                case 'init':
                    server.init();
                    break;

                case 'update':
                    server.update();
                    break;

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

    commander
        .command('init')
        .description('install velocity framework in document root');

    commander
        .command('update')
        .description('update velocity framework in document root');
};
