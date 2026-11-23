const tv = {
  // Общие слова телевизионного режима
  back: 'Назад',
  cancel: 'Отмена',
  save: 'Сохранить',
  done: 'Готово',
  create: 'Создать',
  remove: 'Удалить',
  settings: 'Настройки',
  cameras: 'Камеры',
  sound: 'Звук',
  noAddress: 'адрес не указан',
  offlineSuffix: ' · не в сети',
  soundOnSuffix: ' · звук включён',

  // Раскладки
  defaultLayoutName: 'Основная',
  newLayoutName: 'Раскладка {{number}}',
  layouts: 'Раскладки',
  layout: 'Раскладка',
  currentLayout: 'текущая',
  layoutMeta: '{{size}} · камер: {{cameras}}',
  layoutMetaSound: '{{size}} · камер: {{cameras}} · звук включён',
  sizeOne: 'одна камера',
  sizeTwo: 'две камеры',
  sizeMany: 'камер: {{size}}',

  // Экран сетки
  layoutEmpty: 'Раскладка пуста',
  layoutEmptyHint: 'Выберите камеры, которые будут показываться на этом экране.',
  chooseCameras: 'Выбрать камеры',
  soundOff: 'Выключить звук',
  soundOn: 'Включить звук',
  toGrid: 'К сетке',
  loadingCameras: 'Загружаю камеры…',
  okOpenCamera: 'ОК — открыть камеру',
  okToggleSound: 'ОК — включить звук',
  gridOneCamera: 'Одна камера',
  gridLabelMany: '{{columns}}×{{rows}} · камер: {{size}}',

  // Плитка камеры
  reconnecting: 'Переподключение…',
  streamError: 'Ошибка: {{message}}',
  streamUnavailable: 'Поток недоступен',

  // Редактор раскладки
  howManyCameras: 'Сколько камер показывать',
  layoutCamerasSelected: 'Камеры в раскладке: выбрано {{selected}} из {{size}}',
  layoutOrderHint:
    'Порядок выбора задаёт расположение: первая камера встанет в левый верхний угол. При плотной сетке ({{min}} камер и больше) подписи на плитках скрываются: в мелкой плитке они заслоняют изображение.',
  gridFull: 'Сетка заполнена',
  sizeLabelOne: 'Одна',
  sizeLabelTwo: 'Две',
  sizeLabelCount_one: '{{count}} камера',
  sizeLabelCount_few: '{{count}} камеры',
  sizeLabelCount_many: '{{count}} камер',
  sizeLabelCount_other: '{{count}} камер',

  // Настройки экрана
  screenSettings: 'Настройки экрана',
  tileContent: 'Что показывать на плитке',
  showNameTitle: 'Имя камеры',
  showNameHint: 'Подпись внизу плитки. Удобно, когда камер много и их легко перепутать.',
  showStatusTitle: 'Состояние связи',
  showStatusHint:
    'Цветной значок в углу. Пропавшая камера выглядит как чёрный прямоугольник — без значка непонятно, сломалось приложение или камера.',
  showClockTitle: 'Часы',
  showClockHint:
    'Время кадра. По нему сразу видно, что поток отстал: замершую картинку ничто другое не выдаёт.',
  okButtonTitle: 'Кнопка «ОК» на плитке',
  okActionTitle: 'Что делать при нажатии',
  okActionHint:
    'Открыть камеру на весь экран или переключить её звук. Второй вариант удобен, когда звук нужен часто: не нужно каждый раз выходить из полноэкранного просмотра.',
  openFullscreen: 'Открыть на весь экран',
  toggleSound: 'Переключить звук',
  soundEnabledTitle: 'Звук включён',
  soundEnabledHint:
    'На телевизоре слышно только выбранную камеру: несколько источников сливаются в шум.',
  volume: 'Громкость: {{percent}}%',
  volumeHint:
    'Громкость применяется к звуковому потоку камеры. Регулировать её пультом удобнее крупными шагами, поэтому кнопки, а не ползунок.',
  soundCameraTitle: 'Звук какой камеры слышно',
  soundCameraHint:
    'Одновременно звучит только одна камера. У камер без микрофона звуковой поток не запустится — это нормально.',
};

export default tv;
