#!/usr/bin/env node
/**
 * Slack Scheduler that runs every Midnight
 * Checks all Reminders for Today and Tomorrow
 * Sends a message to Users for their Reminders
 * Removes the Reminder if it is for Today
 */

// Dependencies
var SlackClient = require( '@slack/client' );
    var WebClient = SlackClient.WebClient;

if( !process.env.SLACK_BOT_ACCESS_TOKEN ) { throw new Error( 'process.env.SLACK_BOT_ACCESS_TOKEN not found' ); process.exit(1); return; }
var SLACK_BOT_ACCESS_TOKEN = process.env.SLACK_BOT_ACCESS_TOKEN;

var web = new WebClient( SLACK_BOT_ACCESS_TOKEN );

// MongoDB Mongoose Models
var Models = require( '../models/models.js' );
    var Reminder = Models.Reminder;

function dailyReminder() {
    Reminder.find( {} ).exec()
    .then( foundReminderArray => {
        var today = new Date();
        var promiseArray = [];
        // Find all Reminders in Mongoose Database for Today and Tomorrow
        for( var i = 0; i < foundReminderArray.length; i++ ){
            var reminder = foundReminderArray[i];
            var reminderDate = new Date( reminder.day + "T00:00:00" );
            var timeDiff = reminderDate - today;
            if( ( timeDiff >= -1000*20 ) && ( timeDiff <= 1000*60*60*24*2 - 1000*20 ) ) {
                // For Each Reminder, Send a Message to that Slack User
                // If the Reminder is for Today, remove that Reminder from the Database
                if( timeDiff <= 1000*60*60*24 - 1000*20 ) {
                    promiseArray.push( web.chat.postMessage({
                        "channel": reminder.slackId,
                        "text": "Reminder for Today: " + reminder.subject
                    }) );
                    promiseArray.push( reminder.remove() );
                }
                else {
                    promiseArray.push( web.chat.postMessage({
                        "channel": reminder.slackId,
                        "text": "Reminder for Tomorrow: " + reminder.subject
                    }) );
                }
            }
        }
        return Promise.all( promiseArray );
    })
    .then( () => process.exit(0) )
    .catch( error => console.log( error ) );
}

dailyReminder();
