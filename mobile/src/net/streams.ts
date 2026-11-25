import type { StreamInfo } from '../types';

/** Тип потока камеры: основной или дополнительный. */
export type StreamKind = 'main' | 'sub';

/** Наличие потоков у камеры. */
export interface StreamAvailability {
  main: boolean;
  sub: boolean;
}

/**
 * Какие потоки у камеры действительно есть.
 *
 * Сервер очищает адреса того потока, которого у камеры нет: go2rtc не
 * регистрирует для него путь, и запрос по такому адресу вернул бы 404.
 * Проверяем и HLS, и RTSP: мобильный плеер ходит по HLS, но RTSP остаётся
 * признаком настроенного потока, если HLS-адрес по какой-то причине пуст.
 * Общий hls_url — старый адрес основного потока: серверы до появления
 * main_hls_url заполняли только его.
 *
 * null означает «данные ещё не получены» (или запрос не удался). В этом
 * случае поток не переключаем: при медленной сети приложение иначе увело
 * бы оператора с рабочего потока вслепую.
 */
export function streamAvailability(
  info: StreamInfo | null,
): StreamAvailability | null {
  if (!info) return null;
  return {
    main: Boolean(info.main_hls_url || info.main_rtsp_url || info.hls_url),
    sub: Boolean(info.sub_hls_url || info.sub_rtsp_url),
  };
}

/** Противоположный поток. */
export function otherStreamKind(kind: StreamKind): StreamKind {
  return kind === 'main' ? 'sub' : 'main';
}

/**
 * Какой поток показывать вместо запрошенного.
 *
 * Если запрошенного потока у камеры нет, возвращаем тот, что есть. Если
 * нет ни одного или данные ещё не пришли, оставляем выбор как есть:
 * подменять его наугад нельзя, иначе экран сам переключил бы рабочую
 * камеру на заведомо отсутствующий поток.
 */
export function fallbackStreamKind(
  kind: StreamKind,
  availability: StreamAvailability | null,
): StreamKind {
  if (!availability || availability[kind]) return kind;
  const other = otherStreamKind(kind);
  return availability[other] ? other : kind;
}

/**
 * Адрес HLS-плейлиста выбранного потока.
 *
 * Для дополнительного потока общий hls_url не подходит: это адрес
 * основного. Без этой проверки камера только с основным потоком играла бы
 * его под видом дополнительного, а камера только с дополнительным
 * показывала бы пустой адрес и навсегда оставалась на заглушке.
 */
export function streamHlsPath(
  info: StreamInfo | null,
  kind: StreamKind,
): string | null {
  if (!info) return null;
  if (kind === 'sub') return info.sub_hls_url || null;
  return info.main_hls_url || info.hls_url || null;
}
