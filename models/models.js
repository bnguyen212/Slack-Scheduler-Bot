var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;

if ( !process.env.MONGODB_URI ) {
  console.log( 'Error: MONGODB_URI is not set. Did you run source env.sh ?' );
  throw new Error( 'Error: MONGODB_URI is not set. Did you run source env.sh ?' )
  process.exit(1);
  return;
}
mongoose.connect( process.env.MONGODB_URI );

var UserSchema = Schema({
  calenderAcc: {
    type: Object
  },
  defaultLength: {
    type: Number,
  },
  slackId: {
    type: String,
  },
  slackUsername: {
    type: String,
  },
  slackEmail: {
    type: String,
  },
  slackDmIds: {
    type: Array,
  },
  googleTokens: {
    type: Array
  }
});

var ReminderSchema = Schema({
  subject: {
    type: String,
    required: true
  },
  day: {
    type: String,
    required: true
  },
  eventId: {
    type: String
  },
  requesterId: {
    type: ObjectId,
    ref: 'User'
  },
});

var MeetingSchema = Schema({
  day: {
    type: String,
    required: true
  },
  time: {
    type: String,
    required: true
  },
  invitees: {
    type: Array,
    required: true
  },
  subject: {
    type: String,
  },
  location: {
    type: String,
  },
  meetingLength: {
    type: Number,
  },
  calenderFields: {
    type: Object,
  },
  status: {
    type: String
    /*  pending || scheduled  */
  },
  createdAt: {
    type: String
  },
  requesterId: {
    type: ObjectId,
    ref: 'User'
  },
});

var InviteSchema = Schema({
  eventId: {
    type: String,
  },
  inviteeId: {
    type: ObjectId,
    ref: 'User'
  },
  requesterId: {
    type: ObjectId,
    ref: 'User'
  },
  status: {
    type: String
  },
});


var Reminder = mongoose.model( 'Reminder', ReminderSchema );
var Meeting = mongoose.model( 'Meeting', MeetingSchema );
var User = mongoose.model( 'User', UserSchema );
var Invite = mongoose.model( 'Invite', InviteSchema );

module.exports = {
  Reminder: Reminder,
  Meeting: Meeting,
  User: User,
  Invite: Invite
};
