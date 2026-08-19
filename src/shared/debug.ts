export const isDebugEnabled = import.meta.env.DEV || new URLSearchParams(window.location.search).get('debug') === '1';
