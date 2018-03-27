// Dependencies
var express = require( 'express' );
var router = express.Router();

// MongoDB Mongoose Models
var Models = require( '../models/models.js' );
    var Users = Models.Users;
    var Invite = Models.Invite;
    var Task = Models.Task;
    var Meeting = Models.Meeting;

router.post( '/event', ( req, res ) => {
    res.json({ text: "Got Message" });
});


module.exports = router;
