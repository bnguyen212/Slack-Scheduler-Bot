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
    var Task = Models.Task;
    var Meeting = Models.Meeting;

/**
 * Create and set up Slackbot RTM ( Real Time Messaging ) and its event listener
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
    User.findOne( { slackId: slackId } ).exec()
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
            fetch( 'https://api.dialogflow.com/v1/query?v=20150910', {
                method: 'POST',
                headers: { "Authorization": "Bearer " + API_AI_ACCESS_TOKEN, "Content-Type": "application/json" },
                body: JSON.stringify({
                    sessionId: "aixm84625",
                    lang: 'en',
                    query: event.text
                })
            })
            .catch( aiError => { console.log( "Api AI Error: " + aiError ); } )
            .then( response => response.json() )
            .then( response => {
                // If the User's request is incomplete, or the Slack-Bot asks for more information.
                // If the User gives a greeting, the Slack-Bot does the same.
                if( response.result.actionIncomplete || response.result.action === "welcome" || response.result.metadata.intentName === "welcome" ) {
                    web.chat.postMessage({
                        "channel": event.channel,
                        "text": response.result.fulfillment.speech
                    });
                    return;
                }
                // Else, the User's request is complete, and the Slack-Bot asks the User to Cancel or Confirm it
                
                web.chat.postMessage({
                    "channel": event.channel,
                    "attachments": [{
                        "text": response.result.fulfillment.speech,
                        "fallback": "Unable to confirm a Reminder or Meeting",
                        "callback_id": "confirm",
                        "actions": [
                            { "type": "button", "name": "select", "value": "yes", "text": "Confirm" },
                            { "type": "button", "name": "select", "value": "no", "text": "Cancel", "style": "danger" }
                        ]
                    }]
                });
                
                var newStatus = {};
                newStatus.intent = response.result.metadata.intentName;
                newStatus.subject = ( response.result.parameters.subject ? response.result.parameters.subject.join( ' ' ) : null );
                newStatus.time = response.result.parameters.time;
                newStatus.date = response.result.parameters.date;
                newStatus.datePeriod = response.result.parameters[ "date-period" ];
                newStatus.invitees = response.result.parameters.invitees;     // Invitees for Meetings
                foundUser.status = newStatus;
                return foundUser.save();
            })
            .catch( userSaveError => console.log( "User Save Error:", userSaveError ) );
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
        res.send( "Logged in through Google. You can now make requests to SchedulerBot." );
    });
});

router.post( '/slack/action', ( req, res ) => {
    // Handle event when User clicks on "Cancel" or "Confirm"
    var payload = JSON.parse( req.body.payload );
    var confirmSelect = payload.actions[0].value;
    var slackId = String( payload.user.id );
    var responseString = "";
    
    User.findOne( { slackId: slackId } ).exec()
    .catch( userFindError => res.status(500).send( "User Find Error: " + userFindError ) )
    .then( foundUser => {
        if( !foundUser ) return res.status(500).send( "User not Found, invalid userId" );
        // Generate a Message for the Slack-Bot to send back to the User, based on the User's Request
        currentUser = foundUser;
        var intent;
        switch( foundUser.status.intent ) {
            case "reminderme:add": intent = "Reminder"; break;
            case "meeting:add": intent = "Meeting"; break;
        }
        var startTime = foundUser.status.time;
        var endTime = ( foundUser.status.endTime ? foundUser.status.endTime : foundUser.status.time + foundUser.defaultMeetingLength );
        var date = foundUser.status.date;
        var subject = foundUser.status.subject;
        var invitees = foundUser.status.invitees;
        
        if( confirmSelect === "yes" ) { responseString += ":heavy_check_mark: Confirmed "; }
        else if( confirmSelect === "no" ) { responseString += ":heavy_multiplication_x: Cancelled "; }
        responseString += intent;
        if( subject ) { responseString += ' to "' + subject + '"'; }
        if( invitees ) {
            responseString += " with";
            if( invitees.length === 0 ) responseString += invitees[0];
            else {
                for( var i = 0 ; i < invitees.length; i++ ) {
                    responseString += " " + invitees[i];
                    if( i === invitees.length - 2 ) responseString += ', and';
                    else if( i === invitees.length < invitees.length - 2 ) responseString += ',';
                }
            }
        }
        if( time ) { responseString += " at " + time; }
        if( date ) responseString += " on " + date;
        responseString += '.';
        
        if( confirmSelect === "yes" ) {
            switch( intent ) {
                case "Reminder": return googleAuth.createReminder( foundUser.googleTokens, subject, date );
                case "Meeting": return googleAuth.createMeeting( foundUser.googleTokens, subject, date, invitees, startTime, endTime );
            }
        }
    })
    .catch( calendarError => res.status(500).send( "Calendar Event Error: " + calendarError ) )
    .then( calendarResponse => {
        currentUser.status = null;
        currentUser.save();
        res.send( responseString );
    });
});

module.exports = router;
