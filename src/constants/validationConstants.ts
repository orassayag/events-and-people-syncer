export const VALIDATION_CONSTANTS = {
  EMAIL: {
    MAX_LENGTH: 254,
    MIN_LENGTH: 3,
  },
  PHONE: {
    MIN_DIGITS: 1,
    MAX_DIGITS: 100,
  },
  PORT: {
    MIN: 1024,
    MAX: 65535,
  },
  CACHE: {
    TTL_HOURS: 24,
    TTL_MS: 24 * 60 * 60 * 1000,
  },
};
