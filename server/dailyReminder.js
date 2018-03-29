// Dependencies
// MongoDB Mongoose Models
var Models = require( '../models/models.js' );
    var User = Models.User;
    var Invite = Models.Invite;
    var Reminder = Models.Reminder;
    var Meeting = Models.Meeting;

function dailyReminder() {
    // Find all Reminders in Mongoose Database for Today and Tomorrow
    
    // For Each Reminder, Send a Message to that Slack User
        // Send a Message by using the route /remind/:userId
        // If the Reminder is for Today, remove that Reminder from the Database
    
}

dailyReminder();