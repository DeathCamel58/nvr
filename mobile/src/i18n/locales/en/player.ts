const player = {
  connecting: 'Connecting…',
  fallback: 'WebRTC failed to start, switching to the fallback transport…',
  // Без объяснения причины: сюда попадает и отсутствующий поток, и сбой
  // сети при запросе адресов — утверждать «у камеры нет потока» нельзя.
  unavailable: 'Stream unavailable.',
};

export default player;
