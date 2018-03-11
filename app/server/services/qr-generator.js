var qr = require('qr-image');
var fs = require('fs');

controller = {};

/**
 * Generate a image file in the directory, containing the payload.
 * Mainly for testing purposes; possible file types include png, svg, pdf, and eps.
 * @param   {[type]}    payload     [description]
 * @param   {[type]}    fileName    [description]
 * @param   {[type]}    fileType    [description]
 * @param   {Function}  callback    [description]
 */
function generateQrCodeFile(payload, fileName, fileType, callback) {
    var qr_svg = qr.image(JSON.stringify(payload), { type: fileType });
    qr_svg.pipe(fs.createWriteStream(fileName+'.'+fileType));
}


/**
 * Generate a string with QR image data, containing the payload.
 * @param   {[type]}    payload     [description]
 * @param   {Function}  callback    [description]
 */
function generateQrCodeString(payload, callback) {
    var qr_string = qr.imageSync(JSON.stringify(payload));
    return qr_string;
}

/**
 * Generate a QR code compatible with Cumin that contains:
 * user's name, age, birthday, email and school
 * @param   {[type]}    name        [description]
 * @param   {[type]}    age         [description]
 * @param   {[type]}    birthday    [description]
 * @param   {[type]}    school      [description]
 * @param   {Function}  callback    [description]
 * @return  {[type]}                [description]
 */
controller.generateCheckInCode = function (name, age, birthday, email, school, callback) {
    var payload = {
        "name": name,
        "email": email,
        "age": age,
        "birthday": birthday,
        "school": school
    }
    var qr_string = generateQrCodeString(payload);
    return qr_string;
}

module.exports = controller;
