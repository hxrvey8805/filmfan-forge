// Authentication needs the current online document, never an old offline shell.
// Workbox matches pathname + search, so include query and trailing-slash boundaries.
export const authNavigationPattern = /^\/(?:auth|reset-password)(?:[/?]|$)/i;
