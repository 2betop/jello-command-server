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

function downloadJar() {
    if (fis.util.exists(jarPath)) {
        callback(false);
        return;
    }

    var pkg = require('./package.json');

    callback = this;
    _.download({
        remote: pkg['server-jar'],
        dest: jarPath
    }, function( err ) {

        err && fatalError(err);

        callback(false);
    });
}

function downloadFramework(dest, callback) {
    dest = dest || fis.project.getTempPath('www');

    var mark = path.join(dest, 'WEB-INF/velocity.properties');

    // 通过判断那个文件来决定是否已经安装过。
    if (fis.util.isFile(mark)) {
        callback(false);
        return;
    }

    var pkg = require('./package.json');
    var url = pkg.framework;

    var name = fis.util.md5(url, 8) + fis.util.ext(url).ext;
    var tmp  = fis.project.getTempPath('downloads', name);

    _.download({
        dest: tmp,
        remote: url
    }, function( err ) {
        err && fatalError(err);

        var tar = require('tar');
        var fs = fis.util.fs;

        fs
            .createReadStream(tmp)
            .pipe(tar.Extract({ path : dest }))
            .on('error', function(err){
                fis.log.error('extract tar file [' + tmp + '] fail, error [' + err + ']');
            })
            .on('end', function(){
                fs.unlinkSync(tmp);
                callback && callback(false);
            });
    })


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
    step(stopTomcat, checkJavaEnable, downloadJar,
        function() {
            if (opt.root === fis.project.getTempPath('www')) {
                downloadFramework( opt.root, this );
                return;
            }
            this(false);
        },

        function() {
            startTomcat( opt, this );
        },

        callback);
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


exports.init = function() {
    var opt = options();

    downloadFramework(opt.root);
}