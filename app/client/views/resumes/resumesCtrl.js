const moment = require('moment');
const swal = require('sweetalert');
const pdfjsLib = require('pdfjs-dist');
const JSZip = require('jszip');
const FileSaver = require('file-saver');
var zip = new JSZip();
var selected_resumes;


// The workerSrc property shall be specified.
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.js`;

angular.module('reg')
  .controller('ResumesCtrl', [
    '$scope',
    '$state',
    '$stateParams',
    '$http',
    'UserService',
    function ($scope, $state, $stateParams, $http, UserService) {

      $scope.pages = [];
      $scope.users = [];
      $scope.ids = []; 
      $scope.selectedUsers = new Set(); 
      $scope.skillChoices = [];
      $scope.usStudent = false;

      $scope.selectedSkills = [];
      $scope.selectedGrad = [];
      $scope.gradChoices = [
        { semester: 'Fall 2020', selected: false },
        { semester: 'Spring 2021', selected: false },
        { semester: 'Fall 2021', selected: false },
        { semester: 'Spring 2022', selected: false },
        { semester: 'Fall 2022', selected: false },
        { semester: 'Spring 2023', selected: false },
        { semester: 'Fall 2023', selected: false },
      ]

      // Semantic-UI moves modal content into a dimmer at the top level.
      // While this is usually nice, it means that with our routing will generate
      // multiple modals if you change state. Kill the top level dimmer node on initial load
      // to prevent this.
      $('.ui.dimmer').remove();
      // Populate the size of the modal for when it appears, with an arbitrary user.
      $scope.selectedUser = {};
      $scope.selectedUser.sections = generateSections({
        status: '',
        confirmation: {
          dietaryRestrictions: []
        },
        profile: ''
      });

      populateSkills();

      function populateSkills() {
        $http
          .get('/assets/skills.csv')
          .then(function (res) {
            res.data.split('\n').forEach(element => {
              $scope.skillChoices.push({ 'name': element, 'selected': false });
            });
            $scope.skillChoices.push({ 'name': 'Other', 'selected': false });
          });
      }

      function updatePage(data) {
        $scope.users = data.users;
        $scope.currentPage = data.page;
        $scope.pageSize = data.size;
        $scope.totalSize = (data.totalPages == 1) ? $scope.users.length : $scope.pageSize * (data.totalPages-1);

        var p = [];
        for (var i = 0; i < data.totalPages; i++) {
          p.push(i);
        }
        $scope.pages = p;

        // check boxes of selected users on the page the user has changed to
        for(var i = 0; i < $scope.users.length; i++) { 
          var user = $scope.users[i];
          if($scope.selectedUsers.has(getUserKey(user))) {
            user.checked = true; 
          }
        }
      }

      $scope.onSelectYear = function(data) {
        if (data.selected) {
            $scope.selectedGrad.push(data.semester);
        } else {
            $scope.selectedGrad = $scope.selectedGrad.filter(semester => semester !== data.semester)
        }
        updateFilters();
      }

      $scope.onClearYears = function() {
        $scope.selectedGrad = [];
        updateFilters();
      }

      $scope.onSelectSkill = function(data) {
        if (data.selected) {
            $scope.selectedSkills.push(data.name);
        } else {
            $scope.selectedSkills = $scope.selectedSkills.filter(name => name !== data.name)
        }
        updateFilters();
      }

      $scope.onClearSkills = function() {
        $scope.selectedSkills = [];
        updateFilters();
      }

      UserService
        .getPage($stateParams.page, $stateParams.size, $stateParams.query, $stateParams.gradYears, $stateParams.skills, true)
        .then(response => {
          updatePage(response.data);
        });

      $scope.$watch('queryText', function (queryText) {
        UserService
          .getPage(0, $scope.pageSize, queryText, $scope.selectedGrad.toString(), $scope.selectedSkills.toString(), $scope.usStudent, true)
          .then(response => {
            updatePage(response.data);
          });
      });

      $scope.$watch('usStudent', function (usStudent) {
        UserService
          .getPage(0, $scope.pageSize, $scope.queryText, $scope.selectedGrad.toString(), $scope.selectedSkills.toString(), usStudent, true)
          .then(response => {
            updatePage(response.data);
          });
      });

      
      $scope.goToPage = function (page) {
        UserService
          .getPage(page, $scope.pageSize || 50, $scope.queryText, $scope.selectedGrad.toString(), $scope.selectedSkills.toString(), $scope.usStudent, true)
          .then(response => {
            updatePage(response.data);
          });
      };

      function updateFilters() {
        UserService
        .getPage(0, $scope.pageSize, $scope.queryText, $scope.selectedGrad.toString(), $scope.selectedSkills.toString(), $scope.usStudent, true)
        .then(response => {
          updatePage(response.data);
        });


      }

      function formatTime(time) {
        if (time) {
          return moment(time).format('MMMM Do YYYY, h:mm:ss a');
        }
      }

      $scope.updateCheckedCount = function(user){
        if(user.checked) {
          if (user._id) {
            $scope.selectedUsers.add(getUserKey(user));
          }
        } else { 
          $scope.selectedUsers.delete(getUserKey(user)); 
          // zip.remove("resume" + user._id + ".pdf");
        }
      }

      $scope.getCheckedCount = function() {
        return $scope.selectedUsers.size; 
      };

      $scope.downloadCheckedResumes = function() {
        var it = $scope.selectedUsers.values();
        var val = null; 
        var index = 0; 
        var promises = []
        var names = []
        var ids = []
        while (index < $scope.selectedUsers.size) {
          val=it.next().value;
          var id = val.substring(0, val.indexOf('_'));
          ids.push(id);
          names.push(val.substring(val.indexOf('_')+1));
          promises.push(UserService.getResume(id));
          index++;
        }
        Promise.allSettled(promises).then((responses) => {
          for (var i = 0; i < responses.length; i++) {
            zip.file("resume_" + names[i] + "_" + ids[i] + ".pdf", responses[i].value.data.Body.data);
          }
          zip.generateAsync({type:"blob"}).then(function(content) {
            FileSaver.saveAs(content, "resumes.zip");
            $scope.selectedUsers.clear();
          });
        });
      } 

      $scope.selectAllResumesOnCurrPage = function() {
        for(var i = 0; i < $scope.users.length; i++) { 
          var user = $scope.users[i];
          user.checked = true; 
          $scope.selectedUsers.add(getUserKey(user));
        }
      };

      $scope.downloadAllMatchingResumes = function() {
       UserService
        .getIDs($scope.queryText, $scope.selectedGrad.toString(), $scope.selectedSkills.toString(), $scope.usStudent, true)
        .then(response => {
          for (var i = 0; i < response.data.users.length; i++) {
            $scope.selectedUsers.add(response.data.users[i]);
          }
          $scope.downloadCheckedResumes();
        });
      }

      $scope.deselectAllResumes = function() {
         for(var i = 0; i < $scope.users.length; i++) { 
           $scope.users[i].checked = false; 
         }
         $scope.selectedUsers.clear();
       };

      function getResume(user) {
        if (user._id) {
          UserService
            .getResume(user._id)
            .then(pdfPath => {
              // Asynchronous download of PDF
              var loadingTask = pdfjsLib.getDocument(pdfPath.data.Body);
              loadingTask.promise.then(function (pdf) {

                // Fetch the first page
                var pageNumber = 1;
                pdf.getPage(pageNumber).then(function (page) {

                  var scale = 1.0;
                  var viewport = page.getViewport({
                    scale: scale
                  });

                  // Prepare canvas using PDF page dimensions
                  var canvas = document.getElementById('resume-canvas');
                  var context = canvas.getContext('2d');
                  canvas.height = viewport.height;
                  canvas.width = viewport.width;

                  // Render PDF page into canvas context
                  var renderContext = {
                    canvasContext: context,
                    viewport: viewport
                  };
                  var renderTask = page.render(renderContext);
                  renderTask.promise.then(function () {
                    // console.log('Page rendered');
                  });
                });
              }, function (reason) {
                // PDF loading error
                console.error(reason);
              });
            });
        }
      }

      function getUserKey(user) {
        return user._id + "_" + user.profile.lastName + "_" + user.profile.firstName
      }

      $scope.hasSelectedResumes = function() {
        return $scope.selectedUsers.size > 0;
      }

      $scope.hasMatchingResumes = function() {
        return $scope.totalSize > 0;
      }

      $scope.rowClass = function (user) {
        if (user.admin) {
          return 'admin';
        }
        if (user.status.confirmed) {
          return 'positive';
        }
        if (user.status.admitted && !user.status.confirmed) {
          return 'warning';
        }
      };

      function selectUser(user) {
        $scope.selectedUser = user;
        $scope.selectedUser.sections = generateSections(user);
        getResume(user);
        $('.long.user.modal')
          .modal('show');
      }

      function generateSections(user) {
        return [{
          name: 'Basic Info',
          fields: [{
            name: 'Created On',
            value: formatTime(user.timestamp)
          }, {
            name: 'Last Updated',
            value: formatTime(user.lastUpdated)
          }, {
            name: 'Confirm By',
            value: formatTime(user.status.confirmBy) || 'N/A'
          }, {
            name: 'Checked In',
            value: formatTime(user.status.checkInTime) || 'N/A'
          }, {
            name: 'Email',
            value: user.email
          }, {
            name: 'Team',
            value: user.teamCode || 'None'
          }]
        }, {
          name: 'Profile',
          fields: [{
            name: 'Name',
            value: user.profile.name
          }, {
            name: 'Gender',
            value: user.profile.gender
          }, {
            name: 'School',
            value: user.profile.school
          }, {
            name: 'Graduation Year',
            value: user.profile.graduationTime
          }, {
            name: 'Description',
            value: user.profile.description
          }, {
            name: 'Essay',
            value: user.profile.essay
          }]
        }, {
          name: 'Confirmation',
          fields: [{
            name: 'Phone Number',
            value: user.confirmation.phoneNumber
          }, {
            name: 'Dietary Restrictions',
            value: user.confirmation.dietaryRestrictions.join(', ')
          }, {
            name: 'Shirt Size',
            value: user.confirmation.shirtSize
          }, {
            name: 'Major',
            value: user.confirmation.major
          }, {
            name: 'Github',
            value: user.confirmation.github
          }, {
            name: 'Website',
            value: user.confirmation.website
          }, {
            name: 'Needs Hardware',
            value: user.confirmation.wantsHardware,
            type: 'boolean'
          }, {
            name: 'Hardware Requested',
            value: user.confirmation.hardware
          }]
        }, {
          name: 'Hosting',
          fields: [{
            name: 'Needs Hosting Friday',
            value: user.confirmation.hostNeededFri,
            type: 'boolean'
          }, {
            name: 'Needs Hosting Saturday',
            value: user.confirmation.hostNeededSat,
            type: 'boolean'
          }, {
            name: 'Gender Neutral',
            value: user.confirmation.genderNeutral,
            type: 'boolean'
          }, {
            name: 'Cat Friendly',
            value: user.confirmation.catFriendly,
            type: 'boolean'
          }, {
            name: 'Smoking Friendly',
            value: user.confirmation.smokingFriendly,
            type: 'boolean'
          }, {
            name: 'Hosting Notes',
            value: user.confirmation.hostNotes
          }]
        }, {
          name: 'Travel',
          fields: [{
            name: 'Needs Reimbursement',
            value: user.confirmation.needsReimbursement,
            type: 'boolean'
          }, {
            name: 'Received Reimbursement',
            value: user.confirmation.needsReimbursement && user.status.reimbursementGiven
          }, {
            name: 'Address',
            value: user.confirmation.address ? [
              user.confirmation.address.line1,
              user.confirmation.address.line2,
              user.confirmation.address.city,
              ',',
              user.confirmation.address.state,
              user.confirmation.address.zip,
              ',',
              user.confirmation.address.country,
            ].join(' ') : ''
          }, {
            name: 'Additional Notes',
            value: user.confirmation.notes
          }]
        }];
      }

      $scope.selectUser = selectUser;

    }
  ]);