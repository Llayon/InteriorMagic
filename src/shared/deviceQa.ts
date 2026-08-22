/** Opt-in physical-device QA mode. Independent from the developer/browser
 *  debug overlay (?debug=1/DEV): device QA must also work on the production
 *  Pages build inside real Telegram WebViews. */
export const isDeviceQaEnabled =
  typeof window !== 'undefined' && !!window.location && new URLSearchParams(window.location.search).get('deviceQa') === '1';