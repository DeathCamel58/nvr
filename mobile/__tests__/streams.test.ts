import {
  fallbackStreamKind,
  otherStreamKind,
  streamAvailability,
  streamHlsPath,
} from '../src/net/streams';
import type { StreamInfo } from '../src/types';

/**
 * Проверки выбора потока по ответу /cameras/{id}/stream.
 *
 * Сервер отдаёт пустые адреса потока, которого у камеры нет. Раньше
 * приложение этого не учитывало: на камере только с доп. потоком выбор
 * Main открывал пустой HLS-адрес, плеер не монтировался, и экран оставался
 * на заглушке. Логика вынесена из экрана, чтобы проверять такие ответы
 * без отрисовки компонентов.
 */

/** Ответ сервера для камеры только с дополнительным потоком (cam83). */
const subOnly: StreamInfo = {
  rtsp_url: '',
  hls_url: '',
  status: 'online',
  main_hls_url: '',
  sub_hls_url: '/api/v1/cameras/cam83/hls/sub/index.m3u8',
  main_rtsp_url: '',
  sub_rtsp_url: 'rtsp://camera/stream=1',
};

/** Ответ сервера для камеры с обоими потоками (cam84). */
const both: StreamInfo = {
  rtsp_url: 'rtsp://127.0.0.1:8554/cam84',
  hls_url: '/api/v1/cameras/cam84/hls/index.m3u8',
  status: 'online',
  main_hls_url: '/api/v1/cameras/cam84/hls/index.m3u8',
  sub_hls_url: '/api/v1/cameras/cam84/hls/sub/index.m3u8',
  main_rtsp_url: 'rtsp://camera/stream=0',
  sub_rtsp_url: 'rtsp://camera/stream=1',
};

/** Ответ сервера для камеры только с основным потоком (cam85). */
const mainOnly: StreamInfo = {
  rtsp_url: 'rtsp://127.0.0.1:8554/cam85',
  hls_url: '/api/v1/cameras/cam85/hls/index.m3u8',
  status: 'online',
  main_hls_url: '/api/v1/cameras/cam85/hls/index.m3u8',
  sub_hls_url: '',
  main_rtsp_url: 'rtsp://camera/stream=0',
  sub_rtsp_url: '',
};

describe('наличие потоков у камеры', () => {
  it('пока адреса не получены, решение не принимается', () => {
    expect(streamAvailability(null)).toBeNull();
  });

  it('камера только с дополнительным потоком: основной недоступен', () => {
    expect(streamAvailability(subOnly)).toEqual({ main: false, sub: true });
  });

  it('камера с обоими потоками: доступны оба', () => {
    expect(streamAvailability(both)).toEqual({ main: true, sub: true });
  });

  it('камера только с основным потоком: дополнительный недоступен', () => {
    expect(streamAvailability(mainOnly)).toEqual({ main: true, sub: false });
  });

  it('старый сервер без main_hls_url считается по общему hls_url', () => {
    expect(
      streamAvailability({
        hls_url: '/api/v1/cameras/old/hls/index.m3u8',
        sub_hls_url: '/api/v1/cameras/old/hls/sub/index.m3u8',
      }),
    ).toEqual({ main: true, sub: true });
  });
});

describe('замена отсутствующего потока', () => {
  it('вместо основного берётся дополнительный', () => {
    expect(fallbackStreamKind('main', { main: false, sub: true })).toBe('sub');
  });

  it('вместо дополнительного берётся основной', () => {
    expect(fallbackStreamKind('sub', { main: true, sub: false })).toBe('main');
  });

  it('существующий поток не подменяется', () => {
    expect(fallbackStreamKind('main', { main: true, sub: true })).toBe('main');
    expect(fallbackStreamKind('sub', { main: true, sub: true })).toBe('sub');
  });

  it('при отсутствии обоих потоков выбор остаётся прежним', () => {
    expect(fallbackStreamKind('main', { main: false, sub: false })).toBe('main');
    expect(fallbackStreamKind('sub', { main: false, sub: false })).toBe('sub');
  });

  it('противоположный поток определяется в обе стороны', () => {
    expect(otherStreamKind('main')).toBe('sub');
    expect(otherStreamKind('sub')).toBe('main');
  });
});

describe('адрес HLS выбранного потока', () => {
  it('дополнительный поток не подменяется адресом основного', () => {
    // Раньше здесь срабатывал общий hls_url, и камера без доп. потока
    // играла основной под видом дополнительного.
    expect(streamHlsPath(mainOnly, 'sub')).toBeNull();
    expect(streamHlsPath(mainOnly, 'main')).toBe(mainOnly.main_hls_url);
  });

  it('основной поток не подменяется адресом дополнительного', () => {
    expect(streamHlsPath(subOnly, 'main')).toBeNull();
    expect(streamHlsPath(subOnly, 'sub')).toBe(subOnly.sub_hls_url);
  });

  it('пока адрес не получен, HLS-пути нет', () => {
    expect(streamHlsPath(null, 'main')).toBeNull();
    expect(streamHlsPath(null, 'sub')).toBeNull();
  });
});
