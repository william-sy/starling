// Relay endpoint. Override via VITE_RELAY_URL in .env.local for dev.
export const RELAY_URL  = import.meta.env.VITE_RELAY_URL  ?? 'wss://messages.selectedwithtrust.com/ws';
export const ADMIN_URL  = import.meta.env.VITE_ADMIN_URL  ?? 'https://messages.selectedwithtrust.com/api/mwt';
