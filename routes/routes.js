// Dependencies
var express = require( 'express' );
var router = express.Router();
var fetch = require( 'node-fetch' );
var googleAuth = require( './googleAuth.js' );

var SlackClient = require( '@slack/client' );
    var RTMClient = SlackClient.RTMClient;
    var WebClient = SlackClient.WebClient;

if( !process.env.SLACK_ACCESS_TOKEN ) { throw new Error( 'process.env.SLACK_ACCESS_TOKEN not found' ); process.exit(1); return; }
if( !process.env.SLACK_BOT_ACCESS_TOKEN ) { throw new Error( 'process.env.SLACK_BOT_ACCESS_TOKEN not found' ); process.exit(1); return; }
if( !process.env.API_AI_ACCESS_TOKEN ) { throw new Error( 'process.env.API_AI_ACCESS_TOKEN not found' ); process.exit(1); return; }
if( !process.env.API_AI_DEV_TOKEN ) { throw new Error( 'process.env.API_AI_DEV_TOKEN not found' ); process.exit(1); return; }
if( !process.env.DOMAIN ) { throw new Error( 'process.env.DOMAIN not found' ); process.exit(1); return; }

var SLACK_ACCESS_TOKEN = process.env.SLACK_ACCESS_TOKEN;
var SLACK_BOT_ACCESS_TOKEN = process.env.SLACK_BOT_ACCESS_TOKEN;
var API_AI_ACCESS_TOKEN = process.env.API_AI_ACCESS_TOKEN;
var API_AI_DEV_TOKEN = process.env.API_AI_DEV_TOKEN;
var DOMAIN = process.env.DOMAIN;

// MongoDB Mongoose Models
var Models = require( '../models/models.js' );
    var User = Models.User;
    var Invite = Models.Invite;
    var Reminder = Models.Reminder;
    var Meeting = Models.Meeting;

/** Create and set up Slackbot RTM ( Real Time Messaging ) and its event listener
  * Create and set up WebClient for Slackbot
  */
var rtm = new RTMClient( SLACK_BOT_ACCESS_TOKEN );
rtm.start();
var web = new WebClient( SLACK_BOT_ACCESS_TOKEN );

// Handle Slack-Bot messages - delivering and receiving.
// If the User has not given permissions for Google Calendar, prompt the User to do so.
rtm.on( 'message', ( event ) => {
    // The Slack-Bot only responds to regular user messages, and not to message edits, deletes, server messages etc.
    if( event.subtype ) return;
    // Check if User exists on Database ( MongoDB ) --- If not, create a User
    var slackId = event.user;
    User.findOne( { slackId: slackId } )
    .catch( userFindError => console.log( "User Find Error:", userFindError ) )
    .then( foundUser => {
        // If it is a new User, save a new User, and ask for Google Permissions
        if( !foundUser ) {
            console.log( "RTM Msg: New User: Log in through Google" );
            var newUser = new User({ slackId: slackId });
            newUser.save()
            .catch( userSaveError => console.log( "User Save Error:", userSaveError ) )
            .then( savedUser => {
                web.chat.postMessage({
                    "channel": event.channel,
                    "text": "New User, Google Log In: " + DOMAIN + "auth?auth_id=" + savedUser._id
                });
            });
        }
        // If it is a new User, or if the User's token doesn't exist or has expired, ask for Google Permissions again
        else if( !foundUser.googleTokens || foundUser.googleTokens.expiry_date < Date.now() ) {
            console.log( "RTM Msg: User's Google Authentication token expired" );
            web.chat.postMessage({
                "channel": event.channel,
                "text": "Google Session token expired, Log in Again: " + DOMAIN + "auth?auth_id=" + foundUser._id
            });
        }
        // If the Slack Bot has a pending request from the User, ask the User to Cancel or Confirm it
        else if( foundUser.status ) {
            console.log( "RTM Msg: User has a Pending request" );
            web.chat.postMessage({
                "channel": event.channel,
                "text": "Looks like you have a response to answer, please Confirm or Cancel."
            });
        }
        // Else, give the User's request to the Slack Bot, and give the Slack Bot's response back to the User
        else {
            console.log( "RTM Msg: User gives a new request to Slack-Bot" );
            var intent;
            // Get a List of all Users in the Slack Workspace, to convert Slack id codes into Slack usernames
            var userSlackIdArray = [];
            var userNameArray = [];
            var userInvitedIndexes = [];    // For Meeting invitees, these are the Indexes of User Slack Id's for userSlackIdArray
            // Fetch User Data for the current Slack Workspace
            fetch( 'https://slack.com/api/users.list?token=' + SLACK_ACCESS_TOKEN, {
                headers: { "content-type": "application/x-www-form-urlencoded" }
            })
            .then( response => response.json() )
            // Save Slack Id: Username pair
            .then( userList => {
                for( var i = 0; i < userList.members.length; i++ ) {
                    userSlackIdArray.push( userList.members[i].id );
                    userNameArray.push( userList.members[i].real_name );
                }
                // In the User's Message, replace Slack Id's with Usernames
                for( var i = 0; i < userSlackIdArray.length; i++ ) {
                    event.text = event.text.replace( "<@" + userSlackIdArray[i] + ">", userNameArray[i] );
                }
            })
            // Send User's Message to API.AI
            .then( () => {
                return fetch( 'https://api.dialogflow.com/v1/query?v=20150910', {
                    method: 'POST',
                    headers: { "Authorization": "Bearer " + API_AI_ACCESS_TOKEN, "Content-Type": "application/json" },
                    body: JSON.stringify({
                        sessionId: "aixm84625",
                        lang: 'en',
                        query: event.text
                    })
                });
            })
            .then( response => response.json() )
            // Get Response from API.AI
            .then( response => {
                // If the User's request is incomplete, the Slack-Bot asks for more information.
                // If the User gives a greeting, the Slack-Bot does the same.
                if( response.result.actionIncomplete
                || response.result.action === "welcome"
                || response.result.metadata.intentName === "welcome" ) {
                    intent = null;
                    return web.chat.postMessage({
                        "channel": event.channel,
                        "text": response.result.fulfillment.speech
                    });
                }
                // Handle event when the User's request is complete
                var newStatus = {};
                newStatus.intent = intent = response.result.metadata.intentName;
                newStatus.subject = ( response.result.parameters.subject ? response.result.parameters.subject.join( ' ' ) : null );
                newStatus.startTime = response.result.parameters.start_time;
                newStatus.endTime = response.result.parameters.end_time;
                newStatus.date = response.result.parameters.date;
                newStatus.datePeriod = response.result.parameters[ "date-period" ];
                newStatus.invitees = response.result.parameters.invitees;     // Invitees for Meetings
                foundUser.status = newStatus;
                // For Reminders, ask the User for confirmation before setting the Reminder event
                if( intent === "reminderme:add" ) {
                    return web.chat.postMessage({
                        "channel": event.channel,
                        "attachments": [{
                            "text": response.result.fulfillment.speech,
                            "fallback": "Unable to confirm a Reminder",
                            "callback_id": "reminderConfirm",
                            "actions": [
                                { "type": "button", "name": "select", "value": "yes", "text": "Confirm" },
                                { "type": "button", "name": "select", "value": "no", "text": "Cancel", "style": "danger" }
                            ]
                        }]
                    });
                }
                // For Meetings, find all participants with valid Slack Id's or Slack Usernames
                else if( intent === "meeting:add" ) {
                    var userFindPromiseArray = [];
                    for( var i = 0; i < newStatus.invitees.length; i++ ) {
                        for( var j = 0; j < userSlackIdArray.length; j++ ) {
                            if( newStatus.invitees[i] === userSlackIdArray[j] || newStatus.invitees[i] === userNameArray[j] ) {
                                userFindPromiseArray.push( User.findOne( { slackId: userSlackIdArray[i] } );
                                userInvitedIndexes.push( j );
                                break;
                            }
                        }
                    }
                    return Promise.all( userFindPromiseArray )
                }
            })
            // For Meetings, If the User is not found, and the SlackId is valid, create a new User with that SlackId
            .then( userFindReponseArray => {
                if( intent !== "meeting:add" ) return;
                var foundUserArray = [];
                for( var i = 0; i < userFindReponseArray.length; i++ ) {
                    var currentSlackId = userSlackIdArray[ userInvitedIndexes[i] ];
                    if( userFindReponseArray[i] ) foundUserArray.push( userFindReponseArray[i] );
                    else foundUserArray.push( new User({ slackId: currentSlackId }).save() );
                }
                return Promise.all( foundUserArray );
            })
            // For Meetings, check each User's Google Permissions. If not given, ask that User for Google Permissions.
            .then( foundUserArray => {
                if( intent !== "meeting:add" ) return;
                // If everyone has given Google Permissions, then check their Google Calendars.
                // If not, ask those that haven't given Permissions to give permissions.
                var userGooglePermissionArray = [];
                var allUsersRegistered = true;
                for( var i = 0; i < foundUserArray.length; i++ ) {
                    if( !foundUserArray[i].googleTokens || foundUserArray[i].googleTokens.expiry_date < Date.now() ) {
                        allUsersRegistered = false;
                    }
                    else {
                        userGooglePermissionArray.push( foundUserArray[i] );
                    }
                }
                return Promise.all( userGooglePermissionArray );
            })
            .then( () => foundUser.save() )
            .catch( error => console.log( "Error forwaring User message to Api.AI:", error ) );
        }   // End of Else Statement, which forwarded a User's message to Slack-Bot
    }); // End of User.FindOne
});

// Routes
router.post( '/', ( req, res ) => { res.send("Connected to Slack Scheduler Bot") });

// Google Calendar Authentication - Prompt the User if they have not given permission
router.get( '/auth', ( req, res ) => {
    var url = googleAuth.generateAuthUrl( req.query.auth_id );
    res.redirect( url );
});

// Callback after a User has logged in through Google
router.get( '/connect/callback', ( req, res ) => {
    if( !req.query.code ) { return res.send( "No Code/Token found, try again." ); }
    googleAuth.getToken( req.query.code )
    .catch( codeGetError => res.status(500).send( "Google OAuth2 Code Get Error:", codeGetError ) )
    // Save the User's Google Tokens in the Mongo Database
    .then( tokens => {
        var state = JSON.parse( decodeURIComponent( req.query.state ) );
        var userId = state.auth_id;
        return User.findByIdAndUpdate( userId, { googleTokens: tokens } ).exec();
    })
    .catch( userUpdateError => res.status(500).send( "User Update Error: " + userUpdateError ) )
    .then( updatedUser => {
        if( !updatedUser ) return res.status(500).send( "User not Found, invalid userId" );
        res.send( "Logged in through Google. You can now make requests to SchedulerBot. \nYou can close this window and go back to Slack." );
    });
});

// Handle event when User clicks "Cancel" or "Confirm" on the Slack-Bot's interactive message
router.post( '/slack/action', ( req, res ) => {
    var payload = JSON.parse( req.body.payload );
    var confirmSelect = payload.actions[0].value;
    var slackId = String( payload.user.id );
    var responseString = "";
    var currentUser;
    
    // Handle when the User cancels the request
    if( confirmSelect !== "yes" ) {
        User.findOneAndUpdate( { slackId: slackId }, { status: null } ).exec()
        .then( () => res.send( ":heavy_multiplication_x: Cancelled request" ) )
        .catch( error => {
            console.log( "Error Cancelling Request: " + error );
            res.send( ":heavy_multiplication_x: Error Cancelling Request: " + error );
        });
        return;
    }
    // If the User Confirmed the request, Generate a Message for the Slack-Bot to send back to the User, based on the User's Request
    User.findOne( { slackId: slackId }, ( userFindError, foundUser ) => {
        if( userFindError ) return res.status(500).send( "User Find Error, " + userFindError );
        if( !foundUser ) return res.status(500).send( "User not Found, invalid userId" );
        currentUser = foundUser;
        var intent;
        switch( foundUser.status.intent ) {
            case "reminderme:add": intent = "Reminder"; break;
            case "meeting:add": intent = "Meeting"; break;
            default: intent = "Cancel";
        }
        var startTime = foundUser.status.startTime;
        var endTime = foundUser.status.endTime;
        var date = foundUser.status.date;
        var subject = foundUser.status.subject || "Meeting";
        var invitees = foundUser.status.invitees;
        // Generate Response String, that has request information
        responseString += ":heavy_check_mark: Confirmed ";
        responseString += intent;
        if( subject ) { responseString += ' to "' + subject + '"'; }
        if( invitees && invitees.length > 0 ) {
            responseString += " with";
            if( invitees.length === 1 ) responseString += ' ' + invitees[0];
            else {
                for( var i = 0 ; i < invitees.length; i++ ) {
                    responseString += " " + invitees[i];
                    if( i === invitees.length - 2 ) responseString += ', and';
                    else if( i === invitees.length < invitees.length - 2 ) responseString += ',';
                }
            }
        }
        if( startTime ) { responseString += " at " + startTime; }
        if( date ) responseString += " on " + date;
        responseString += '.';
        // Add a Google Calendar Event (Reminder or Meeting), based on the User's request
            // Reminders are All-Day events in Google Calendar
        // Save a Reminder or Meeting in the Database
        switch( intent ) {
            case "Reminder": {
                var newReminder = new Reminder({
                    subject: subject,
                    day: date,
                    slackId: slackId
                });
                Promise.all( [ newReminder.save(), googleAuth.createReminder( foundUser.googleTokens, subject, date ) ] )
                // Clear user's pending request
                .then( () => {
                    currentUser.status = null;
                    return currentUser.save();
                })
                // Send the User a message based on the Request, and how it was handled
                .then( () => res.send( responseString ) )
                .catch( error => {
                    currentUser.status = null;
                    currentUser.save();
                    console.log( "Error Confirming Request: " + error );
                    res.send( ":heavy_multiplication_x: Error Confirming Request: " + error );
                });
                break;
            }
            case "Meeting": {
                var startDateTime = new Date( date + 'T' + startTime );
                var endDateTime = ( endTime ? new Date( date + 'T' + endTime ) : new Date( startDateTime.getTime() + 1000*60*foundUser.defaultMeetingLength ) );
                var validMeeting = true;
                // Get Slack Id and Username pair
                var username;           // Current User's username
                var userNameObj = {};   // Every User's Slack Id and Username
                fetch( 'https://slack.com/api/users.list?token=' + SLACK_ACCESS_TOKEN, {
                    headers: { "content-type": "application/x-www-form-urlencoded" }
                })
                .then( response => response.json() )
                .then( userList => {
                    // Save Slack Id: Username pair
                    for( var i = 0; i < userList.members.length; i++ ) {
                        if( userList.members[i].id === foundUser.slackId ) username = userList.members[i].real_name;
                        userNameObj[ userList.members[i].id ] = userList.members[i].real_name;
                    }
                    return Meeting.find( {} ).exec();
                })
                // Check if the User has Meetings today (max 3), and check for conflicting timeslots for the Meeting, based on startDateTime and endDateTime.
                .then( foundMeetingsArray => {
                    var count = 0;
                    for( var i = 0; i < foundMeetingsArray.length; i++ ) {
                        // Only look at Meetings for the same day as the requested day
                        if( foundMeetingsArray[i].startDate.getDate() === startDateTime.getDate()
                        && foundMeetingsArray[i].startDate.getMonth() === startDateTime.getMonth()
                        && foundMeetingsArray[i].startDate.getYear() === startDateTime.getYear() ) {
                            // Check for Overlaping timeslots
                            if( foundMeetingsArray[i].startDate <= startDateTime && startDateTime < foundMeetingsArray[i].endDate 
                            || foundMeetingsArray[i].startDate <= endDateTime && endDateTime < foundMeetingsArray[i].endDate ) {
                                validMeeting = false; return;
                            }
                            // Check number of Meetings for the requested day
                            if( foundMeetingsArray[i].requesterId === foundUser.slackId ) { count++; continue; }
                            for( var j = 0; j < foundMeetingsArray[i].invitees.length; j++ ) {
                                if( foundMeetingsArray[i].invitees[j] === username ) { count++; break; }
                            }
                        }
                        if( count >= 3 ) { validMeeting = false; return; }
                    }
                })
                .then( () => {
                    if( validMeeting ) {
                        var newMeeting = Meeting({
                            startDate: startDateTime,
                            endDate: endDateTime,
                            invitees: invitees,
                            subject: subject,
                            createdAt: Date.now(),
                            requesterId: slackId
                        });
                        Promise.all( [ newMeeting.save(), googleAuth.createMeeting( foundUser.googleTokens, subject, invitees, startDateTime, endDateTime ) ] )
                    }
                    else {
                        responseString = ":heavy_multiplication_x: Conflicting timeslot for Meeting.";
                    }
                })
                // Clear user's pending request
                .then( () => {
                    currentUser.status = null;
                    return currentUser.save();
                })
                // Send the User a message based on the Request, and how it was handled
                .then( () => res.send( responseString ) )
                .catch( error => {
                    currentUser.status = null;
                    currentUser.save();
                    console.log( "Error Confirming Request: " + error );
                    res.send( ":heavy_multiplication_x: Error Confirming Request: " + error );
                });
                break;
            }   // End of case: intent === "Meeting"
            default: {
                responseString = ":heavy_multiplication_x: Cancelled request."
                currentUser.status = null;
                currentUser.save()
                // Send the User a message based on the Request, and how it was handled
                .then( () => res.send( responseString ) )
                .catch( error => {
                    currentUser.status = null;
                    currentUser.save();
                    console.log( "Error Confirming Request: " + error );
                    res.send( ":heavy_multiplication_x: Error Cancelling Request: " + error );
                });
            }
        }   // End of Switch statement for intent
    }); // End of User.FindOne
});

module.exports = router;
