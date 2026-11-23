import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useApp } from '../state/AppContext';
import { describeNetworkError } from '../net/api';
import { colors, radius, spacing } from '../theme';
import type { Camera } from '../types';
import TvButton from './TvButton';
import type { TvLayout } from './layout';

/**
 * Настройки телевизионного режима.
 *
 * Две группы: как выглядит экран (заголовки, часы, действие кнопки «ОК»)
 * и что слышно. Оформление вынесено из настроек раскладки намеренно:
 * раскладка отвечает на вопрос «какие камеры», а здесь — «как их показать».
 * Так оператор не перевыбирает камеры ради смены громкости.
 */
export default function TvSettingsScreen({
  layout,
  onChange,
  onBack,
}: {
  layout: TvLayout;
  onChange: (layout: TvLayout) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const { client } = useApp();
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!client) return;
      setLoading(true);
      try {
        const list = await client.listCameras();
        if (!cancelled) {
          setCameras([...list].sort((a, b) => a.name.localeCompare(b.name)));
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(describeNetworkError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client]);

  /** Меняет вложенные настройки, не теряя остальные поля раскладки. */
  const patchOverlay = (patch: Partial<TvLayout['overlay']>) =>
    onChange({ ...layout, overlay: { ...layout.overlay, ...patch } });

  const patchSound = (patch: Partial<TvLayout['sound']>) =>
    onChange({ ...layout, sound: { ...layout.sound, ...patch } });

  /**
   * Включает звук одной камеры.
   *
   * Только одной: на телевизоре несколько источников сливаются в шум,
   * и разобрать, что происходит, невозможно. Повторное нажатие выключает.
   */
  const toggleSoundCamera = (cameraId: string) => {
    const on = layout.sound.cameraIds.includes(cameraId);
    patchSound({
      enabled: true,
      cameraIds: on ? [] : [cameraId],
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('tv.screenSettings')}</Text>
        <TvButton title={t('tv.done')} variant="primary" onPress={onBack} />
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.sectionTitle}>{t('tv.tileContent')}</Text>

        <ToggleRow
          title={t('tv.showNameTitle')}
          hint={t('tv.showNameHint')}
          value={layout.overlay.showNames}
          onChange={(value) => patchOverlay({ showNames: value })}
        />

        <ToggleRow
          title={t('tv.showStatusTitle')}
          hint={t('tv.showStatusHint')}
          value={layout.overlay.showStatus}
          onChange={(value) => patchOverlay({ showStatus: value })}
        />

        <ToggleRow
          title={t('tv.showClockTitle')}
          hint={t('tv.showClockHint')}
          value={layout.overlay.showClock}
          onChange={(value) => patchOverlay({ showClock: value })}
        />

        <Text style={styles.sectionTitle}>{t('tv.okButtonTitle')}</Text>
        <View style={styles.row}>
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle}>{t('tv.okActionTitle')}</Text>
            <Text style={styles.rowHint}>
              {t('tv.okActionHint')}
            </Text>
          </View>
        </View>
        <View style={styles.choiceRow}>
          <TvButton
            title={t('tv.openFullscreen')}
            variant={layout.enterAction === 'fullscreen' ? 'primary' : 'default'}
            onPress={() => onChange({ ...layout, enterAction: 'fullscreen' })}
          />
          <TvButton
            title={t('tv.toggleSound')}
            variant={layout.enterAction === 'sound' ? 'primary' : 'default'}
            onPress={() => onChange({ ...layout, enterAction: 'sound' })}
          />
        </View>

        <Text style={styles.sectionTitle}>{t('tv.sound')}</Text>

        <ToggleRow
          title={t('tv.soundEnabledTitle')}
          hint={t('tv.soundEnabledHint')}
          value={layout.sound.enabled}
          onChange={(value) => patchSound({ enabled: value })}
        />

        <View style={styles.row}>
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle}>
              {t('tv.volume', { percent: Math.round(layout.sound.volume * 100) })}
            </Text>
            <View style={styles.volumeRow}>
              {[0.2, 0.4, 0.6, 0.8, 1].map((value) => (
                <TvButton
                  key={value}
                  title={`${Math.round(value * 100)}%`}
                  variant={
                    Math.abs(layout.sound.volume - value) < 0.05
                      ? 'primary'
                      : 'default'
                  }
                  onPress={() => patchSound({ volume: value })}
                />
              ))}
            </View>
            <Text style={styles.rowHint}>
              {t('tv.volumeHint')}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>{t('tv.soundCameraTitle')}</Text>
        <Text style={styles.sectionHint}>
          {t('tv.soundCameraHint')}
        </Text>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={styles.spinner} />
        ) : (
          <View style={styles.list}>
            {cameras.map((camera) => (
              <SoundRow
                key={camera.id}
                camera={camera}
                selected={layout.sound.cameraIds.includes(camera.id)}
                onPress={() => toggleSoundCamera(camera.id)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

/** Строка с переключателем. */
function ToggleRow({
  title,
  hint,
  value,
  onChange,
}: {
  title: string;
  hint: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <Pressable
      onPress={() => onChange(!value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[styles.row, focused && styles.rowFocused]}
    >
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowHint}>{hint}</Text>
      </View>
      {/* Switch без обработчика: нажатие обрабатывает вся строка целиком —
          так проще попасть пультом, чем в маленький переключатель. */}
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor="#fff"
      />
    </Pressable>
  );
}

/** Строка выбора камеры для звука. */
function SoundRow({
  camera,
  selected,
  onPress,
}: {
  camera: Camera;
  selected: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const [focused, setFocused] = useState(false);

  return (
    <Pressable
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[
        styles.row,
        selected && styles.rowSelected,
        focused && styles.rowFocused,
      ]}
    >
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {camera.name}
        </Text>
        <Text style={styles.rowHint}>
          {camera.ip || t('tv.noAddress')}
          {camera.status !== 'online' ? t('tv.offlineSuffix') : ''}
        </Text>
      </View>
      {selected && <Text style={styles.soundMark}>🔊</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
  },
  headerTitle: { color: colors.text, fontSize: 22, fontWeight: '700' },

  scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '600',
    marginTop: spacing.xl,
  },
  sectionHint: { color: colors.textMuted, fontSize: 13, marginTop: spacing.xs },
  spinner: { marginTop: spacing.xl },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  rowSelected: { borderColor: colors.primary },
  rowFocused: { backgroundColor: colors.surfaceAlt, borderColor: colors.primary },
  rowBody: { flex: 1 },
  rowTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  rowHint: { color: colors.textSecondary, fontSize: 13, marginTop: spacing.xs, lineHeight: 18 },

  choiceRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  volumeRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' },
  soundMark: { fontSize: 20 },

  list: { marginTop: spacing.md, gap: spacing.sm },
  errorBox: {
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: 'rgba(239,68,68,0.12)',
  },
  errorText: { color: colors.text, fontSize: 14 },
});
