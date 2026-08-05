// Shared type definitions for grillo-parlante-api
// These types are used across API endpoints and can be imported by frontend

// ============================================
// Base Booking Types
// ============================================

export type BookingType = 'hotel' | 'flight' | 'event';

export interface BaseBooking {
  type: BookingType;
  destination: string;
  checkIn: string | null;
  checkOut: string | null;
  confirmation: string | null;
  guests: string | number | null;
  guestNames: string[] | null;
  hotel: string | null;
  notes: string | null;
}

export interface FlightBooking {
  flightNumber: string | null;
  airline: string | null;
  departureAirport: string | null;
  arrivalAirport: string | null;
  departureTime: string | null;
  arrivalTime: string | null;
  departureDate: string | null;
  arrivalDate: string | null;
  terminal: string | null;
  gate: string | null;
}

export interface EventBooking {
  eventName: string | null;
  eventDate: string | null;
  eventTime: string | null;
  venue: string | null;
  ticketType: string | null;
  ticketCount: string | number | null;
}

export interface ParsedBooking extends BaseBooking {
  flight: FlightBooking;
  event: EventBooking;
}

// ============================================
// API Input/Output Types
// ============================================

export interface ParseBookingInput {
  images?: string[];  // base64 data URLs
  ocrText?: string;
}

export interface ParseBookingOutput extends ParsedBooking {
  pages: number;
  _ocrProvider?: 'gpt4o' | 'ocrspace' | 'provided' | 'auto';
  _validationWarnings?: Record<string, string[]>;
  _ocrFailed?: boolean;
  _note?: string;
  _rawOcr?: string;
  _isFallback?: boolean;
}

// ============================================
// Itinerary Types
// ============================================

export interface ItineraryPreferences {
  style?: 'relaxed' | 'balanced' | 'adventure' | 'cultural';
  vibe?: 'budget' | 'moderate' | 'luxury';
  interests?: string[];
  wish?: string;
  year?: number;
}

export interface ItineraryInput {
  destination: string;
  checkIn: string;
  checkOut: string;
  hotel?: string;
  preferences?: ItineraryPreferences;
  type?: BookingType;
}

export interface ItineraryActivity {
  time: string;
  icon: string;
  title: string;
  desc: string;
  price: string;
}

export interface ItineraryDay {
  day: string;
  label: string;
  icon: string;
  subtitle: string;
  location: string;
  activities: ItineraryActivity[];
}

export interface ItineraryTip {
  icon: string;
  title: string;
  desc: string;
}

export interface ItineraryOutput {
  destination: string;
  checkIn: string;
  checkOut: string;
  totalDays: number;
  hotel: string | null;
  type: BookingType;
  days: ItineraryDay[];
  tips: ItineraryTip[];
  _failedDays: number;
}

// ============================================
// Chat Types
// ============================================

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatInput {
  messages?: ChatMessage[];
  tripContext?: string;
  tripId?: string;
}

export interface ChatHistoryMessage {
  id: string;
  user_id: string;
  trip_id: string | null;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ============================================
// Trip Types
// ============================================

export type TripStatus = 'active' | 'completed' | 'cancelled';

export interface Trip {
  id: string;
  user_id: string;
  title: string | null;
  destination: string;
  start_date: string | null;
  end_date: string | null;
  booking_type: BookingType | null;
  booking_data: Record<string, unknown> | null;
  itinerary: Record<string, unknown> | null;
  preferences: Record<string, unknown> | null;
  status: TripStatus;
  created_at: string;
  updated_at: string;
}

export interface TripSaveInput {
  title?: string;
  destination: string;
  start_date?: string | null;
  end_date?: string | null;
  booking_type?: BookingType;
  booking_data?: Record<string, unknown>;
  itinerary?: Record<string, unknown>;
  preferences?: Record<string, unknown>;
  status?: TripStatus;
}

export interface TripListOutput extends Trip {}

// ============================================
// Health Check Types
// ============================================

export interface HealthDependency {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unconfigured';
  httpStatus?: number;
  detail?: string;
  error?: string;
}

export interface HealthOutput {
  status: 'healthy' | 'degraded';
  timestamp: string;
  latencyMs: number;
  version: string;
  environment: string;
  dependencies: {
    supabase: HealthDependency;
    deepseek: HealthDependency;
    openai: HealthDependency;
  };
}

// ============================================
// Auth Types
// ============================================

export interface AuthUser {
  id: string;
  email?: string;
  aud?: string;
  role?: string;
  created_at?: string;
  updated_at?: string;
}

// ============================================
// Error Types
// ============================================

export interface ApiError {
  error: string;
  details?: Record<string, string[]>;
  detail?: string;
}