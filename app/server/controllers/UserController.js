var _ = require('underscore');
var User = require('../models/User');
var Settings = require('../models/Settings');
var Mailer = require('../services/email');
var Stats = require('../services/stats');
var s3 = require('../services/s3');

var util = require('util');
var validator = require('validator');
var moment = require('moment');

var UserController = {};

var maxTeamSize = process.env.TEAM_MAX_SIZE || 4;
var tempPassword = process.env.TEMP_PASSWORD;

// Tests a string if it ends with target s
function endsWith(s, test) {
  return test.indexOf(s, test.length - s.length) !== -1;
}

/**
 * Determine whether or not a user can register.
 * @param  {String}   email    Email of the user
 * @param  {Function} callback args(err, true, false)
 * @return {[type]}            [description]
 */
function canRegister(email, password, callback) {

  if (!password || password.length < 6) {
    return callback({message: 'Password must be 6 or more characters.'}, false);
  }

  // Check if its within the registration window.
  Settings.getRegistrationTimes(function (err, times) {
    if (err) {
      callback(err);
    }

    var now = Date.now();

    if (now < times.timeOpen) {
      return callback({
        message: 'Registration opens in ' + moment(times.timeOpen).fromNow() + '!'
      });
    }

    if (now > times.timeClose) {
      return callback({
        message: 'Sorry, registration is closed.'
      });
    }

    // Check for emails.
    Settings.getWhitelistedEmails(function (err, emails) {
      if (err || !emails) {
        return callback(err);
      }
      for (var i = 0; i < emails.length; i++) {
        if (validator.isEmail(email) && endsWith(emails[i], email)) {
          return callback(null, true);
        }
      }
      return callback({
        message: 'Not a valid educational email.'
      }, false);
    });

  });
}

/**
 * Login a user given a token
 * @param  {String}   token    auth token
 * @param  {Function} callback args(err, token, user)
 */
UserController.loginWithToken = function (token, callback) {
  User.getByToken(token, function (err, user) {
    return callback(err, token, user);
  });
};

/**
 * Login a user given an email and password.
 * @param  {String}   email    Email address
 * @param  {String}   password Password
 * @param  {Function} callback args(err, token, user)
 */
UserController.loginWithPassword = function (email, password, callback) {

  if (!password || password.length === 0) {
    return callback({
      message: 'Please enter a password'
    });
  }

  if (!validator.isEmail(email)) {
    return callback({
      message: 'Invalid email'
    });
  }

  User
    .findOneByEmail(email)
    .select('+password')
    .exec(function (err, user) {
      if (err) {
        return callback(err);
      }
      if (!user) {
        return callback({
          message: 'We couldn\'t find you!'
        });
      }
      if (!user.checkPassword(password)) {
        return callback({
          message: 'That\'s not the right password.'
        });
      }

      // yo dope nice login here's a token for your troubles
      var token = user.generateAuthToken();

      var u = user.toJSON();

      delete u.password;

      return callback(null, token, u);
    });
};

/**
 * Create a new user given an email and a password.
 * @param  {String}   email    User's email.
 * @param  {String}   password [description]
 * @param  {Function} callback args(err, user)
 */
UserController.createUser = function (email, password, callback) {

  if (typeof email !== 'string') {
    return callback({
      message: 'Email must be a string.'
    });
  }

  email = email.toLowerCase();

  // Check that there isn't a user with this email already.
  canRegister(email, password, function (err, valid) {

    if (err || !valid) {
      return callback(err);
    }

    var u = new User();
    u.email = email;
    u.password = User.generateHash(password);
    u.save(function (err) {
      if (err) {
        // Duplicate key error codes
        if (err.name === 'MongoError' && (err.code === 11000 || err.code === 11001)) {
          return callback({
            message: 'An account for this email already exists.'
          });
        }
        return callback(err);
      } else {
        // yay! success.
        var token = u.generateAuthToken();

        // Send over a verification email
        var verificationToken = u.generateEmailVerificationToken();
        var discord = u.generateDiscordToken();
        Mailer.sendVerificationEmail(email, verificationToken);
        return callback(
          null,
          {
            token: token,
            user: u
          }
        );
      }

    });
  });
};

/**
 * Create a new sponsor given an email.
 * @param  {String}   email    User's email.
 * @param  {Function} callback args(err, user)
 */
UserController.createSponsor = function (email, callback) {
  if (typeof email !== 'string') {
    return callback({
      message: 'Email must be a string.'
    });
  }

  email = email.toLowerCase();
  // Generate random password
  var password = '';
  var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var charactersLength = characters.length;
  for ( var i = 0; i < 15; i++ ) {
        password += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    var u = new User();
    u.email = email;
    u.password = User.generateHash(password);
    u.sponsor = true;
    u.verified = true;
    u.save(function (err) {
      if (err) {
        // Duplicate key error codes
        if (err.name === 'MongoError' && (err.code === 11000 || err.code === 11001)) {
          return callback({
            message: 'An account for this email already exists.'
          });
        }
        return callback(err);
      } else {
        // yay! success.
        var token = u.generateAuthToken();
        console.log("Success! New sponsor: ", email, password);
        u.email = email;
        u.password = password;
        // Send over an email with credentials
        Mailer.sendSponsorEmailandPassword(email, password);

        // Verification email function on hold
        //Mailer.sendVerificationEmail(email, token);
        return callback(
          null,
          {
            token: token,
            user: u
          }
        );
      }
    });
};


UserController.getByToken = function (token, callback) {
  User.getByToken(token, callback);
};

/**
 * Get all users.
 * It's going to be a lot of data, so make sure you want to do this.
 * @param  {Function} callback args(err, user)
 */
UserController.getAll = function (callback) {
  User.find({}, callback);
};

/**
 * Get a page of users.
 * @param  {[type]}   page     page number
 * @param  {[type]}   size     size of the page
 * @param  {Function} callback args(err, {users, page, totalPages})
 */
UserController.getPage = function (query, callback) {
  var page = query.page;
  var size = parseInt(query.size);
  var searchText = query.text;
  var gradYears = query.grad;
  var skills = query.skills;
  var usStudent = query.usStudent;
  var resumeOnly = query.resume;
  var queries = [];
  var year_query = {};
  var findQuery = {};
  if (searchText.length > 0) {
    var re = new RegExp(searchText, 'i');
    queries.push({email: re});
    queries.push({'profile.name': re});
    queries.push({'teamCode': re});

    // check if valid ObjectId passed, else will crash program
    if (searchText.match(/^[0-9a-fA-F]{24}$/)) {
      queries.push({_id: searchText});
    }

    findQuery.$and = [];
    findQuery.$and.push({'$or': queries});
  }

  // check if grad year passed in
  if (gradYears.length > 0) {
    years = gradYears.split(",");
    year_query = {'$in': years};

    if (!findQuery.$and) {
      findQuery.$and = [];
    }
    findQuery.$and.push({'profile.graduationTime': year_query});
  }

  // check if skills passed in
  if (skills.length > 0) {
    skills_arr = skills.split(",");
    skills_query = {'$in': skills_arr};
    match_query = {'$elemMatch': skills_query}
    if (!findQuery.$and) {
      findQuery.$and = [];
    }
    findQuery.$and.push({'profile.skills': match_query});
  }

  if (usStudent === "true") {
    if (!findQuery.$and) {
      findQuery.$and = []
    }
    findQuery.$and.push({'profile.usStudent' : true});
  }

  if (resumeOnly === "true") {
    if (!findQuery.$and) {
      findQuery.$and = []
    }
    findQuery.$and.push({'profile.resume': true});
  }


  User
    .find(findQuery)
    .sort({
      'profile.name': 'asc'
    })
    .select('+status.admittedBy')
    .skip(page * size)
    .limit(size)
    .exec(function (err, users) {
      if (err || !users) {
        return callback(err);
      }

      User.count(findQuery).exec(function (err, count) {

        if (err) {
          return callback(err);
        }

        if (size == 0 && page == 0) {
          // we only want user IDs in this case
          users = users.map((user) => {return user._id + "_" + user.profile.lastName + "_" + user.profile.firstName})
        }

        return callback(null, {
          users: users,
          page: page,
          size: size,
          totalPages: Math.ceil(count / size)
        });
      });

    });
};

UserController.getAllSponsors = function (callback) {
  User.find({'sponsor': true}, callback);
};

UserController.getSponsorPage = function (query, callback) {
  var page = query.page;
  var size = parseInt(query.size);
  var searchText = query.text;

  var queries = [];
  var findQuery = {};
  queries.push({sponsor: true});
  if (searchText.length > 0) {
    var re = new RegExp(searchText, 'i');
    queries.push({email: re});
    queries.push({'profile.name': re});
    queries.push({'teamCode': re});

    // check if valid ObjectId passed, else will crash program
    if (searchText.match(/^[0-9a-fA-F]{24}$/)) {
      queries.push({_id: searchText});
    }
  }
  findQuery.$and = [];
  findQuery.$and.push({'$or': queries});


  User
    .find(findQuery)
    .sort({
      'profile.name': 'asc'
    })
    .select('+status.admittedBy')
    .skip(page * size)
    .limit(size)
    .exec(function (err, users) {
      if (err || !users) {
        return callback(err);
      }

      User.count(findQuery).exec(function (err, count) {

        if (err) {
          return callback(err);
        }

        return callback(null, {
          users: users,
          page: page,
          size: size,
          totalPages: Math.ceil(count / size)
        });
      });

    });
};

/**
 * Get a user by id.
 * @param  {String}   id       User id
 * @param  {Function} callback args(err, user)
 */
UserController.getById = function (id, callback){
  User.findById(id).exec(callback);
};

UserController.getResumeById = function(id, callback) {
  s3.getResume(id, callback);
};

/**
 * Update a user's profile object, given an id and a profile.
 *
 * @param  {String}   id       Id of the user
 * @param  {Object}   profile  Profile object
 * @param  {Function} callback Callback with args (err, user)
 */
UserController.updateProfileById = function (id, profile, callback) {

  // Validate the user profile, and mark the user as profile completed
  // when successful.
  User.validateProfile(profile, function (err) {
    if (err) {
      return callback({message: 'invalid profile'});
    }

    // Check if its within the registration window.
    // Settings.getRegistrationTimes(function (err, times) {
    //   if (err) {
    //     callback(err);
    //   }

    //   var now = Date.now();

    //   if (now < times.timeOpen) {
    //     return callback({
    //       message: 'Registration opens in ' + moment(times.timeOpen).fromNow() + '!'
    //     });
    //   }

    //   if (now > times.timeClose) {
    //     return callback({
    //       message: 'Sorry, registration is closed.'
    //     });
    //   }
    // });

    User.findOneAndUpdate({
        _id: id,
        verified: true
      },
      {
        $set: {
          'lastUpdated': Date.now(),
          'profile': profile,
          'status.completedProfile': true
        }
      },
      {
        new: true
      },
      callback);
  });
};

/**
 * Update a user's profile object, given an id and a profile.
 *
 * @param  {String}   id       Id of the user
 * @param  {Object}   profile  Profile object
 * @param  {Function} callback Callback with args (err, user)
 */
UserController.updateResumeById = function (id, resume, callback) {
  s3.uploadResume(resume, util.format('%s.pdf', id), callback);
};

/**
 * Update a user's confirmation object, given an id and a confirmation.
 *
 * @param  {String}   id            Id of the user
 * @param  {Object}   confirmation  Confirmation object
 * @param  {Function} callback      Callback with args (err, user)
 */
UserController.updateConfirmationById = function (id, confirmation, callback) {

  User.findById(id).exec(function(err, user){
    if (err || !user) {
      return callback(err);
    }

    // Make sure that the user followed the deadline, but if they're already confirmed
    // that's okay.
    if (Date.now() >= user.status.confirmBy && !user.status.confirmed) {
      return callback({
        message: 'You\'ve missed the confirmation deadline.'
      });
    }

    // You can only confirm acceptance if you're admitted and haven't declined.
    User.findOneAndUpdate({
        '_id': id,
        'verified': true,
        'status.admitted': true,
        'status.declined': {$ne: true}
      },
      {
        $set: {
          'lastUpdated': Date.now(),
          'confirmation': confirmation,
          'status.confirmed': true,
        }
      }, {
        new: true
      },
      function(err, user) {
        if (err || !user) {
          return callback(err, user);
        }
        return callback(err, user);
    });
  });
};

/**
 * Decline an acceptance, given an id.
 *
 * @param  {String}   id            Id of the user
 * @param  {Function} callback      Callback with args (err, user)
 */
UserController.declineById = function (id, callback) {

  // You can only decline if you've been accepted.
  User.findOneAndUpdate({
      '_id': id,
      'verified': true,
      'status.admitted': true,
      'status.declined': false
    },
    {
      $set: {
        'lastUpdated': Date.now(),
        'status.confirmed': false,
        'status.declined': true
      }
    }, {
      new: true
    },
    callback);
};

/**
 * Verify a user's email based on an email verification token.
 * @param  {[type]}   token    token
 * @param  {Function} callback args(err, user)
 */
UserController.verifyByToken = function (token, callback) {
  User.verifyEmailVerificationToken(token, function (err, email) {
    User.findOneAndUpdate({
        email: email.toLowerCase()
      }, {
        $set: {
          'verified': true
        }
      }, {
        new: true
      },
      callback);
  });
};

/**
 * Get a specific user's teammates. NAMES ONLY.
 * @param  {String}   id       id of the user we're looking for.
 * @param  {Function} callback args(err, users)
 */
UserController.getTeammates = function(id, callback){
  User.findById(id).exec(function(err, user){
    if (err || !user){
      return callback(err, user);
    }

    var code = user.teamCode;

    if (!code) {
      return callback({
        message: 'You\'re not on a team.'
      });
    }

    User
      .find({
        teamCode: code
      })
      .select('profile.name')
      .select('email')
      .select('status')
      .exec(callback);
  });
};

/**
 * Given a team code and id, join a team.
 * @param  {String}   id       Id of the user joining/creating
 * @param  {String}   code     Code of the proposed team
 * @param  {Function} callback args(err, users)
 */
UserController.createOrJoinTeam = function (id, code, callback) {

  if (!code) {
    return callback({
      message: 'Please enter a team name.'
    });
  }

  if (typeof code !== 'string') {
    return callback({
      message: 'Get outta here, punk!'
    });
  }

  User.find({
    teamCode: code
  })
    .select('profile.name')
    .exec(function (err, users) {
      // Check to see if this team is joinable (< team max size)
      if (users.length >= maxTeamSize) {
        return callback({
          message: 'Team is full.'
        });
      }

      // Otherwise, we can add that person to the team.
      User.findOneAndUpdate({
          _id: id,
          verified: true
        }, {
          $set: {
            teamCode: code
          }
        }, {
          new: true
        },
        callback);

    });
};

/**
 * Given an id, remove them from any teams.
 * @param  {[type]}   id       Id of the user leaving
 * @param  {Function} callback args(err, user)
 */
UserController.leaveTeam = function (id, callback) {
  User.findOneAndUpdate({
      _id: id
    }, {
      $set: {
        teamCode: null
      }
    }, {
      new: true
    },
    callback);
};

/**
 * Resend an email verification email given a user id.
 */
UserController.sendVerificationEmailById = function (id, callback) {
  User.findOne(
    {
      _id: id,
      verified: false
    },
    function (err, user) {
      if (err || !user) {
        return callback(err);
      }
      var token = user.generateEmailVerificationToken();
      Mailer.sendVerificationEmail(user.email, token);
      return callback(err, user);
    });
};

/**
 * Password reset email
 * @param  {[type]}   email    [description]
 * @param  {Function} callback [description]
 * @return {[type]}            [description]
 */
UserController.sendPasswordResetEmail = function (email, callback) {
  User
    .findOneByEmail(email)
    .exec(function (err, user) {
      if (err || !user) {
        return callback(err);
      }

      var token = user.generateTempAuthToken();
      Mailer.sendPasswordResetEmail(email, token, callback);
    });
};

/**
 * Password reset email
 * @param  {[type]}   email    [description]
 * @param  {Function} callback [description]
 * @return {[type]}            [description]
 */
UserController.sendWalkInEmail = function (email, callback) {
  if (typeof email !== 'string') {
    return callback({
      message: 'Email must be a string.'
    });
  }

  email = email.toLowerCase();
  if (validator.isEmail(email)) {
    // console.log("validator");
    var u = new User();

    u.email = email;
    u.password = User.generateHash(tempPassword);
    u.save(function (err, data) {
      if (err) {
        // Duplicate key error codes
        if (err.name === 'MongoError' && (err.code === 11000 || err.code === 11001)) {
        }
        callback(err, false);
      } else {
        // yay! success.
        var token = u.generateAuthToken();

        // Send over an email
        var verificationToken = u.generateEmailVerificationToken();
        Mailer.sendWalkinEmail(email, verificationToken);

        return callback(
          null,
          {
            token: token,
            user: u
          }
        );
      }
    });
  }
};

/**
 * Reset a user's password to a given password, given a authentication token.
 * @param  {String}   token       Authentication token
 * @param  {String}   password    New Password
 * @param  {Function} callback    args(err, user)
 */
UserController.createWalkInUser = function (token, password, callback) {
  if (!password || !token) {
    return callback({
      message: 'Bad arguments'
    });
  }

  if (password.length < 6) {
    return callback({
      message: 'Password must be 6 or more characters.'
    });
  }

  User.verifyEmailVerificationToken(token, function (err, email) {
    if (err || !email) {
      return callback(err);
    }

    User.findOneAndUpdate({
        email: email.toLowerCase()
      }, {
        $set: {
          'verified': true,
          'password': User.generateHash(password),
          'status.allowRegister': true
        }
      }, {
        new: true
      }, function (err, user) {
        if (err || !user) {
          return callback(err);
        }

        return callback(null, {
          message: 'Password successfully reset!'
        });
      });
  });
};

/**
 * UNUSED
 *
 * Change a user's password, given their old password.
 * @param  {[type]}   id          User id
 * @param  {[type]}   oldPassword old password
 * @param  {[type]}   newPassword new password
 * @param  {Function} callback    args(err, user)
 */
UserController.changePassword = function (id, oldPassword, newPassword, callback) {
  if (!id || !oldPassword || !newPassword) {
    return callback({
      message: 'Bad arguments.'
    });
  }

  User
    .findById(id)
    .select('password')
    .exec(function (err, user) {
      if (user.checkPassword(oldPassword)) {
        User.findOneAndUpdate({
            _id: id
          }, {
            $set: {
              password: User.generateHash(newPassword)
            }
          }, {
            new: true
          },
          callback);
      } else {
        return callback({
          message: 'Incorrect password'
        });
      }
    });
};

/**
 * Reset a user's password to a given password, given a authentication token.
 * @param  {String}   token       Authentication token
 * @param  {String}   password    New Password
 * @param  {Function} callback    args(err, user)
 */
UserController.resetPassword = function (token, password, callback) {
  if (!password || !token) {
    return callback({
      message: 'Bad arguments'
    });
  }

  if (password.length < 6) {
    return callback({
      message: 'Password must be 6 or more characters.'
    });
  }

  User.verifyTempAuthToken(token, function (err, id) {

    if (err || !id) {
      return callback(err);
    }

    User
      .findOneAndUpdate({
        _id: id
      }, {
        $set: {
          password: User.generateHash(password)
        }
      }, function (err, user) {
        if (err || !user) {
          return callback(err);
        }

        Mailer.sendPasswordChangedEmail(user.email);
        return callback(null, {
          message: 'Password successfully reset!'
        });
      });
  });
};

/**
 * [ADMIN ONLY]
 *
 * Admit a user.
 * @param  {String}   userId   User id of the admit
 * @param  {String}   user     User doing the admitting
 * @param  {Function} callback args(err, user)
 */
UserController.admitUser = function (id, user, callback) {
  Settings.getRegistrationTimes(function (err, times) {
    User
      .findOneAndUpdate({
          _id: id,
          verified: true
        }, {
          $set: {
            'status.admitted': true,
            'status.admittedBy': user.email,
            'status.confirmBy': times.timeConfirm
          }
        }, {
          new: true
        },
        function (err, userTo) {
          if (err || !userTo) {
            return callback(err, userTo);
          }
          Mailer.sendAcceptanceEmail(userTo.email, userTo.status.confirmBy);
          return callback(err, userTo);
        });
  });

};

/**
 * [ADMIN ONLY]
 *
 * Defer a user.
 * @param  {String}   userId   User id of the defer
 * @param  {String}   user     User doing the deferring
 * @param  {Function} callback args(err, user)
 */
UserController.deferUser = function (id, user, callback) {
  User.findOne({
    _id: id,
    verified: true
  }, function(err, user) {
    if(err || !user) {
      return callback(err, user);
    }
    else {
      Mailer.sendDeferredEmail(user.email);
    }
  });
};

/**
 * [ADMIN ONLY]
 *
 * Give a sponsor access to Resumes
 * @param  {String}   userId      User id of the sponsor granted access
 * @param  {Function} callback    args(err, user)
 */
 UserController.grantResumeAccess = function (id, callback) {
     User.findOneAndUpdate({
        _id: id,
	 }, {
     $set: {
        'sponsorFields.sponsorStatus': 'grantedResumeAccess'
     }
     }, {
        new: true
     },
     callback);
 }

 /**
 * [ADMIN ONLY]
 *
 * Remove sponsor's access to Resumes
 * @param  {String}   userId      User id of the sponsor removed access
 * @param  {Function} callback    args(err, user)
 */
 UserController.grantResumeAccess = function (id, callback) {
     User.findOneAndUpdate({
        _id: id,
	 }, {
     $set: {
        'sponsorFields.sponsorStatus': 'completedProfile'
     }
     }, {
        new: true
     },
     callback);
 }

UserController.markReceivedLunch = function(id, callback) {

  // Check if user already received meal
  User.findOne({
    _id: id,
    verified: true
  }, function(err, user) {
    if(err || !user) {
      return callback(err, user);
    }
    else if(user.userAtEvent.receivedLunch) {
      return callback({"custom_message" : "User has already received lunch"})
    }
    else {
      User.findOneAndUpdate({
        _id: id,
        verified: true
      }, {
        $set: {
          'userAtEvent.receivedLunch': true
        }
      }, {
        new: true
      },
      callback);
    }
  });
}

UserController.markReceivedDinner = function(id, callback) {

  User.findOne({
    _id: id,
    verified: true
  }, function(err, user) {
    if(err || !user) {
      return callback(err, user);
    }
    else if(user.userAtEvent.receivedDinner) {
      return callback({"custom_message" : "User has already received dinner"})
    }
    else {
      User.findOneAndUpdate({
        _id: id,
        verified: true
      }, {
        $set: {
          'userAtEvent.receivedDinner': true
        }
      }, {
        new: true
      },
      callback);
    }
  });
}


/**
 * [ADMIN ONLY]
 *
 * Check in a user.
 * @param  {String}   userId   User id of the user getting checked in.
 * @param  {String}   user     User checking in this person.
 * @param  {Function} callback args(err, user)
 */
UserController.checkInById = function (id, user, callback) {
  User.findOneAndUpdate({
      _id: id,
      verified: true
    }, {
      $set: {
        'status.checkedIn': true,
        'status.checkInTime': Date.now()
      }
    }, {
      new: true
    },
    callback);
};

/**
 * [ADMIN ONLY]
 *
 * Check out a user.
 * @param  {String}   userId   User id of the user getting checked out.
 * @param  {String}   user     User checking in this person.
 * @param  {Function} callback args(err, user)
 */
UserController.checkOutById = function (id, user, callback) {
  User.findOneAndUpdate({
      _id: id,
      verified: true
    }, {
      $set: {
        'status.checkedIn': false
      }
    }, {
      new: true
    },
    callback);
};

/**
 * [ADMIN ONLY]
 *
 * Make user an admin
 * @param  {String}   userId   User id of the user being made admin
 * @param  {String}   user     User making this person admin
 * @param  {Function} callback args(err, user)
 */
UserController.makeAdminById = function(id, user, callback){
  User.findOneAndUpdate({
    _id: id,
    verified: true
  },{
    $set: {
      'admin': true
    }
  }, {
    new: true
  },
  callback);
};

/**
 * [ADMIN ONLY]
 *
 * Make user an admin
 * @param  {String}   userId   User id of the user being made admin
 * @param  {String}   user     User making this person admin
 * @param  {Function} callback args(err, user)
 */
UserController.removeAdminById = function(id, user, callback){
  User.findOneAndUpdate({
    _id: id,
    verified: true
  },{
    $set: {
      'admin': false
    }
  }, {
    new: true
  },
  callback);
};

// [UNUSED]
UserController.makeSponsorById = function(id, user, callback){
  User.findOneAndUpdate({
    _id: id,
    verified: true
  },{
    $set: {
      'sponsor': true
    }
  }, {
    new: true
  },
  callback);
};

/**
 * [SPONSOR methods]
 */

 /** Filters the subset of user attributes returned
 *  to a sponsor before executing a callback
 * @param {Function} callback
 * @returns {Function} [filtered]
 */
function filterForSponsor(callback) {
  return function(err, user) {
    if (!err) {
      // include id and profile
      user = {
        'id': user['id'],
        'profile': user['profile']
      }
    }
    callback(err, user);
  }
}

UserController.addWorkshopAttended = function(id, sponsor_id, callback){
  User.findOneAndUpdate({
    _id: id,
    verified: true
  },{
    $addToSet: {
      'userAtEvent.workshopsAttended': sponsor_id
    }
  }, {
    new: true
  },
  filterForSponsor(callback));
}

UserController.addTableVisited = function(id, sponsor_id, callback){
  User.findOneAndUpdate({
    _id: id,
    verified: true
  },{
    $addToSet: {
      'userAtEvent.tablesVisited': sponsor_id
    }
  }, {
    new: true
  },
  filterForSponsor(callback));
}

UserController.updateSponsorById = function(id, user, callback){
  User.findOneAndUpdate({
    _id: id,
  },{
    $set: {
      'sponsorFields.sponsorStatus': "completedProfile",
      'sponsorFields.tier': user.data.sponsorFields.tier,
      'sponsorFields.workshop': user.data.sponsorFields.workshop,
      'sponsorFields.paid': user.data.sponsorFields.paid,
      'sponsorFields.estimatedCost': user.data.sponsorFields.estimatedCost,
      'sponsorFields.companyName': user.data.sponsorFields.companyName,
      'sponsorFields.representativeFirstName': user.data.sponsorFields.representativeFirstName,
      'sponsorFields.representativeLastName': user.data.sponsorFields.representativeLastName,
      'sponsorFields.openingStatementTime': Number(user.data.sponsorFields.openingStatementTime),
      'sponsorFields.closingStatementTime': Number(user.data.sponsorFields.closingStatementTime),
      'sponsorFields.otherNotes': user.data.sponsorFields.otherNotes,
      'sponsorFields.representativeEmail': user.data.sponsorFields.representativeEmail,
    }
  },{
    new: true
  },
  callback);

};

UserController.grantResumeAccessById = function(id, user, callback){
  User.findOneAndUpdate({
    _id: id,
    verified: true
  },{
    $set: {
      'sponsorFields.sponsorStatus': 'grantedResumeAccess'
    }
  }, {
    new: true
  },
  callback);
};

UserController.removeResumeAccessById = function(id, user, callback){
  User.findOneAndUpdate({
    _id: id,
    verified: true
  },{
    $set: {
      'sponsorFields.sponsorStatus': 'completedProfile'
    }
  }, {
    new: true
  },
  callback);
};

/**
 * [ADMIN ONLY]
 *
 * Send an application reminder.
 * @param  {String}   userId   User id
 * @param  {String}   user     User sending the email
 * @param  {Function} callback args(err, user)
 */
UserController.sendApplicationReminder = function (email, callback) {
      Mailer.sendApplicationReminderEmail(email);
};

/**
 * [ADMIN ONLY]
 *
 * Send a confirmation reminder.
 * @param  {String}   userId   User id
 * @param  {String}   user     User sending the email
 * @param  {Function} callback args(err, user)
 */
UserController.sendConfirmationReminder = function (id, callback) {
  Settings.getRegistrationTimes(function (err, times) {
    User
      .findOneAndUpdate({
          '_id': id,
          'verified': true,
          'status.admitted': true,
          'status.confirmed': true,
        }, {
          $set: {
            'status.confirmBy': times.timeConfirm
          }
        }, {
          new: true
        },
        function (err, userTo) {
          if (err || !userTo) {
            return callback(err, userTo);
          }
          // Mailer.sendConfirmationReminderEmail(userTo.email);
          return callback(err, userTo);
        });
  });
}


/**
 * [ADMIN ONLY]
 */

UserController.getStats = function (callback) {
  return callback(null, Stats.getUserStats());
};

// Generates a token to pass into the bot for verifiation purposes
UserController.generateDiscordToken = function(token, callback) {
  User.getByToken(token, function(err, user) {
    if(!user) return callback({"message" : "Error, user does not exist."});
    // Okay, there is a user tha thas this token
    let discordToken = user.generateDiscordToken();
    return callback(null, discordToken);
  });
}

// Verifies a given discord token
// If valid, also checks the user in
UserController.verifyDiscordToken = function (token, discordID, callback) {
  if(!token || !discordID) {
    return callback({"message": "Error, not enough parameters passed into verify method."});
  }

  User.verifyDiscordToken(token, function (err, _id) {
    // Fix this later
    // console.log("decoded id: " + _id);
    if(err) {
      return callback(err);
    }

    User.findOne({
      _id,
      verified : true,
    }, function(err, user) {
      if(!user.verified) {
        return callback({"message" : "Error, this account is not verified.  Please verify your HackTX account before using this command"});
      }

      if(user.discord.verified) {
        return callback({"message" : "Error, this user has already verified their account with Discord.  If you believe this is incorrect, please contact an organizer."});
      }

      User.findOneAndUpdate({
        _id,
        verified: true,
        "discord.verified": false
        }, {
          $set: {
            'status.checkedIn': true,
            'status.checkInTime': Date.now(),
            'discord.verified': true,
            'discord.userID': discordID,
          }
        }, {
          new: true
        },
        callback);
    })
  });
};

// Verifies a given discord token
// If valid, also checks the user in
UserController.setDiscordDefault = function (_id, callback) {
      User.findOneAndUpdate({
        _id,
        }, {
          $set: {
            'discord.verified': false,
          }
        }, {
          new: true
        },
        callback);
    };

// Chat API for Merge

// Given a jwt, determine which user id this jwt corresponds to

module.exports = UserController;
