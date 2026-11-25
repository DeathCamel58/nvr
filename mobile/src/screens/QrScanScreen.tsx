import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Camera, CameraType } from 'react-native-camera-kit';
import { useTranslation } from 'react-i18next';

import { useApp } from '../state/AppContext';
import { parsePairingString } from '../net/pairing';
import { colors, radius, spacing } from '../theme';

/**
 * Сканирование QR-кода подключения.
 *
 * Администратор показывает код в карточке пользователя, а человек наводит на
 * него телефон: ни адрес сервера, ни пароль набирать не нужно. Код
 * одноразовый и живёт десять минут, поэтому «показал и сжёг» здесь нормальное
 * поведение — если не успели, администратор выдаст новый.
 *
 * Ручной ввод кода живёт в форме добавления сервера, а не здесь: код
 * бесполезен без адреса сервера, а адрес в этой форме уже есть.
 */
export default function QrScanScreen({
  onBack,
  onDone,
}: {
  onBack: () => void;
  /** Подключение прошло: экран серверов закрывается, приложение идёт дальше. */
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { pairWithCode } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraAllowed, setCameraAllowed] = useState(Platform.OS !== 'android');

  /**
   * Замок от повторного срабатывания.
   *
   * Камера отдаёт один и тот же код десятки раз в секунду, пока он в кадре.
   * Без замка мы бы отправили столько же запросов на вход, и код сгорел бы
   * на первом же из них: остальные получили бы «код недействителен», и
   * подключение выглядело бы сломанным.
   */
  const handled = useRef(false);

  /**
   * Кнопка «назад» системы Android.
   *
   * Сканер — слой поверх экрана серверов, а не окно, поэтому «назад» должна
   * закрывать именно его, а не уводить дальше. Пока идёт подключение, «назад»
   * гасим и не закрываем сканер: запрос уже ушёл, токен будет сохранён, и
   * закрытый сканер всё равно перешёл бы вперёд, когда подключение завершится.
   * Та же логика у кнопки «Отмена» на экране.
   */
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!busy) onBack();
      return true;
    });
    return () => subscription.remove();
  }, [busy, onBack]);

  /**
   * Разрешение на камеру.
   *
   * Спрашиваем до показа камеры: иначе человек видит чёрный прямоугольник
   * с системным диалогом поверх и не понимает, что происходит.
   */
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let cancelled = false;

    (async () => {
      try {
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
        );
        if (!cancelled) setCameraAllowed(result === PermissionsAndroid.RESULTS.GRANTED);
      } catch {
        // Прошивка может не отдать разрешение — про это скажет подсказка
        // на экране, а вручную код можно ввести в форме добавления сервера.
        if (!cancelled) setCameraAllowed(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleCode = useCallback(
    async (raw: string) => {
      if (handled.current) return;

      const parsed = parsePairingString(raw);
      if (!parsed) {
        // Чужой квадратик — обычное дело: человек навёл камеру на первый
        // попавшийся код. Говорим словами и продолжаем искать свой.
        setError(t('qr.notPairingCode'));
        return;
      }

      handled.current = true;
      setBusy(true);
      setError(null);
      try {
        await pairWithCode({
          address: parsed.baseUrl,
          code: parsed.code,
          username: parsed.username,
        });
        onDone();
      } catch (e) {
        // Замок снимаем: код мог быть просрочен, и администратор уже выдал
        // новый — человек должен иметь возможность считать его этим же
        // экраном, а не возвращаться сюда заново.
        handled.current = false;
        setBusy(false);
        setError(e instanceof Error ? e.message : t('qr.connectFailed'));
      }
    },
    [pairWithCode, onDone, t],
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('qr.title')}</Text>
        <Pressable style={styles.headerButton} onPress={onBack} disabled={busy}>
          <Text style={styles.headerButtonText}>{t('qr.cancel')}</Text>
        </Pressable>
      </View>

      <View style={styles.cameraBox}>
        {cameraAllowed ? (
          <Camera
            style={StyleSheet.absoluteFill}
            cameraType={CameraType.Back}
            scanBarcode
            onReadCode={(event) => {
              void handleCode(event.nativeEvent.codeStringValue);
            }}
          />
        ) : (
          <View style={styles.cameraPlaceholder}>
            <Text style={styles.placeholderText}>
              {t('qr.noCameraAccess')}
            </Text>
          </View>
        )}

        {/* Рамка подсказывает, куда наводить: без неё камеру наводят на весь
            экран панели и ждут, что код найдётся сам. */}
        <View pointerEvents="none" style={styles.frame} />
      </View>

      <Text style={styles.hint}>
        {t('qr.hint')}
      </Text>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {busy && (
        <View style={styles.busyRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.busyText}>{t('qr.connecting')}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    paddingBottom: spacing.md,
  },
  title: { color: colors.text, fontSize: 20, fontWeight: '600' },
  headerButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerButtonText: { color: colors.text, fontSize: 14 },
  cameraBox: {
    flex: 1,
    margin: spacing.lg,
    marginTop: 0,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  cameraPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  placeholderText: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  frame: {
    position: 'absolute',
    top: '25%',
    left: '15%',
    right: '15%',
    bottom: '25%',
    borderWidth: 2,
    borderColor: colors.text,
    borderRadius: radius.md,
    opacity: 0.7,
  },
  hint: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: spacing.lg,
  },
  errorBox: {
    margin: spacing.lg,
    marginBottom: 0,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderWidth: 1,
    borderColor: colors.danger,
  },
  errorText: { color: colors.text, fontSize: 13 },
  busyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
  },
  busyText: { color: colors.textSecondary, fontSize: 13 },
});
