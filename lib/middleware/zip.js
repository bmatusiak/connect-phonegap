/*!
 * Module dependencies.
 */
 
var fs = require('fs'),
    archiver = require('archiver'),
    path = require('path'),
    walk = require('walkdir'),
    util = require('util');

var spawn = require('child_process').spawn;

/**
 * Middleware to compress the app as a zip archive.
 *
 * Starting in PhoneGap Developer App 1.4.0, a zip archive is returned
 * to the client. The client will uncompress this archive to deploy the
 * app on the device. This middleware will compress and return the archive
 * on each request.
 *
 * Options:
 *
 *   - `options` {Object}
 *   - `options.req` {Object} is the request object (for session access).
 */

module.exports = function(options) {
    
    return function(req, res, next) {
        if (req.url.indexOf('/__api__/appzip') === 0 && req.method === 'GET') {
            options.req = req;

            var resPath = path.join(__dirname, '../../res/middleware');

            // helper function that returns the scripts to inject into each HTML page
            var injectScript = function() {
                var deployScript = path.join(resPath, 'deploy.js'),
                    autoreloadScript = path.join(resPath, 'autoreload.js'),
                    consoleScript = path.join(resPath, 'consoler.js'),
                    homepageScript = path.join(resPath, 'homepage.js'),
                    refreshScript = path.join(resPath, 'refresh.js');

                var scripts = fs.readFileSync(deployScript) + 
                              fs.readFileSync(autoreloadScript) +
                              fs.readFileSync(consoleScript) +
                              fs.readFileSync(homepageScript) +
                              fs.readFileSync(refreshScript);

                // replace default server address with this server address
                return scripts.replace(/127\.0\.0\.1:3000/g, options.req.headers.host);
            };

            var Transform = require('stream').Transform;
            util.inherits(InjectHTML, Transform);

            function InjectHTML(options) {
                if (!(this instanceof InjectHTML)) {
                    return new InjectHTML(options);
                }

                Transform.call(this, options);
            };

            InjectHTML.prototype._transform = function (chunk, encoding, callback) {
                var newChunk = chunk.toString().replace('</body>', injectScript() + '\n</body>');
                this.push(newChunk);
                callback();
            };
            function sendZip(){
                var zip = spawn('zip', ['-r', '-',  './www'],{cwd:path.join(process.cwd(),"zipbuild")});
                res.writeHead(200, { 'Content-Type': 'application/zip' } )
                zip.stdout.on('data', function (data) {
                    res.write(data);
                });
                // Uncomment to see the files being added
                zip.stderr.on('data', function (data) {
                    //console.log('zip stderr: ' + data); 
                });
                zip.on('exit', function (code) {
                    if(code !== 0) {
                        res.statusCode = 500;
                        console.log('zip process exited with code ' + code);
                        res.end();
                    } else {
                        res.end();
                    }
                });
            }
            
            function  copyFiles(done){
                var mkdir = spawn('mkdir', ['zipbuild']);
                mkdir.on('exit', function () {
                    var cp = spawn('cp', ['-a', 'www', 'zipbuild'])
                    cp.on('exit', function () {
                        var theWalker = walk(path.join(process.cwd(),"zipbuild", 'www'), { 'follow_symlinks': true });
                        var htmls = []
                        theWalker.on('file', function(filename){
                            
                            if (path.extname(filename) === '.html') {
                                console.log(filename)
                                htmls.push(function(doNext){
                                    var htmlStreamFile = fs.createReadStream(filename);
                                    var injectorTransform = new InjectHTML();
                                    
                                    var data = "";
                                    injectorTransform.on("end",function(){
                                        fs.writeFile(filename,data);
                                        doNext();
                                    })
                                    injectorTransform.on('data', function(chunk) {
                                      data += chunk.toString();
                                    });
                                    htmlStreamFile.pipe(injectorTransform);
                                    
                                });
                            }
                        });
            
                        theWalker.on('end', function(){
                            function loadNext(){
                                htmls.shift()(loadNext)
                            }
                            htmls.push(done);
                            
                            loadNext();
                            
                        });
                    });
                });
            }
            
            copyFiles(sendZip);
            /*
            var archive = archiver('zip', { store: false });

            archive.on('error', function(err) {
                console.log(err)
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end();
            });

            res.writeHead(200, { 'Content-Type': 'application/zip' } );
            archive.pipe(res);

            var theWalker = walk(path.join(process.cwd(), 'www'), { 'follow_symlinks': true });

            theWalker.on('file', function(filename){
                var output = filename.split(process.cwd())[1];
                console.log("file:"+filename)
                if (path.extname(filename) === '.html') {
                    var htmlStreamFile = fs.createReadStream(filename);
                    var injectorTransform = new InjectHTML();
                    htmlStreamFile.pipe(injectorTransform);
                    archive.append(injectorTransform, { name: output });
                }
                else {
                    archive.append(fs.createReadStream(filename), { name: output });
                }
            });

            theWalker.on('end', function(){
                archive.finalize();
            });
            */
        }
        else {
            next();
        }
    };
};
