'use strict';

// Application Dependencies
const express = require('express');
const superagent = require('superagent');
const cors = require('cors');
const pg = require('pg');

// Load environment variables from .env file
require('dotenv').config();

// Application Setup
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Database Setup
//            postgres protocol
//                            my uname/pw           domain : port/database
const client = new pg.Client(process.env.DATABASE_URL);
client.connect();

// API Routes
app.get('/location', (request, response) => {
  searchToLatLong(request.query.data)
    .then(location => response.send(location))
    .catch(error => handleError(error, response));
});

app.get('/weather', lookup);
app.get('/events', getEvents);


// Make sure the server is listening for requests
app.listen(PORT, () => console.log(`Listening on ${PORT}`));

// Error handler
function handleError(err, res) {
  console.error(err);
  if (res) res.status(500).send('Sorry, something went wrong');
}

// Models
function Location(query, res) {
  this.search_query = query;
  this.formatted_query = res.body.results[0].formatted_address;
  this.latitude = res.body.results[0].geometry.location.lat;
  this.longitude = res.body.results[0].geometry.location.lng;
}

function Weather(day) {
  this.forecast = day.summary;
  this.time = new Date(day.time * 1000).toString().slice(0, 15);
}

function Event(event) {
  this.link = event.url;
  this.name = event.name.text;
  this.event_date = new Date(event.start.local).toDateString();
  this.summary = event.summary;
}

function searchToLatLong(query) {
  // check if query in database
  return searchDB(query)
    .then( (data) => {
      console.log('we made it');
      console.log(data);
      // if data in db, use data from db and send result
      if(data.rowCount > 0) {
        // use data from db and send result
        console.log('we are sending data from the database');
        return data.rows[0];
      } else {
        // otherwise, grab data from gmaps, save to db, and send result
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${process.env.GEOCODE_API_KEY}`;

        return superagent.get(url)
          .then(res => {
            let newLocation = new Location(query, res);
            let insertStatement = 'INSERT INTO location ( search_query, formatted_query, latitude, longitude ) VALUES ( $1, $2, $3, $4 );';
            let insertValues = [ newLocation.search_query, newLocation.formatted_query, newLocation.latitude, newLocation.longitude ];
            client.query(insertStatement, insertValues);
            return newLocation;
          })
          .catch(error => handleError(error));
      }
    });
}

function getWeather(request, response) {
  
  const url = `https://api.darksky.net/forecast/${process.env.WEATHER_API_KEY}/${request.query.data.latitude},${request.query.data.longitude}`;

  return superagent.get(url)
    .then(result => {
      const weatherSummaries = result.body.daily.data.map(day => {
        let insertStatement = 'INSERT INTO weather ( summary, post_date, location_id) VALUES ( $1, $2, $3);';
        let insertValues = [day.summary, day.time, request.query.id];
        client.query(insertStatement, insertValues);
        return new Weather(day);
      });

      response.send(weatherSummaries);
    })
    .catch(error => handleError(error, response));
}


function getEvents(request, response) {
  const url = `https://www.eventbriteapi.com/v3/events/search?location.address=${request.query.data.formatted_query}`;

  superagent.get(url)
    .set('Authorization', `Bearer ${process.env.EVENTBRITE_API_KEY}`)
    .then(result => {
      const events = result.body.events.map(eventData => {
        const event = new Event(eventData);
        return event;
      });

      response.send(events);
    })
    .catch(error => handleError(error, response));
}

function searchDB(query){
  let sqlStatement = 'SELECT * FROM location WHERE search_query = $1;';
  let values = [ query ];
  return client.query(sqlStatement, values);
}

// function query(tbl, query_id){
//   let sqlStatement = `SELECT * FROM ${tbl} WHERE location_id = $1;`;
//   let values = [ query_id ];
//   return client.query(sqlStatement, values);
// }
function exist(data){
  return data.rowCount > 0;
}

function lookup(query_parameter, functionExist, functionNotExist){
  return client.query(query_parameter.sqlStatement, query_parameter.values)
    .then((data) => {
      if (functionExist(data)){
        return data.rows;
      } else {
        functionNotExist(request, response);
      }
    });
}

function weatherLookup(request,response){
  let param = {
    sqlStatement : 'SELECT * FROM weather WHERE location_id = $1;',
    values : [ request.query.id ]
  };
  lookup(param, exist, getWeather);
}