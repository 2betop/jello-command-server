var _ = module.exports;


_.open = function(path, callback) {
    var child_process = require('child_process');
    var cmd = fis.util.escapeShellArg(path);

    fis.log.notice('browse ' + path.yellow.bold + '\n');


    if (fis.util.isWin()) {
        cmd = 'start "" ' + cmd;
    } else {
        if (process.env['XDG_SESSION_COOKIE']) {
            cmd = 'xdg-open ' + cmd;
        } else if (process.env['GNOME_DESKTOP_SESSION_ID']) {
            cmd = 'gnome-open ' + cmd;
        } else {
            cmd = 'open ' + cmd;
        }
    }

    child_process.exec(cmd, callback);
};

_.matchVersion = function(str) {
    var version = false;
    var reg = /\b\d+(\.\d+){2}/;
    var match = str.match(reg);

    if (match) {
        version = match[0];
    }

    return version;
};

_.printObject = function(o, prefix) {
    prefix = prefix || '';

    for (var key in o) {
        if (o.hasOwnProperty(key)) {

            if (typeof o[key] === 'object') {
                _.printObject(o[key], prefix + key + '.');
            } else {
                console.log(prefix + key + '=' + o[key]);
            }
        }
    }
};

/**
 * parse args
 * @sample
 * `parseArgs('--root /home/fis/.fis-tmp --port 8888');`
 *  =>
 * `{'root': '/home/fis/.fis-tmp', 'port': 8888}`
 *
 * @param argv
 * @returns {Object}
 */
_.parseArgs = function(argv) {
    var argv_array = {};

    if (Object.prototype.toString.apply(argv) == '[object Array]') {
        argv = argv.join(' ');
    }

    argv.replace(/--([^\s]+)\s+([^\s]+)/g, function($0, $1, $2) {
        if ($0) {
            argv_array[$1] = $2;
        }
    });

    return argv_array;
};

_.getRCFile = function() {
    return fis.project.getTempPath('server/conf.json');
};

_.getPidFile = function() {
    return fis.project.getTempPath('server/pid');
};

function checkDir(dest) {
    var path = require('path');

    path = path.dirname(dest);

    fis.util.mkdir(path);
}

_.download = function(opt, done) {
    var remote = opt.remote;
    var dest = opt.dest;
    var url = require('url');
    var fs = require('fs');
    var options = url.parse(remote);
    var notifiedSize = opt.notifiedSize || 512 * 1024;
    var http = options.protocol === 'https:' ? require('https') : require('http')
    var client;

    process.stdout.write('Downloading ' + remote + ' ...\n');

    client = http.get( options, function( res ) {
        var count = 0,
            notifiedCount = 0,
            outFile;

        if ( res.statusCode === 200 ) {
            checkDir(dest);

            outFile = fs.openSync( dest, 'w' );

            res.on('data', function( data ) {
                fs.writeSync(outFile, data, 0, data.length, null);
                count += data.length;

                if ( (count - notifiedCount) > notifiedSize ) {
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
            opt.remote = res.headers.location;

            process.stdout.write('Redirct to ' + opt.remote + '\n');
            _.download(opt, done);
        } else {
            client.abort();
            done('Error requesting archive')
        }
    }).on('error', function(e) {
        fs.unlinkSync(outFile);
        done(e.message || 'unkown error');
    });
}