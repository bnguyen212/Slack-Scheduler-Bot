// Dependencies
var express = require( 'express' );
var router = express.Router();

var google = require( 'googleapis' );
var googleAuth = require( 'google-auth-library' );

if( !process.env.GOOGLE_CLIENT_ID ) { throw new Error( 'process.env.GOOGLE_CLIENT_ID not found' ); process.exit(1); return; }
if( !process.env.GOOGLE_CLIENT_SECRET ) { throw new Error( 'process.env.GOOGLE_CLIENT_SECRET not found' ); process.exit(1); return; }
if( !process.env.DOMAIN ) { throw new Error( 'process.env.DOMAIN not found' ); process.exit(1); return; }

var GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
var GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
var DOMAIN = process.env.DOMAIN;

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

router.post( '/event', ( req, res ) => {
    res.json({ text: req.body.msg });
});

router.post( '/slack/action', ( req, res ) => {
    console.log( req.body.value );
});

module.exports = router;
