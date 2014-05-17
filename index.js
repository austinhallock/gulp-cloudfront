var es = require('event-stream');
var fs = require('fs');
var path = require('path');
var gutil = require('gulp-util');
var AWS = require('aws-sdk');
var Q = require('q');
var through = require('through2');

module.exports = function(options) {

    options = options || {};
    var cloudfront = new AWS.CloudFront({
        accessKeyId: options.key,
        secretAccessKey: options.secret
    });

    var updateDefaultRootObject = function (defaultRootObject) {
        var deferred = Q.defer();

        // Get the existing distribution id
        cloudfront.getDistribution({ Id: options.distributionId }, function(err, data) {

            if (err) {                
                deferred.reject(err);
            } else {

                // AWS Service returns errors if we don't fix these
                if (data.DistributionConfig.Comment == null) data.DistributionConfig.Comment = '';
                if (data.DistributionConfig.Logging.Enabled == false) {
                    data.DistributionConfig.Logging.Bucket = '';
                    data.DistributionConfig.Logging.Prefix = '';
                }
                if (data.DistributionConfig.Origins.Items[0]) {
                	data.DistributionConfig.Origins.Items[0].S3OriginConfig.OriginAccessIdentity = '';
                }

                // Update the distribution with the new default root object
                data.DistributionConfig.DefaultRootObject = defaultRootObject;
                cloudfront.updateDistribution({
                    IfMatch: data.ETag,
                    Id: options.distributionId,
                    DistributionConfig: data.DistributionConfig
                }, function(err, data) {

                    if (err) {                
                        deferred.reject(err);
                    } else {
                        deferred.resolve();
                    }

                });

            }
        });   

        return deferred.promise;

    };

    return through.obj(function (file, enc, callback) {

        var self = this;

        // Update the default root object once we've found the index.html file
        if (file.path.match(/index\-[a-f0-9]{0,8}\.html(\.gz)?$/gi)) {           
        		// get rid of .gz (removed with gzip module) 
						file.path = file.path.replace(/\.gz$/gi, '')
            updateDefaultRootObject(path.basename(file.path))
                .then(function() {
                    return callback(null, file);                
                }, function(err) {
                    gutil.log(new gutil.PluginError('gulp-cloudfront', err));
                    callback(null, file);

                })

        } else {
            return callback(null, file);
        }

    });


};
