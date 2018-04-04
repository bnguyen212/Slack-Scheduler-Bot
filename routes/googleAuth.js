var google = require( 'googleapis' );
var calendar = google.calendar( 'v3' );
var OAuth2 = google.auth.OAuth2;

if( !process.env.GOOGLE_CLIENT_ID ) { throw new Error( 'process.env.GOOGLE_CLIENT_ID not found' ); process.exit(1); return; }
if( !process.env.GOOGLE_CLIENT_SECRET ) { throw new Error( 'process.env.GOOGLE_CLIENT_SECRET not found' ); process.exit(1); return; }
if( !process.env.DOMAIN ) { throw new Error( 'process.env.DOMAIN not found' ); process.exit(1); return; }

var GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
var GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
var DOMAIN = process.env.DOMAIN;

var oauth2Client = new OAuth2( GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, DOMAIN + 'connect/callback' );

module.exports = {
    generateAuthUrl( auth_id ) {
        var authObj = {
            access_type: 'offline',
            prompt: 'consent',
            scope: [
                // 'https://www.googleapis.com/auth/userinfo.profile',
                'https://www.googleapis.com/auth/calendar',
                'https://www.googleapis.com/auth/plus.me'
            ]
        };
        if( auth_id ) {
            authObj.state = encodeURIComponent( JSON.stringify({ auth_id: auth_id }) );
        }
        return oauth2Client.generateAuthUrl( authObj );
    },
    getToken( code ) {
        return new Promise( function( resolve, reject ) {
            oauth2Client.getToken( code, function( codeGetError, tokens ) {
                if( codeGetError ) { reject( codeGetError ); return; }
                resolve( tokens );
            });
        });
    },
    createReminder( tokens, title, date ) {
        oauth2Client.setCredentials( tokens );
        return new Promise( function( resolve, reject ) {
            calendar.events.insert({
                auth: oauth2Client,
                calendarId: 'primary',
                resource: {
                    summary: title,
                    start: { date: date },
                    end: { date: date }
                }
            }, function( calendarError, calendarResponse ) {
                if( calendarError ) { reject( calendarError ); return }
                resolve( calendarResponse );
            });
        });
    },
    createMeeting( tokens, title, invitees, startDateTime, endDateTime ) {
        oauth2Client.setCredentials( tokens );
        return new Promise( function( resolve, reject ) {
            calendar.events.insert({
                auth: oauth2Client,
                calendarId: 'primary',
                resource: {
                    summary: title,
                    start: { dateTime: startDateTime },
                    end: { dateTime: endDateTime }
                }
            }, function( calendarError, calendarResponse ) {
                if( calendarError ) { reject( calendarError ); return }
                resolve( calendarResponse );
            });
        });
    },
    // Get Meetings for the next 7 business days
    // Assumes the Users will only set Meetings on business days ( weekdays )
    getMeetings( token ) {
        oauth2Client.setCredentials( tokens );
        var today = new Date();
        var sevenBusinessDaysAhead = today.getTime() + 1000*60*60*24*7;
        switch( today.getDay() ) {
        case 1: case 2: case 3:
            sevenBusinessDaysAhead += 1000*60*60*24*2; break;
        case 4: case 5:
            sevenBusinessDaysAhead += 1000*60*60*24*4; break;
        }
        return new Promise( function( resolve, reject ) {
            calendar.events.list({
                auth: oauth2Client,
                calendarId: 'primary',
                orderBy: 'startTime',
                timeMin: ( new Date() ).toISOString(),
                timeMax: new Date( sevenBusinessDaysAhead ).toISOString(),
                singleEvents: true
                
            }, function( calendarError, calendarResponse ) {
                if( calendarError ) { reject( calendarError ); return }
                resolve( calendarResponse );
            });
        });
    }
}