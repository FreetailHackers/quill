var mongoose   = require('mongoose'),
    bcrypt     = require('bcrypt'),
    validator  = require('validator'),
    jwt        = require('jsonwebtoken');
const { string } = require('underscore');
    JWT_SECRET = process.env.JWT_SECRET;
    JWT_SECRET_DISCORD = process.env.JWT_SECRET_DISCORD;

mongoose.set('useFindAndModify', false);

var profile = {
  // Basic info
  name: {
    type: String,
    min: 1,
    max: 100,
  },
  firstName: {
    type: String,
    min: 1,
    max: 100,
  },
  lastName: {
    type: String,
    min: 1,
    max: 100,
  },
  phoneNumber: String,
  birthday: String,
  adult: {
    type: Boolean,
    required: true,
    default: false,
  },
  // Optional info for demographics
  gender: {
    type: String,
    enum : {
      values: 'M F O N'.split(' ')
    }
  },
  otherGender: String,
  race: {
    type: String,
    enum : {
      values: 'I A B H W O N'.split(' ')
    }
  },
  otherRace: String,
  school: {
    type: String,
    min: 1,
    max: 150,
  },
  major: String,
  standing: {
    type: String,
    enum : {
      values: 'F P J S M D'.split(' ')
    }
  },
  graduationTime: {
    type: String,
    enum: {
      values: [
        'Fall 2020',
        'Spring 2021',
        'Fall 2021',
        'Spring 2022',
        'Fall 2022',
        'Spring 2023',
        'Fall 2023',
        'Spring 2024',
        'Other'
      ]
    }
  },
  resume: Boolean,
  skills: [String],
  firstHackathon: String,
  numHackathons: Number,
  socialMedia: [String],
  reimbursement: {
    type: String,
    enum : {
        values: 'O I N'.split(' ')
    }
  },
  essay: {
    type: String,
    min: 0,
    max: 1500
  },
  desires: {
    type: String,
    min: 0,
    max: 1500
  },
  description: {
    type: String,
    min: 0,
    max: 300,
  },

  experienceLevel: {
    type: String,
    enum : {
      values: 'L M H'.split(' ')
    }
  },
  apprehensions: {
    type: String,
    enum : {
      values: 'T F K G S'.split(' ')
    }
  },

  // mailing fields
  usStudent: {
    type: Boolean,
    default: false,
  },
  swag: {
    type: Boolean,
    default: false,
  },
  streetAddress: {
    type: String,
    min: 1,
    max: 150,
  },
  aptNumber: {
    type: String,
    min: 0,
    max: 50,
  },
  city: {
    type: String,
    min: 1,
    max: 50,
  },
  state: {
    type: String,
    default: "TX"
  },
  zip: {
    type: String,
    min: 5,
    max: 5,
  }
};

var sponsorFields = {
    sponsorStatus: {
        type: String,
        enum : {
            values: ['incomplete', 'completedProfile', 'grantedResumeAccess'],
            default: 'incomplete'
        },
    },
    companyName: String,
    representativeEmail: String,
    representativeFirstName: String,
    representativeLastName: String,
    tier: {
        type: String,
        enum: {
            values: ['Kilo', 'Mega', 'Giga', 'Title', ""] // Double check these!
        },
        default: ""
    },
    workshop: {
      type: Boolean,
      default: false
    },
    paid: {
      type: Boolean,
      default: false
    },
    openingStatementTime: Number,
    closingStatementTime: Number,
    estimatedCost: {
      type: Number,
      default: 0
    },
    otherNotes: String,
};

// Only after confirmed
var confirmation = {
  dietaryRestrictions: [String],
  shirtSize: {
    type: String,
    enum: {
      values: 'XS S M L XL XXL WXS WS WM WL WXL WXXL'.split(' ')
    }
  },
  wantsHardware: Boolean,
  hardware: String,

  github: String,
  twitter: String,
  linkedin: String,
  website: String,

  contactName: String,
  contactPhone: String,
  contactRelationship: String,

  platforms: [String],
  workshops: String,
  help: String,
  notes: String,

  signatureLiability: String,
  signaturePhotoRelease: String,
  signatureCodeOfConduct: String,
  signatureAffliationMlh: String,
  otherWorkshopIdeas: String,
};

var status = {
  /**
   * Whether or not the user's profile has been completed.
   * @type {Object}
   */
  completedProfile: {
    type: Boolean,
    required: true,
    default: false,
  },
  admitted: {
    type: Boolean,
    required: true,
    default: false,
  },
  admittedBy: {
    type: String,
    validate: [
      validator.isEmail,
      'Invalid Email',
    ],
    select: false
  },
  confirmed: {
    type: Boolean,
    required: true,
    default: false,
  },
  declined: {
    type: Boolean,
    required: true,
    default: false,
  },
  checkedIn: {
    type: Boolean,
    required: true,
    default: false,
  },
  checkInTime: {
    type: Number,
  },
  confirmBy: {
    type: Number
  },
  reimbursementGiven: {
    type: Boolean,
    default: false
  }
};


var userAtEvent = {
  /**
   * AFTER user is checked in to event
   * @type {Object}
   */
  receivedLunch: {
    type: Boolean,
    default: false
  },
  receivedDinner: {
    type: Boolean,
    default: false
  },
  workshopsAttended: {
    type: [String]
  },
  tablesVisited: {
    type: [String]
  }
};

var discord = {
  verified: {
    type: Boolean,
    default: false
  },
  userID: {
    type: String,
  }
}


// define the schema for our admin model
var schema = new mongoose.Schema({

  email: {
      type: String,
      required: true,
      unique: true,
      validate: [
        validator.isEmail,
        'Invalid Email',
      ]
  },

  password: {
    type: String,
    required: true,
    select: false
  },

  admin: {
    type: Boolean,
    required: true,
    default: false,
  },

  sponsor: {
    type: Boolean,
    required: true,
    default: false
  },

  timestamp: {
    type: Number,
    required: true,
    default: Date.now(),
  },

  lastUpdated: {
    type: Number,
    default: Date.now(),
  },

  teamCode: {
    type: String,
    min: 0,
    max: 140,
  },

  verified: {
    type: Boolean,
    required: true,
    default: false
  },

  salt: {
    type: Number,
    required: true,
    default: Date.now(),
    select: false
  },

  /**
   * User Profile.
   *
   * This is the only part of the user that the user can edit.
   *
   * Profile validation will exist here.
   */
  profile: profile,

  /**
   * Confirmation information
   *
   * Extension of the user model, but can only be edited after acceptance.
   */
  confirmation: confirmation,

  status: status,

  sponsorFields: sponsorFields,

  userAtEvent: userAtEvent,

  discord: discord

});

schema.set('toJSON', {
  virtuals: true
});

schema.set('toObject', {
  virtuals: true
});

//=========================================
// Instance Methods
//=========================================

// checking if this password matches
schema.methods.checkPassword = function(password) {
  return bcrypt.compareSync(password, this.password.trim());
};

// Token stuff
schema.methods.generateEmailVerificationToken = function(){
  return jwt.sign(this.email, JWT_SECRET);
};

schema.methods.generateAuthToken = function(){
  return jwt.sign(this._id, JWT_SECRET);
};

/**
 * Generate a temporary authentication token (for changing passwords)
 * @return JWT
 * payload: {
 *   id: userId
 *   iat: issued at ms
 *   exp: expiration ms
 * }
 */
schema.methods.generateTempAuthToken = function(){
  return jwt.sign({
    id: this._id
  }, JWT_SECRET, {
    expiresInMinutes: 60,
  });
};

//=========================================
// Static Methods
//=========================================

schema.statics.generateHash = function(password) {
  return bcrypt.hashSync(password, bcrypt.genSaltSync(8));
};

/**
 * Verify an an email verification token.
 * @param  {[type]}   token token
 * @param  {Function} cb    args(err, email)
 */
schema.statics.verifyEmailVerificationToken = function(token, callback){
  jwt.verify(token, JWT_SECRET, function(err, email) {
    return callback(err, email);
  });
};

/**
 * Verify a temporary authentication token.
 * @param  {[type]}   token    temporary auth token
 * @param  {Function} callback args(err, id)
 */
schema.statics.verifyTempAuthToken = function(token, callback){
  jwt.verify(token, JWT_SECRET, function(err, payload){

    if (err || !payload){
      return callback(err);
    }

    if (!payload.exp || Date.now() >= payload.exp * 1000){
      return callback({
        message: 'Token has expired.'
      });
    }

    return callback(null, payload.id);
  });
};

schema.statics.findOneByEmail = function(email){
  return this.findOne({
    email: email.toLowerCase()
  });
};

/**
 * Get a single user using a signed token.
 * @param  {String}   token    User's authentication token.
 * @param  {Function} callback args(err, user)
 */
schema.statics.getByToken = function(token, callback){
  jwt.verify(token, JWT_SECRET, function(err, id){
    if (err) {
      return callback(err);
    }
    this.findOne({_id: id}, callback);
  }.bind(this));
};

schema.statics.validateProfile = function(profile, cb){
  return cb(!(
    profile.name.length > 0 &&
    profile.firstName.length > 0 &&
    profile.lastName.length > 0 &&
    profile.resume &&
    profile.adult &&
    profile.school.length > 0 &&
    [
        'Fall 2020',
        'Spring 2021',
        'Fall 2021',
        'Spring 2022',
        'Fall 2022',
        'Spring 2023',
        'Fall 2023',
        'Spring 2024',
        'Other'
    ].indexOf(profile.graduationTime) > -1 &&
    ['M', 'F', 'O', 'N'].indexOf(profile.gender) > -1 &&

    // mailing
    (!profile.usStudent || !profile.swag || (
      profile.streetAddress.length > 0 &&
      profile.city.length > 0 &&
      profile.zip.length == 5 &&
      [
        "TX",
        "AL",
        "AK",
        "AZ",
        "AR",
        "CA",
        "CO",
        "CT",
        "DE",
        "DC",
        "FL",
        "GA",
        "HI",
        "ID",
        "IL",
        "IN",
        "IA",
        "KS",
        "KY",
        "LA",
        "ME",
        "MD",
        "MA",
        "MI",
        "MN",
        "MS",
        "MO",
        "MT",
        "NE",
        "NV",
        "NH",
        "NJ",
        "NM",
        "NY",
        "NC",
        "ND",
        "OH",
        "OK",
        "OR",
        "PA",
        "RI",
        "SC",
        "SD",
        "TN",
        "UT",
        "VT",
        "VA",
        "WA",
        "WV",
        "WI",
        "WY",
      ].indexOf(profile.state) > -1
    ))
    ));
};

// Discord Stuff

// Generate auth token for discord
schema.methods.generateDiscordToken = function(){
  //console.log("_id: " + this._id);
  //console.log(JWT_SECRET_DISCORD);
  return jwt.sign(this._id, JWT_SECRET_DISCORD);
};

/**
 * Verify an an email verification token.
 * @param  {[type]}   token token
 * @param  {Function} cb    args(err, email)
 */
schema.statics.verifyDiscordToken = function(token, callback){
  jwt.verify(token, JWT_SECRET_DISCORD, function(err, id) {
    //console.log("verifying id, _id: " + id);
    if(err || !id) {
      return callback({"message": "Error: could not verify token"});
    }

    return callback(err, id);
  });
};

// Chat API




//=========================================
// Virtuals
//=========================================

/**
 * Has the user completed their profile?
 * This provides a verbose explanation of their furthest state.
 */
schema.virtual('status.name').get(function(){

  if (this.status.checkedIn) {
    return 'checked in';
  }

  if (this.status.declined) {
    return "declined";
  }

  if (this.status.confirmed) {
    return "confirmed";
  }

  if (this.status.admitted) {
    return "admitted";
  }

  if (this.status.completedProfile){
    return "submitted";
  }

  if (!this.verified){
    return "unverified";
  }

  if(this.sponsor && this.sponsorFields.sponsorStatus === 'completedProfile') {
    return "pending";
  }

  if(this.sponsor && this.sponsorFields.sponsorStatus === 'grantedResumeAccess') {
    return "approved";
  }

  return "incomplete";

});

module.exports = mongoose.model('User', schema);
