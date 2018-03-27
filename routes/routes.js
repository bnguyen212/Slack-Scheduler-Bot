// Dependencies
var express = require( 'express' );
var router = express.Router();
var fetch = require( 'node-fetch' );

var google = require( 'googleapis' );
var googleAuth = require( 'google-auth-library' );
var SlackClient = require( '@slack/client' );
    var RTMClient = SlackClient.RTMClient;
    var WebClient = SlackClient.WebClient;

if( !process.env.GOOGLE_CLIENT_ID ) { throw new Error( 'process.env.GOOGLE_CLIENT_ID not found' ); process.exit(1); return; }
if( !process.env.GOOGLE_CLIENT_SECRET ) { throw new Error( 'process.env.GOOGLE_CLIENT_SECRET not found' ); process.exit(1); return; }
if( !process.env.DOMAIN ) { throw new Error( 'process.env.DOMAIN not found' ); process.exit(1); return; }

if( !process.env.SLACK_ACCESS_TOKEN ) { throw new Error( 'process.env.SLACK_ACCESS_TOKEN not found' ); process.exit(1); return; }
if( !process.env.SLACK_BOT_ACCESS_TOKEN ) { throw new Error( 'process.env.SLACK_BOT_ACCESS_TOKEN not found' ); process.exit(1); return; }
if( !process.env.API_AI_ACCESS_TOKEN ) { throw new Error( 'process.env.API_AI_ACCESS_TOKEN not found' ); process.exit(1); return; }
if( !process.env.API_AI_DEV_TOKEN ) { throw new Error( 'process.env.API_AI_DEV_TOKEN not found' ); process.exit(1); return; }

var GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
var GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
var DOMAIN = process.env.DOMAIN;

var SLACK_ACCESS_TOKEN = process.env.SLACK_ACCESS_TOKEN;
var SLACK_BOT_ACCESS_TOKEN = process.env.SLACK_BOT_ACCESS_TOKEN;
var API_AI_ACCESS_TOKEN = process.env.API_AI_ACCESS_TOKEN;
var API_AI_DEV_TOKEN = process.env.API_AI_DEV_TOKEN;

/**
 * Create and set up Slackbot RTM ( Real Time Messaging ) and its event listener
 * Create and set up WebClient for Slackbot
 */
var rtm = new RTMClient( SLACK_BOT_ACCESS_TOKEN );
rtm.start();
var web = new WebClient( SLACK_BOT_ACCESS_TOKEN );

rtm.on( 'message', ( event ) => {
    if( event.subtype === "bot_message" ) return;
    // Give Message to Api AI
    fetch( 'https://api.dialogflow.com/v1/query?v=20150910', {
        method: 'POST',
        headers: { "authorization": "Bearer " + API_AI_ACCESS_TOKEN, "content-type": "application/json" },
        body: {
            sessionId: "ai84625",
            lang: 'en',
            query: event.text
        }
    })
    .catch( aiError => { console.log( "Api AI Error: " + aiError ); } )
    .then( response => {
        console.log( response );
        if( response.result.actionIncomplete ) {
            web.chat.postMessage({
                "channel": event.channel,
                "text": response.result.fulfillment.speech
            });
            return;
        }
        web.chat.postMessage({
            "channel": event.channel,
            "text": event.text,
            "attachments": [{
                "text": response.result.fulfillment.speech,
                "fallback": "Unable to confirm a Reminder or Meeting",
                "callback_id": "confirm",
                "actions": [
                    { "type": "button", "name": "select", "value": "yes", "text": "Yes" },
                    { "type": "button", "name": "select", "value": "no", "text": "No" }
                ]
            }]
        });
    });
});

// MongoDB Mongoose Models
var Models = require( '../models/models.js' );
    var Users = Models.Users;
    var Invite = Models.Invite;
    var Task = Models.Task;
    var Meeting = Models.Meeting;

// Routes
router.get( '/auth', ( req, res ) => {
    if( !req.query.auth_id ) { throw new Error( 'auth_id not found (in query)' ); return; }
    var auth = new googleAuth();
    var oauth2Client = new auth.OAuth2( GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, DOMAIN + '/connect/callback' );
    var url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: [
          'https://www.googleapis.com/auth/userinfo.profile',
          'https://www.googleapis.com/auth/calendar'
        ],
        state: encodeURIComponent( JSON.stringify({
          auth_id: req.query.auth_id
        }))
    });
    res.redirect( url )
});

router.get( '/connect/callback', ( req, res ) => {
    if( !req.query.code ) {  }
});

router.post( '/slack/action', ( req, res ) => {
    var action = JSON.parse( req.body.payload );
    var actionValue = action.actions[0].value;
    console.log( actionValue );
});

module.exports = router;
