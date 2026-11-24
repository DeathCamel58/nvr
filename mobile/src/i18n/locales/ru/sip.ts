const sip = {
  serverConnectionLost: 'связь с сервером прервана',
  lineNotConnected: 'линия не подключена: нет связи со станцией',
  noMicrophone: 'телефон не выдал микрофон',
  callStartFailed: 'не удалось начать вызов',
  answerFailed: 'не удалось ответить',
  inviteNotSent: 'вызов не отправлен: телефон не выдал медиа или не закончил подготовку сети',
  stationNotResponding: 'станция не отвечает: ответа нет 10 с, вызов отменён',
  callFailed: 'вызов не состоялся',
  passwordRejected: 'сервер отклонил пароль линии: выйдите и войдите заново',
  unknownLine: 'сервер не знает такой линии: она не заведена в настройках домофонии',
  registrationRejected: 'сервер отклонил регистрацию',
  registrationFailed: 'не удалось зарегистрироваться на Asterisk',
  telephonyNotConfigured: 'Телефония на сервере не настроена',
  lineFetchFailed: 'не удалось получить линию',
  notificationTitle: 'Домофония',
  incomingCall: 'Входящий вызов',
  callTitle: 'Звонок',
  lineOnline: 'Линия {{number}} · на связи',
  lineOffline: 'Линия {{number}} · нет связи',
  lineConnecting: 'Линия {{number}} · подключение…',
  microphoneRequiredTitle: 'Нужен доступ к микрофону',
  microphoneRequiredCall:
    'Разрешите приложению доступ к микрофону в настройках телефона — иначе звонок не состоится.',
  microphoneRequiredAnswer: 'Без микрофона ответить на вызов нельзя.',
};

export default sip;
