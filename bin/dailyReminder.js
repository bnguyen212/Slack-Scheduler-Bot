#!/usr/bin/env node
/**
 * Slack Scheduler that runs every Midnight
 * Checks all Reminders for Today and Tomorrow
 * Sends a message to Users for their Reminders
 * Removes the Reminder if it is for Today
 */

// Dependencies
var SlackClient = require( '@slack/client' );
    var RTMClient = SlackClient.RTMClient;
    // var WebClient = SlackClient.WebClient;

if( !process.env.SLACK_ACCESS_TOKEN ) { throw new Error( 'process.env.SLACK_ACCESS_TOKEN not found' ); process.exit(1); return; }
if( !process.env.SLACK_BOT_ACCESS_TOKEN ) { throw new Error( 'process.env.SLACK_BOT_ACCESS_TOKEN not found' ); process.exit(1); return; }

var SLACK_ACCESS_TOKEN = process.env.SLACK_ACCESS_TOKEN;
var SLACK_BOT_ACCESS_TOKEN = process.env.SLACK_BOT_ACCESS_TOKEN;

var rtm = new RTMClient( SLACK_BOT_ACCESS_TOKEN );
rtm.start();
// var web = new WebClient( SLACK_BOT_ACCESS_TOKEN );

// MongoDB Mongoose Models
var Models = require( '../models/models.js' );
    var Reminder = Models.Reminder;

function dailyReminder() {
    Reminder.find( {} ).exec()
    .then( foundReminderArray => {
        var today = new Date().getTime();
        // Find all Reminders in Mongoose Database for Today and Tomorrow
        for( var i = 0; i < foundReminderArray.length; i++ ){
            var timeDiff = foundReminderArray[i].day.getTime() - today;
            if( timeDiff >= 0 && timeDiff <= 1000*60*60*24*2 ) {
                // For Each Reminder, Send a Message to that Slack User
                // If the Reminder is for Today, remove that Reminder from the Database
                if( timeDiff <= 1000*60*60*24 ) {
                    // web.chat.postMessage({
                        // "channel": foundReminderArray[i].slackId,
                        // "text": "Reminder for Today: " + foundReminderArray[i].subject
                    // });
                    rtm.sendMessage( "Reminder for Today: " + foundReminderArray[i].subject, foundReminderArray[i].slackId )
                    .then( res => console.log( 'Message sent: ', res.ts ) )
                    .catch( error => console.error );
                    foundReminderArray[i].remove( removeError => { if( removeError ) console.log( "Reminder Remove Error: " + removeError ); } );
                }
                else {
                    // web.chat.postMessage({
                        // "channel": foundReminderArray[i].slackId,
                        // "text": "Reminder for Tomorrow: " + foundReminderArray[i].subject
                    // });
                    rtm.sendMessage( "Reminder for Tomorrow: " + foundReminderArray[i].subject, foundReminderArray[i].slackId )
                    .then( res => console.log( 'Message sent: ', res.ts ) )
                    .catch( error => console.error );
                }
            }
        }
    })
    .then( () => process.exit(0) )
    .catch( error => console.log( error ) );
}

dailyReminder();
