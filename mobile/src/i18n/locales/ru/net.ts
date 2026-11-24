const net = {
  // Ошибки API (src/net/api.ts)
  clientForbidden:
    'Доступ в приложение для этой учётной записи закрыт. Обратитесь к администратору.',
  accountBlocked: 'Доступ в приложение заблокирован. Обратитесь к администратору.',
  invalidCredentials: 'Неверный логин или пароль',
  forbidden: 'Доступ запрещён: у пользователя нет прав',
  notFound: 'Не найдено на сервере',
  serverError: 'Ошибка сервера: {{message}}',
  serverStatus: 'Сервер ответил ошибкой {{status}}',
  timeout: 'Сервер не ответил вовремя. Проверьте адрес и доступность порта.',
  connectFailed:
    'Не удалось соединиться. Проверьте адрес, порт и то, что телефон в той же сети.',
  unknownError: 'Неизвестная ошибка',

  // Перехват ошибок JavaScript (crashGuard.ts)
  crashFatalTitle: 'Приложение столкнулось с ошибкой',
  crashTitle: 'Ошибка',

  // Проверка микрофона (mediaProbe.ts)
  micUnavailable: 'недоступно',
  micNoResponse: 'нет ответа за {{seconds}} с',
  micOk: 'ок',
  micAccessError: 'ошибка доступа',

  // Push-уведомления (push.ts, pushBackground.ts)
  alarmTitle: 'Тревога',
  intercomCallTitle: 'Звонок в домофон',
  intercomCallText: 'Кто-то звонит — ответьте или откройте дверь',

  // Живой просмотр (webrtc.ts)
  streamNotStarted: 'Поток не начал воспроизводиться',
};

export default net;
