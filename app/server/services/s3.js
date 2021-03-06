var fs = require('fs');
var AWS = require('aws-sdk');
var util = require('util');

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

var s3 = new AWS.S3();

var controller = {};

function uploadResume(file, fileName, callback) {
  var params = {
    Bucket: process.env.BUCKET_NAME,
    Key: util.format('resumes/%s', fileName),
    Body: file
  };
  s3.upload(params, function(err, res) {
    if (res) {
      callback(undefined, res);
    }
    if (err) {
      callback(err, undefined);
    }
  });
}

function getResume(fileName, callback) {
  var params = {
    Bucket: process.env.BUCKET_NAME,
    Key: util.format('resumes/%s.pdf', fileName),
    ResponseContentType: 'application/pdf',
  };
  
  s3.getObject(params, function(err, res) {
    if (err) {
      callback(err, undefined);
    }
    if (res) {
      callback(undefined, res);
    }
  });
}

controller.uploadResume = function(file, fileName, callback) {
  var fileBuffer = file['buffer']
  uploadResume(fileBuffer, fileName, function(err, info) {
    if (err){
      console.log(err);
    }
    if (info){
      console.log(info);
    }
    if (callback){
      callback(err, info);
    }
  });

};

controller.getResume = function(fileName, callback) {
  // var fileBuffer = file['buffer']
  getResume(fileName, function(err, info) {
    if (err){
      console.log(err);
      console.log("Resume not found :(");
      return;
    }
    if (info){
      console.log(info);
    }
    if (callback){
      callback(err, info);
    }
  });

};

module.exports = controller;
