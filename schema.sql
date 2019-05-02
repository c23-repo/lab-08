CREATE TABLE location (
  latitude DECIMAL NOT NULL,
  longitude DECIMAL NOT NULL,
  formatted_query VARCHAR(255) NOT NULL,
  search_query VARCHAR(255) NOT NULL,
  id SERIAL PRIMARY KEY
);

CREATE TABLE weather (
  summary TEXT NOT NULL,
  post_date DATE NOT NULL,
  location_id INTEGER NOT NULL, 
  id SERIAL PRIMARY KEY
);

CREATE TABLE events (
  location_id INTEGER NOT NULL,
  link TEXT NOT NULL,
  event_name TEXT NOT NULL,
  event_date DATE NOT NULL,
  summary TEXT NOT NULL,
  id SERIAL PRIMARY KEY
);
