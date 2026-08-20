// DeepSeek parsing - extracts structured booking data from OCR text
import fetch from 'node-fetch';
import { parsedBookingSchema } from '../schemas/index.js';

const DEEPSEEK_API = 'https://api.deepseek.com/v1/chat/completions';

const SYSTEM_PROMPT = `You are a travel document parser. Analyze the booking confirmation text and determine its TYPE, then extract the relevant fields.

Return ONLY valid JSON with this structure:
{
  "type": "hotel" | "flight" | "event",
  "destination": "City, Country — for flights: arrival city; for events: city where the event takes place",
  "checkIn": "Arrival/first day, e.g. Aug 22",
  "checkOut": "Departure/last day, e.g. Aug 28 — null for one-day events",
  "confirmation": "Booking reference number",
  "guests": "Number of people if visible, else null",
  "guestNames": "Array of guest/passenger names if visible, else null",
  "hotel": "For HOTEL: property name. For FLIGHT: airline + flight number. For EVENT: venue name. null if not applicable",
  "notes": "Any other useful info",
  "flight": {
    "flightNumber": "e.g. FR 2345 or null",
    "airline": "e.g. Ryanair or null",
    "departureAirport": "IATA code or city, e.g. BGY or null",
    "arrivalAirport": "e.g. CRL or null",
    "departureTime": "e.g. 14:35 or null",
    "arrivalTime": "e.g. 16:10 or null",
    "departureDate": "e.g. Aug 22 or null",
    "arrivalDate": "e.g. Aug 22 or null",
    "terminal": "e.g. T2 or null",
    "gate": "e.g. B14 or null"
  },
  "event": {
    "eventName": "e.g. Sagrada Familia, Primavera Sound 2026, Uffizi Museum",
    "eventDate": "e.g. Aug 24 or null",
    "eventTime": "e.g. 10:00 or null",
    "venue": "e.g. Park Güell or null",
    "ticketType": "e.g. Full, VIP, Adult or null",
    "ticketCount": "number of tickets or null"
  },
  "extraEvents": [
    {
      "eventName": "Secondary events in the SAME upload (e.g. excursion/museum/concert tickets uploaded alongside the main booking)",
      "eventDate": "e.g. Aug 26 or null",
      "eventTime": "e.g. 15:00 or null",
      "venue": "e.g. Krka National Park or null",
      "ticketType": "e.g. Adult or null",
      "ticketCount": "e.g. 2 or null"
    }
  ]
}

Rules:
- TYPE is the most important decision. Hotels mention rooms, check-in/out, nights. Flights mention airports, flight numbers, gates, boarding. Events mention museums, concerts, festivals, tickets, dates.
- For flights, "hotel" field = airline + flight number (e.g. "Ryanair FR2345").
- If it's a flight with a hotel too (holiday package), type stays "hotel" but include the flight info in the flight object.
- Never return null for destination — best guess always.
- If a field is not visible, use null (not empty string).
- If the upload contains MULTIPLE bookings (e.g. a hotel plus separate excursion/museum/concert tickets), type = the MAIN booking and list the other events in "extraEvents" (max 5). If the only booking is an event, type = "event" and leave extraEvents as [].
- For events: destination = the event's city if visible; if the ticket shows no city, use the venue name — never "Unknown".
- Events in extraEvents must NOT repeat the main event object.`;

export async function parseBookingWithDeepSeek(extractedText, apiKey) {
  if (!apiKey) {
    return { data: null, error: 'No DeepSeek API key' };
  }

  try {
    const response = await fetch(DEEPSEEK_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Booking text:\n${extractedText}\n\nExtract the booking info as JSON.` },
        ],
        max_tokens: 1600,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return { data: null, error: `DeepSeek ${response.status}: ${errText.slice(0, 150)}` };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Parse JSON from response
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch {}
      }
    }

    if (!parsed) {
      return { data: null, error: 'Failed to parse DeepSeek response as JSON' };
    }

    // Validate with Zod
    const result = parsedBookingSchema.safeParse(parsed);
    if (!result.success) {
      console.error('Zod validation failed:', result.error.flatten());
      // Return anyway but log the issue
      return { data: parsed, validationErrors: result.error.flatten() };
    }

    return { data: result.data, validationErrors: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}