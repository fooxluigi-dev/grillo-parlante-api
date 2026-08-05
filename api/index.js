// API v1 entry point - routes to versioned handlers
// This allows both /api/parse-booking and /api/v1/parse-booking to work

import parseBookingHandler from './v1/parse-booking.js';
import itineraryHandler from './v1/itinerary.js';
import chatHandler from './v1/chat.js';
import tripsHandler from './v1/trips.js';
import healthHandler from './v1/health.js';

const handlers = {
  'parse-booking': parseBookingHandler,
  'itinerary': itineraryHandler,
  'chat': chatHandler,
  'trips': tripsHandler,
  'health': healthHandler,
};

export default async function handler(req, res) {
  const urlParts = req.url.split('/').filter(Boolean);
  // Expected: /api/:endpoint
  const endpoint = urlParts[1]; // e.g., 'parse-booking', 'itinerary', etc.

  const h = handlers[endpoint];
  if (h) {
    return h(req, res);
  }

  // Also support /api/v1/:endpoint
  if (urlParts[0] === 'v1' && urlParts[1]) {
    const v1Handler = handlers[urlParts[1]];
    if (v1Handler) {
      return v1Handler(req, res);
    }
  }

  return res.status(404).json({
    error: 'Not found',
    availableEndpoints: Object.keys(handlers).map(e => `/api/${e}`).concat(
      Object.keys(handlers).map(e => `/api/v1/${e}`)
    ),
  });
}