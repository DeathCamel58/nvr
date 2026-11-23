const tv = {
  // Common words of the TV mode
  back: 'Back',
  cancel: 'Cancel',
  save: 'Save',
  done: 'Done',
  create: 'Create',
  remove: 'Delete',
  settings: 'Settings',
  cameras: 'Cameras',
  sound: 'Sound',
  noAddress: 'no address',
  offlineSuffix: ' · offline',
  soundOnSuffix: ' · sound on',

  // Layouts
  defaultLayoutName: 'Main',
  newLayoutName: 'Layout {{number}}',
  layouts: 'Layouts',
  layout: 'Layout',
  currentLayout: 'current',
  layoutMeta: '{{size}} · cameras: {{cameras}}',
  layoutMetaSound: '{{size}} · cameras: {{cameras}} · sound on',
  sizeOne: 'one camera',
  sizeTwo: 'two cameras',
  sizeMany: 'cameras: {{size}}',

  // Grid screen
  layoutEmpty: 'The layout is empty',
  layoutEmptyHint: 'Choose the cameras to show on this screen.',
  chooseCameras: 'Choose cameras',
  soundOff: 'Turn sound off',
  soundOn: 'Turn sound on',
  toGrid: 'Back to grid',
  loadingCameras: 'Loading cameras…',
  okOpenCamera: 'OK — open camera',
  okToggleSound: 'OK — toggle sound',
  gridOneCamera: 'One camera',
  gridLabelMany: '{{columns}}×{{rows}} · cameras: {{size}}',

  // Camera tile
  reconnecting: 'Reconnecting…',
  streamError: 'Error: {{message}}',
  streamUnavailable: 'Stream unavailable',

  // Layout editor
  howManyCameras: 'How many cameras to show',
  layoutCamerasSelected: 'Cameras in layout: {{selected}} of {{size}} selected',
  layoutOrderHint:
    'The order you pick sets the positions: the first camera goes to the top left corner. In a dense grid ({{min}} cameras or more) tile labels are hidden: on a small tile they cover the picture.',
  gridFull: 'Grid is full',
  sizeLabelOne: 'One',
  sizeLabelTwo: 'Two',
  sizeLabelCount_one: '{{count}} camera',
  sizeLabelCount_other: '{{count}} cameras',

  // Screen settings
  screenSettings: 'Screen settings',
  tileContent: 'What to show on a tile',
  showNameTitle: 'Camera name',
  showNameHint: 'A label at the bottom of the tile. Handy when there are many cameras that are easy to mix up.',
  showStatusTitle: 'Connection status',
  showStatusHint:
    'A colored dot in the corner. A camera that dropped out looks like a black rectangle: without the dot you cannot tell whether the app or the camera is broken.',
  showClockTitle: 'Clock',
  showClockHint:
    'Frame time. It shows at once that the stream is lagging: nothing else gives away a frozen picture.',
  okButtonTitle: '"OK" button on a tile',
  okActionTitle: 'What to do on press',
  okActionHint:
    'Open the camera full screen or toggle its sound. The second option is handy when you need sound often: you do not have to leave full screen view every time.',
  openFullscreen: 'Open full screen',
  toggleSound: 'Toggle sound',
  soundEnabledTitle: 'Sound on',
  soundEnabledHint:
    'On a TV only the selected camera is heard: several sources blend into noise.',
  volume: 'Volume: {{percent}}%',
  volumeHint:
    'Volume applies to the camera audio stream. Large steps are easier to set with a remote, so there are buttons instead of a slider.',
  soundCameraTitle: 'Which camera you hear',
  soundCameraHint:
    'Only one camera plays at a time. Cameras without a microphone will not start an audio stream — that is normal.',
};

export default tv;
