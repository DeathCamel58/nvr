import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useApp } from '../state/AppContext';
import { describeNetworkError } from '../net/api';
import {
  fallbackStreamKind,
  otherStreamKind,
  streamAvailability,
  streamHlsPath,
  type StreamKind,
} from '../net/streams';
import LivePlayer from '../components/LivePlayer';
import PtzPanel from '../components/PtzPanel';
import { colors, radius, spacing } from '../theme';
import type { AudioStatus, Camera, StreamInfo } from '../types';

/**
 * Онлайн-просмотр камеры.
 *
 * Видео идёт по WebRTC (WHEP через бэкенд), при неудаче плеер сам переходит
 * на HLS. Транспорт выбирает не этот экран, а `LivePlayer`: здесь остаётся
 * только выбор потока и подписи.
 *
 * По умолчанию открывается дополнительный поток (704×576): он заметно
 * экономичнее по трафику и батарее, что важно за пределами локальной сети.
 * Если у камеры есть только основной, экран сразу открывает его: пустой
 * адрес отсутствующего потока не смонтировал бы плеер, и просмотр замер бы
 * на заглушке. Переключиться можно кнопкой — при этом поток на сервере
 * пересоздаётся, поэтому плеер закрывает прежнее соединение.
 */
export default function LiveScreen({
  camera,
  onBack,
}: {
  camera: Camera;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const { client, current, token } = useApp();
  const [stream, setStream] = useState<StreamInfo | null>(null);
  const [kind, setKind] = useState<StreamKind>('sub');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transport, setTransport] = useState<'webrtc' | 'hls' | null>(null);
  // Состояние звука: нужен признак обратного канала, чтобы не показывать
  // кнопку «Говорить» на камере без динамика.
  const [audio, setAudio] = useState<AudioStatus | null>(null);
  const [talking, setTalking] = useState(false);
  const [ptzError, setPtzError] = useState<string | null>(null);
  // Автоматический переход между потоками уже выполнялся.
  // Ограничение нужно, чтобы при отказе обоих потоков экран не
  // переключался между ними бесконечно.
  const [fellBack, setFellBack] = useState(false);

  /**
   * Какие потоки у камеры есть на самом деле.
   *
   * null — адреса ещё не получены: до этого момента выбор не трогаем.
   */
  const available = useMemo(() => streamAvailability(stream), [stream]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!client) return;
      setLoading(true);
      try {
        const info = await client.getStream(camera.id);
        if (!cancelled) {
          setStream(info);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(describeNetworkError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }

      // Статус звука запрашиваем отдельно: он ходит к камере (определение
      // кодека и обратного канала), поэтому его сбой не должен скрывать
      // видео — просмотр важнее.
      try {
        const status = await client.getAudioStatus(camera.id);
        if (!cancelled) setAudio(status);
      } catch {
        if (!cancelled) setAudio(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, camera.id]);

  /**
   * Адрес HLS-плейлиста выбранного потока — резервный путь.
   *
   * Нужен только на случай, когда WebRTC не поднимается. Сервер отдаёт
   * путь относительным, поэтому базовый адрес приклеивает плеер.
   */
  const hlsPath = useMemo(() => streamHlsPath(stream, kind), [stream, kind]);

  // Если выбранного потока у камеры нет — уводим на существующий.
  //
  // Сервер отдаёт пустые адреса для отсутствующего потока, и плеер с
  // пустым HLS-адресом не смонтируется: экран навсегда остался бы на
  // заглушке. Так просмотр Main у камеры только с доп. потоком (и Sub у
  // камеры только с основным) сам переходит на рабочую картинку.
  useEffect(() => {
    if (!available) return;
    const next = fallbackStreamKind(kind, available);
    if (next !== kind) setKind(next);
  }, [available, kind]);

  /** Поток, на который ведёт переключатель. */
  const otherKind = otherStreamKind(kind);
  // Переключатель ведёт только на существующий поток: иначе камера с
  // одним потоком открывала бы пустой адрес и снова показывала заглушку.
  // Пока адреса не получены, кнопка тоже неактивна — выбирать вслепую
  // нечего.
  const canSwitch = available ? available[otherKind] : false;

  const switchStream = () => {
    setFellBack(false);
    setError(null);
    setKind((value) => (value === 'sub' ? 'main' : 'sub'));
  };

  /**
   * Выбранный поток не поднялся ни по WebRTC, ни по HLS.
   *
   * У части камер основной поток 4К и упирается в лимит RTSP-сессий:
   * камера отвечает «453 Live memory budget is full». Дополнительный
   * поток в этот момент обычно работает, и оператору важнее увидеть
   * картинку, чем остаться с чёрным экраном.
   */
  const handlePlayerFailed = () => {
    if (fellBack) return;

    // Уводим только на поток, который сервер подтвердил. Иначе сбой
    // основного на камере без дополнительного переключил бы экран на
    // пустой адрес, и заглушка осталась бы навсегда. Пока адреса не
    // получены (available === null), сохраняем прежнее поведение: с
    // основного уходим на дополнительный, он чаще работает.
    if (available && !available[otherKind]) return;

    // С основного при сбое уходим на дополнительный — это прежнее
    // поведение. В обратную сторону переключаемся только тогда, когда
    // дополнительного потока у камеры нет вовсе: при двух рабочих
    // потоках сбой дополнительного не должен менять выбор оператора.
    if (kind === 'main' || (available && !available.sub)) {
      setFellBack(true);
      setKind(otherKind);
      if (kind === 'main') setError(t('live.mainStreamFailed'));
    }
  };

  return (
    <View style={styles.container}>
      <LivePlayer
        client={client}
        cameraId={camera.id}
        sub={kind === 'sub'}
        hlsPath={hlsPath}
        token={token}
        baseUrl={current?.baseUrl ?? ''}
        micCodec={talking ? 'pcmu' : undefined}
        onTransport={setTransport}
        onFailed={handlePlayerFailed}
      />

      <View style={styles.info}>
        <Text style={styles.cameraName}>{camera.name}</Text>
        <Text style={styles.cameraMeta}>
          {camera.ip || t('live.noAddress')}
          {stream?.status ? ` · ${stream.status}` : ''}
          {transport ? ` · ${transport.toUpperCase()}` : ''}
        </Text>
      </View>

      {/* Пульт показываем только поворотным камерам: у остальных моторов
          нет, и команды движения уйдут в пустоту. */}
      {camera.ptz ? (
        <PtzPanel client={client} cameraId={camera.id} onError={setPtzError} />
      ) : null}

      <View style={styles.buttons}>
        <Pressable
          style={[styles.button, !canSwitch && styles.buttonDisabled]}
          onPress={switchStream}
          disabled={!canSwitch}
        >
          <Text style={styles.buttonText}>
            {kind === 'sub' ? t('live.mainStream') : t('live.subStream')}
          </Text>
        </Pressable>

        <Pressable style={[styles.button, styles.buttonBack]} onPress={onBack}>
          <Text style={styles.buttonText}>{t('live.backToList')}</Text>
        </Pressable>

        {audio?.backchannel ? (
          <Pressable
            style={[styles.button, talking && styles.buttonActive]}
            onPress={() => setTalking((value) => !value)}
          >
            <Text style={styles.buttonText}>
              {talking ? t('live.stopTalking') : t('live.talk')}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.statusRow}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : null}

      <Text style={styles.hint}>
        {error || ptzError
          ? error || ptzError
          : talking
            ? t('live.talkingHint')
            : kind === 'sub'
              ? t('live.subHint')
              : t('live.mainHint')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  info: { padding: spacing.lg },
  cameraName: { fontSize: 20, fontWeight: '700', color: colors.text },
  cameraMeta: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },

  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  button: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  buttonBack: { borderColor: colors.primary },
  // Неактивный переключатель должен выглядеть неактивным: иначе на камере
  // с одним потоком нажатие просто ничего не делает и похоже на сбой.
  buttonDisabled: { opacity: 0.5 },
  buttonActive: { borderColor: colors.warning, backgroundColor: 'rgba(245,158,11,0.15)' },
  buttonText: { color: colors.text, fontSize: 14, fontWeight: '500' },

  statusRow: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },

  hint: {
    fontSize: 12,
    color: colors.textMuted,
    padding: spacing.lg,
    lineHeight: 18,
  },
});
