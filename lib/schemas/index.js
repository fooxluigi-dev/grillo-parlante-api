import { z } from 'zod';

// Base fields common to all booking types
const baseBookingSchema = z.object({
  type: z.enum(['hotel', 'flight', 'event']),
  destination: z.string().min(1, 'Destination is required'),
  checkIn: z.string().nullable(),
  checkOut: z.string().nullable(),
  confirmation: z.string().nullable(),
  guests: z.union([z.string(), z.number()]).nullable(),
  guestNames: z.array(z.string()).nullable(),
  hotel: z.string().nullable(),
  notes: z.string().nullable(),
});

// Flight-specific fields
const flightSchema = z.object({
  flightNumber: z.string().nullable(),
  airline: z.string().nullable(),
  departureAirport: z.string().nullable(),
  arrivalAirport: z.string().nullable(),
  departureTime: z.string().nullable(),
  arrivalTime: z.string().nullable(),
  departureDate: z.string().nullable(),
  arrivalDate: z.string().nullable(),
  terminal: z.string().nullable(),
  gate: z.string().nullable(),
});

// Event-specific fields
const eventSchema = z.object({
  eventName: z.string().nullable(),
  eventDate: z.string().nullable(),
  eventTime: z.string().nullable(),
  venue: z.string().nullable(),
  ticketType: z.string().nullable(),
  ticketCount: z.union([z.string(), z.number()]).nullable(),
});

// Complete parsed booking schema
// flight/event are nullable: DeepSeek omits them for hotel bookings and
// a strict schema made the whole response drop destination/checkIn/checkOut.
export const parsedBookingSchema = baseBookingSchema.extend({
  flight: flightSchema.nullable().optional(),
  event: eventSchema.nullable().optional(),
});

// Input validation schemas
export const parseBookingInputSchema = z.object({
  images: z.array(z.string().url({ protocol: /^data:/ })).min(1, 'At least one image required').max(3, 'Max 3 images allowed').optional(),
  ocrText: z.string().optional(),
});

// Itinerary input schema
export const itineraryInputSchema = z.object({
  destination: z.string().min(1),
  checkIn: z.string().min(1),
  checkOut: z.string().min(1),
  hotel: z.string().optional(),
  preferences: z.object({
    style: z.enum(['relaxed', 'balanced', 'adventure', 'cultural']).optional(),
    vibe: z.enum(['budget', 'moderate', 'luxury']).optional(),
    interests: z.array(z.string()).optional(),
    wish: z.string().optional(),
    year: z.number().optional(),
  }).optional(),
  type: z.enum(['hotel', 'flight', 'event']).optional(),
});

// Chat input schema
export const chatInputSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
  })).optional(),
  tripContext: z.string().optional(),
});

// Trip save schema
export const tripSaveSchema = z.object({
  title: z.string().optional(),
  destination: z.string().min(1),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  booking_type: z.enum(['hotel', 'flight', 'event']).optional(),
  booking_data: z.record(z.unknown()).optional(),
  itinerary: z.record(z.unknown()).optional(),
  preferences: z.record(z.unknown()).optional(),
  status: z.enum(['active', 'completed', 'cancelled']).optional(),
});