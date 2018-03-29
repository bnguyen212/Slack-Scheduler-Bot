// Dependencies
// MongoDB Mongoose Models
var Models = require( '../models/models.js' );
    var User = Models.User;
    var Invite = Models.Invite;
    var Reminder = Models.Reminder;
    var Meeting = Models.Meeting;

function dailyReminder() {
    Reminder.find()
    .then( foundReminders => {
        var validReminders = [];
        var today = new Date().getTime();
      
        // Find all Reminders in Mongoose Database for Today and Tomorrow
        for( var i = 0; i<foundReminders.length; i++ ){
            var timeDiff = foundReminders[i].day.getTime() - today;
            if( timeDiff < 2*24*60*60*1000 && timeDiff > 0 ){
            // For Each Reminder, Send a Message to that Slack User
            
            // If the Reminder is for Today, remove that Reminder from the Database
            validReminders.push( deletePromise );
            }
        }
        return Promise.all( validReminders )
    })
    .then( reminderTaskArray => {
        
    })
}

dailyReminder();