var _ = require('./util.js');
var step = require('step');
var exports = module.exports;
var child_process = require('child_process');
var spawn = child_process.spawn;
var path = require('path');
var jarPath = __dirname + path.sep + 'server.jar';

function fatalError(message) {
    fis.log.error(message);
    process.exit(1);
}

function checkJavaEnable() {
    var javaVersion = false;
    var java;
    var callback = this;

    //check java
    process.stdout.write('checking java support : ');
    java = spawn('java', ['-version']);

    java.stderr.on('data', function(data) {

        if (!javaVersion) {
            javaVersion = _.matchVersion(data.toString('utf8'));

            if (javaVersion) {
                process.stdout.write('v' + javaVersion + '\n');
            }
        }
    });

    java.on('error', function(err) {
        process.stdout.write('java not support!');
        fatalError(err);
    });

    java.on('exit', function() {
        if (!javaVersion) {
            process.stdout.write('java not support!');
        }

        callback(false, javaVersion);
    });
}

function downloadJar(err, callback) {
    if (fis.util.exists(jarPath)) {
        callback(err);
        return;
    }

    var pkg = require('./package.json');
    var https = require('https');
    var url = require('url');
    var dest = jarPath;
    var fs = fis.util.fs;

    var download = function(remote, done) {
        var options = url.parse(remote);
        var client;

        client = https.get( options, function( res ) {
            var count = 0,
                notifiedCount = 0,
                outFile;

            if ( res.statusCode === 200 ) {
                outFile = fs.openSync( dest, 'w' );

                res.on('data', function( data ) {
                    fs.writeSync(outFile, data, 0, data.length, null);
                    count += data.length;

                    if ( (count - notifiedCount) > 512 * 1024 ) {
                      process.stdout.write('Received ' + Math.floor( count / 1024 ) + 'K...\n');
                      notifiedCount = count;
                    }
                });

                res.addListener('end', function() {
                    process.stdout.write('Received ' + Math.floor(count / 1024) + 'K total.\n');
                    fs.closeSync( outFile );
                    done( false );
                });

            } else if (res.statusCode === 302 && res.headers.location) {
                client.abort();
                download(res.headers.location, done);
            } else {
                client.abort();
                fatalError('Error requesting archive');
            }
        }).on('error', function(e) {
            fatalError(e.message);
        });
    };

    callback = callback || this;

    process.stdout.write('Downloading ' + pkg['server-jar'] + '\n');
    download(pkg['server-jar'], callback);
}

function startTomcat( opt ) {

    process.stdout.write('starting fis-server.\n');

    var timeout = Math.max(opt.timeout * 1000, 5000); delete opt.timeout;
    var errMsg = 'fis-server fails to start at port [' + opt.port + '], error: ';
    var args = [
        '-jar', jarPath
    ];
    var ready = false;
    var log = '';

    fis.util.map(opt, function(key, value){
        args.push('--' + key, String(value));
    });

    args.push('--base', fis.project.getTempPath() );

    var server = spawn('java', args, { cwd : __dirname, detached: true });

    server.stderr.on('data', function(chunk){
        //console.log(chunk.toString('utf8'));
        if(ready) return;
        chunk = chunk.toString('utf8');
        log += chunk;
        process.stdout.write('.');
        if(chunk.indexOf('Exception') > 0) {
            process.stdout.write(' fail\n');
            try { process.kill(server.pid, 'SIGKILL'); } catch(e){}
            var match = chunk.match(/BindException:?\s+([^\r\n]+)/i);
            if(match){
                errMsg += match[1];
            } else {
                errMsg += 'unknown';
            }
            console.log(log);
            fis.log.error(errMsg);
        } else if(chunk.indexOf('Starting ProtocolHandler') > 0){
            ready = true;
            process.stdout.write(' at port [' + opt.port + ']\n');


            setTimeout(function(){
                _.open('http://127.0.0.1' + (opt.port == 80 ? '/' : ':' + opt.port + '/'), function(){
                    process.exit();
                });
            }, 200);
        }
    });
    server.on('error', function(err){
        try { process.kill(server.pid, 'SIGKILL'); } catch(e){}
        fis.log.error(err);
    });
    process.on('SIGINT', function(code) {
        try { process.kill(server.pid, 'SIGKILL'); } catch(e){}
    });

    server.unref();
    fis.util.write(_.getPidFile(), server.pid);

    setTimeout(function(){
        process.stdout.write(' fail\n');
        if(log) console.log(log);
        fis.log.error(errMsg + 'timeout');
    }, timeout);

    opt['process'] = 'java';
    options(opt);
}

function stopTomcat() {
    var tmp = _.getPidFile();
    var opt = options();
    var done = this;

    if (fis.util.exists(tmp)) {
        var pid = fis.util.fs.readFileSync(tmp, 'utf8').trim();
        var list, msg = '';
        var isWin = fis.util.isWin();

        opt['process'] = opt['process'] || 'java';

        if (isWin) {
            list = spawn('tasklist');
        } else {
            list = spawn('ps', ['-A']);
        }

        list.stdout.on('data', function (chunk) {
            msg += chunk.toString('utf-8').toLowerCase();
        });

        list.on('exit', function() {
            msg.split(/[\r\n]+/).forEach(function(item) {
                var reg = new RegExp('\\b'+opt['process']+'\\b', 'i');

                if (reg.test(item)) {
                    var iMatch = item.match(/\d+/);
                    if (iMatch && iMatch[0] == pid) {
                        try {
                            process.kill(pid, 'SIGINT');
                            process.kill(pid, 'SIGKILL');
                        } catch (e) {}
                        process.stdout.write('shutdown '+opt['process']+' process [' + iMatch[0] + ']\n');
                    }
                }
            });

            fis.util.fs.unlinkSync(tmp);

            if (done) {
                done( false, opt );
            }
        });

        list.on('error', function (e) {
            if (isWin) {
                fis.log.error('fail to execute `tasklist` command, please add your system path (eg: C:\\Windows\\system32, you should replace `C` with your system disk) in %PATH%');
            } else {
                fis.log.error('fail to execute `ps` command.');
            }
            process.exit(1);
        });

    } else {
        done && done(false, opt);
    }
}

function options(opt) {
    var tmp = _.getRCFile();

    if (opt) {
        fis.util.write(tmp, JSON.stringify(opt));
    } else {
        if (fis.util.exists(tmp)) {
            opt = fis.util.readJSON(tmp);
        } else {
            opt = {};
        }
    }
    return opt;
}


exports.start = function( opt, callback ) {
    step(stopTomcat, checkJavaEnable, downloadJar, function() {
        startTomcat( opt, this );
    }, callback);
};

exports.stop = function(callback) {
    step(stopTomcat, function() {
        callback && callback();
    });
};

//server info
exports.info = function() {
    var conf = _.getRCFile();
    if(fis.util.isFile(conf)){
        conf = fis.util.readJSON(conf);
        _.printObject(conf);
    } else {
        console.log('nothing...');
    }
};

//server open document directory
exports.open = function() {
    var conf = _.getRCFile();
    if(fis.util.isFile(conf)){
        conf = fis.util.readJSON(conf);
        if(fis.util.isDir(conf.root)){
            _.open(conf.root);
        }
    } else {
        _.open(root);
    }
};