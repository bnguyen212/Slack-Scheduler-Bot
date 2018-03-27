// Dependencies
var express = require( 'express' );
var path = require( 'path' );
var bodyParser = require( 'body-parser' );
var routes = require( '../routes/routes.js' );
var app = express();

// Middleware
app.use( bodyParser.json() );
app.use( bodyParser.urlencoded({ extended: false }) );
app.use( express.static(path.join(__dirname, 'public') ) );

app.use( '/', routes );

app.use( function( req, res, next ) {
    var err = new Error( 'Not Found' );
    err.status = 404;
    next( err );
});

module.exports = app;
