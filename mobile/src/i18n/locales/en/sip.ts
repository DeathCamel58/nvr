const sip = {
  serverConnectionLost: 'connection to the server lost',
  lineNotConnected: 'line not connected: no link to the PBX',
  noMicrophone: 'the phone did not provide a microphone',
  callStartFailed: 'could not start the call',
  answerFailed: 'could not answer',
  inviteNotSent:
    'call not sent: the phone did not provide media or has not finished preparing the network',
  stationNotResponding: 'the PBX is not responding: no answer for 10 s, call canceled',
  callFailed: 'call failed',
  passwordRejected: 'the server rejected the line password: sign out and sign in again',
  unknownLine: 'the server does not know this line: it is not set up in the intercom settings',
  registrationRejected: 'the server rejected the registration',
  registrationFailed: 'could not register with Asterisk',
  telephonyNotConfigured: 'Telephony is not configured on the server',
  lineFetchFailed: 'could not get the line',
  notificationTitle: 'Intercom',
  incomingCall: 'Incoming call',
  callTitle: 'Call',
  lineOnline: 'Line {{number}} · online',
  lineOffline: 'Line {{number}} · no connection',
  lineConnecting: 'Line {{number}} · connecting…',
  microphoneRequiredTitle: 'Microphone access required',
  microphoneRequiredCall:
    'Allow the app to use the microphone in the phone settings, otherwise the call cannot be made.',
  microphoneRequiredAnswer: 'You cannot answer a call without a microphone.',
};

export default sip;
