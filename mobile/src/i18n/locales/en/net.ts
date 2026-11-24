const net = {
  // API errors (src/net/api.ts)
  clientForbidden:
    'Access to the app is closed for this account. Contact your administrator.',
  accountBlocked: 'Access to the app is blocked. Contact your administrator.',
  invalidCredentials: 'Wrong username or password',
  forbidden: 'Access denied: the user has no permission',
  notFound: 'Not found on the server',
  serverError: 'Server error: {{message}}',
  serverStatus: 'The server responded with error {{status}}',
  timeout: 'The server did not respond in time. Check the address and that the port is reachable.',
  connectFailed:
    'Could not connect. Check the address, the port, and that the phone is on the same network.',
  unknownError: 'Unknown error',

  // JavaScript error guard (crashGuard.ts)
  crashFatalTitle: 'The app ran into an error',
  crashTitle: 'Error',

  // Microphone probe (mediaProbe.ts)
  micUnavailable: 'unavailable',
  micNoResponse: 'no response in {{seconds}} s',
  micOk: 'ok',
  micAccessError: 'access error',

  // Push notifications (push.ts, pushBackground.ts)
  alarmTitle: 'Alarm',
  intercomCallTitle: 'Intercom call',
  intercomCallText: 'Someone is calling — answer or open the door',

  // Live view (webrtc.ts)
  streamNotStarted: 'The stream did not start playing',
};

export default net;
