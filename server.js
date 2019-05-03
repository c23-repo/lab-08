/**
 *  Reference: CodeFellow seattle-301d56 class demo codes
 */

'use strict';

// Application Dependencies
const express = require('express');
const superagent = require('superagent');
const pg = require('pg');
const cors = require('cors');

// Load environment variables from .env file
require('dotenv').config();

// Application Setup
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static('./city-explorer-front-end'));
// Database Setup
const client = new pg.Client(process.env.DATABASE_URL);
client.connect();
client.on('error', err => console.error(err));

// API Routes
app.get('/location', getLocation);
app.get('/weather', getWeather);
app.get('/events', getEvents);

// Make sure the server is listening for requests
app.listen(PORT, () => console.log(`Listening on ${PORT}`));


// Error handler
function handleError(err, res) {
  console.error(err);
  if (res) res.status(500).send('Sorry, something went wrong');
}

// Look for the results in the database
function lookup(options) {
  const SQL = `SELECT * FROM ${options.tableName} WHERE location_id=$1;`;
  const values = [options.location];

  client.query(SQL, values)
    .then(result => {
      if (result.rowCount > 0) {
        options.cacheHit(result);
      } else {
        options.cacheMiss();
      }
    })
    .catch(error => handleError(error));
}

// Models
function Location(query, res) {
  this.tableName = 'locations';
  this.search_query = query;
  this.formatted_query = res.body.results[0].formatted_address;
  this.latitude = res.body.results[0].geometry.location.lat;
  this.longitude = res.body.results[0].geometry.location.lng;
}

Location.lookupLocation = (location) => {
  const SQL = `SELECT * FROM locations WHERE search_query=$1;`;
  const values = [location.query];

  return client.query(SQL, values)
    .then(result => {
      if (result.rowCount > 0) {
        location.cacheHit(result);
      } else {
        location.cacheMiss();
      }
    })
    .catch(console.error);
};


//Function to save location
function saveLocation(theLocation){
  let sql = `INSERT INTO locations (search_query, formatted_query, latitude, longitude) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING id;`;
  let values = [theLocation.search_query, theLocation.formatted_query, theLocation.latitude, theLocation.longitude];

  return client.query(sql, values)
    .then(result => {
      theLocation.id = result.rows[0].id;
      return theLocation;
    });
}


function Weather(day) {
  this.tableName = 'weathers';
  this.forecast = day.summary;
  this.time = new Date(day.time * 1000).toDateString();
}

Weather.tableName = 'weathers';
Weather.lookup = lookup;

// Function to save weather into database
function saveWeather(theWeather, loc_id){
  let sql = `INSERT INTO ${theWeather.tableName} (forecast, time, location_id) VALUES ($1, $2, $3);`;
  let values = [theWeather.forecast, theWeather.time, loc_id];

  client.query(sql, values);
}

function Event(event) {
  this.tableName = 'events';
  this.link = event.url;
  this.name = event.name.text;
  this.event_date = new Date(event.start.local).toDateString();
  this.summary = event.summary;
}

Event.tableName = 'events';
Event.lookup = lookup;

// Function to save Event
function saveEvent(theEvent, loc_id){
  let sql = `INSERT INTO ${theEvent.tableName} (link, name, event_date, summary, location_id) VALUES ($1, $2, $3, $4, $5);`;
  let values = [theEvent.link, theEvent.name, theEvent.event_date, theEvent.summary, loc_id];

  client.query(sql, values);
}

// Function to get location
function getLocation(request, response) {
  Location.lookupLocation({
    tableName: Location.tableName,

    query: request.query.data,

    cacheHit: function (result) {
      response.send(result.rows[0]);
    },

    cacheMiss: function () {
      getLocationAPI(request, response);
    }
  });
}

// Function to get weather
function getWeather(request, response) {
  Weather.lookup({
    tableName: Weather.tableName,

    location: request.query.data.id,

    cacheHit: function (result) {
      response.send(result.rows);
    },

    cacheMiss: function () {
      getWeatherAPI(request, response);
    }
  });
}

// Function to get events
function getEvents(request, response) {
  Event.lookup({
    tableName: Event.tableName,

    location: request.query.data.id,

    cacheHit: function (result) {
      response.send(result.rows);
    },

    cacheMiss: function () {
      getEventsAPI(request, response);
    }
  });
}

//Function to get events from Eventbrite
function getEventsAPI(request, response){
  let url = `https://www.eventbriteapi.com/v3/events/search?token=${process.env.EVENTBRITE_API_KEY}&location.address=${request.query.data.formatted_query}`;

  superagent.get(url)
    .then(result => {
      let events = result.body.events.map(eventData => {
        let event = new Event(eventData);
        saveEvent(event, request.query.data.id);
        return event;
      });

      response.send(events);
    })
    .catch(error => handleError(error, response));
}

// Function to get weather from Darksky API
function getWeatherAPI(request, response){
  let url = `https://api.darksky.net/forecast/${process.env.WEATHER_API_KEY}/${request.query.data.latitude},${request.query.data.longitude}`;

  superagent.get(url)
    .then(result => {
      let weatherSummaries = result.body.daily.data.map(day => {
        let summary = new Weather(day);
        saveWeather(summary, request.query.data.id);
        return summary;
      });
      response.send(weatherSummaries);
    })
    .catch(error => handleError(error, response));
}

// Function to get location on Google Maps API
function getLocationAPI(request, response){
  let url = `https://maps.googleapis.com/maps/api/geocode/json?address=${request.query.data}&key=${process.env.GEOCODE_API_KEY}`;

  return superagent.get(url)
    .then(result => {
      const location = new Location(request.query.data, result);
      saveLocation(location)
        .then(location => response.send(location));
    })
    .catch(error => handleError(error));
}
