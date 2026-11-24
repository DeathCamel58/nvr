import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { useApp } from '../state/AppContext';
import { useSip } from '../state/SipContext';
import { describeNetworkError } from '../net/api';
import { describeMicrophone } from '../net/mediaProbe';
import { colors, radius, spacing } from '../theme';
import type { SipAccountBrief, SipGroupBrief } from '../types';

/**
 * Экран звонков: кому и куда звонить.
 *
 * Список собран из двух источников: абоненты (панель у калитки, трубки,
 * камеры со звуком) и группы вызова (позвонить всем сразу). Группа стоит
 * первой: чаще всего с телефона нужно позвать не конкретного человека, а
 * «всех, кто может ответить», и лезть за этим вглубь списка незачем.
 *
 * Своя линия из списка исключена: звонить самому себе бессмысленно, и в
 * списке она только сбивала бы с толку.
 */
export default function CallsScreen({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const { client } = useApp();
  const { line, snapshot, call, error: lineError, loading: lineLoading, reload, batteryExempt, requestBattery } = useSip();

  const [accounts, setAccounts] = useState<SipAccountBrief[]>([]);
  const [groups, setGroups] = useState<SipGroupBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Видео включается тумблером, и по умолчанию — как разрешено на сервере.
  // Отдельный выключатель нужен ещё и для диагностики: если видеозвонок
  // роняет приложение на конкретном телефоне, звонок со звуком должен
  // остаться рабочим.
  const [videoOn, setVideoOn] = useState(true);
  // Состояние микрофона: проверяем при открытии экрана, потому что без него
  // звонок не уходит, а причина снаружи не видна.
  const [microphone, setMicrophone] = useState(() => t('calls.microphoneChecking'));

  const load = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    try {
      // Список абонентов может отдать 403: у наблюдателя нет права смотреть
      // домофонию. Это не сбой — тогда показываем только свою линию и
      // говорим словами, что списка нет.
      const [accs, grps] = await Promise.all([
        client.listSipAccounts().catch(() => [] as SipAccountBrief[]),
        client.listSipGroups().catch(() => [] as SipGroupBrief[]),
      ]);
      setAccounts(accs);
      setGroups(grps.filter((g) => g.enabled && g.number));
      setError(null);
    } catch (err) {
      setError(describeNetworkError(err));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  // Проверка микрофона: она отвечает на вопрос, который снаружи не виден —
  // может ли этот телефон вообще начать вызов. Занимает не больше секунды,
  // а на «нет ответа» ждёт шесть секунд, чтобы не подвесить экран.
  useEffect(() => {
    let cancelled = false;
    void describeMicrophone().then((result) => {
      if (!cancelled) {
        setMicrophone(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // По умолчанию — значение из настроек сервера: владелец включает видео
  // один раз для всей установки, а не на каждом телефоне отдельно.
  useEffect(() => {
    if (line) setVideoOn(line.video);
  }, [line]);

  const registrationText = (() => {
    if (lineError) return lineError;
    if (lineLoading) return t('calls.gettingNumber');
    if (!line) return t('calls.telephonyNotConfigured');
    switch (snapshot.registration) {
      case 'registered':
        return t('calls.lineOnline', { number: line.number });
      case 'connecting':
        // Причину обрыва показываем и здесь: соединение рвётся в фоне, и
        // без текста строка «подключение…» выглядела бы как обычный запуск,
        // хотя на самом деле линия только что была потеряна.
        return snapshot.registrationError
          ? t('calls.lineWithStatus', { number: line.number, status: snapshot.registrationError })
          : t('calls.lineConnecting', { number: line.number });
      case 'failed':
        return t('calls.lineWithStatus', {
          number: line.number,
          status: snapshot.registrationError || t('calls.noConnection'),
        });
      default:
        return t('calls.line', { number: line.number });
    }
  })();

  const registered = snapshot.registration === 'registered';
  const busy = snapshot.call !== null;

  // В списке — все абоненты, кроме своей линии: звонить самому себе
  // бессмысленно. Другие приложения (второй и третий телефон) тоже
  // показываем: раньше они отсеивались по виду абонента, и позвонить
  // с телефона на телефон было нельзя — второго аппарата в списке
  // просто не было.
  const otherAccounts = accounts.filter((a) => a.number !== line?.number);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.back} hitSlop={12}>
          <Text style={styles.backText}>{t('calls.back')}</Text>
        </Pressable>
        <Text style={styles.title}>{t('calls.title')}</Text>
      </View>

      <View style={styles.statusRow}>
        <View
          style={[
            styles.dot,
            {
              backgroundColor: registered ? colors.success : colors.textSecondary,
            },
          ]}
        />
        <Text style={styles.status} numberOfLines={2}>
          {registrationText}
        </Text>
        {!registered && (
          <Pressable onPress={() => void reload()} hitSlop={8}>
            <Text style={styles.retry}>{t('calls.refresh')}</Text>
          </Pressable>
        )}
      </View>

      {/* Строка диагностики: по ней видно состояние линии без журналов
          телефона и без журналов станции. Заведена 13.10.2026, когда
          разбирали «вызов идёт, а на станции его нет»: снаружи это же
          выглядит как любая другая сетёвая беда, а причина лежала
          в самом клиенте. Убрать, когда фоновые переподключения перестанут
          доставлять хлопоты. */}
      <Text style={styles.diag} numberOfLines={2}>
        {t('calls.diagLine', { state: snapshot.registration }) +
          t('calls.diagTransport', {
            state: snapshot.diag.connected ? t('calls.yes') : t('calls.no'),
          }) +
          t('calls.diagRestarts', { restarts: snapshot.diag.restarts }) +
          (snapshot.diag.registeredAgo >= 0
            ? t('calls.diagRegisteredAgo', { seconds: snapshot.diag.registeredAgo })
            : '')}
      </Text>
      {/* Проверка медиа: без микрофона вызвать никого нельзя, а снаружи это
          выглядит как «станция не отвечает». Пусть будет видно заранее. */}
      <Text style={styles.diag} numberOfLines={2}>{t('calls.diagMicrophone', { state: microphone })}</Text>
      <Text style={styles.diag} numberOfLines={3}>{t('calls.diagEvents', { events: snapshot.diag.events.join(' → ') })}</Text>

      {/* Видео можно выключить перед звонком: на слабом телефоне или в
          мобильной сети так надёжнее, а звук остаётся. */}
      <Pressable
        style={styles.videoToggle}
        onPress={() => setVideoOn((value) => !value)}
        disabled={!line}
      >
        <View style={[styles.checkbox, videoOn && styles.checkboxOn]}>
          {videoOn && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <Text style={styles.videoToggleText}>{t('calls.callWithVideo')}</Text>
      </Pressable>

      {/* Разрешение на работу в фоне.
          Без него прошивка замораживает приложение через несколько секунд
          после ухода в фон, и входящие перестают приходить — при том что
          снаружи всё выглядит исправным: линия на связи, уведомление висит. */}
      {batteryExempt === false && (
        <Pressable style={styles.batteryNotice} onPress={requestBattery}>
          <Text style={styles.batteryTitle}>{t('calls.allowBackgroundTitle')}</Text>
          <Text style={styles.batteryText}>
            {t('calls.allowBackgroundText')}
          </Text>
        </Pressable>
      )}

      {loading && !accounts.length ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />
      ) : (
        <FlatList
          data={[
            ...groups.map((g) => ({ type: 'group' as const, item: g })),
            ...otherAccounts.map((a) => ({ type: 'account' as const, item: a })),
          ]}
          keyExtractor={(row) => `${row.type}-${row.item.id}`}
          contentContainerStyle={{ paddingBottom: spacing.xl }}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={() => void load()}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={
            <Text style={styles.sectionTitle}>
              {groups.length ? t('calls.callGroups') : ''}
            </Text>
          }
          renderItem={({ item: row }) => {
            const isFirstAccount =
              row.type === 'account' &&
              groups.length > 0 &&
              otherAccounts[0]?.id === row.item.id;
            // Подпись: у группы это её название, у абонента — имя устройства.
            // Ветки разные, потому что поля у этих сущностей не совпадают.
            const title =
              row.type === 'group'
                ? row.item.name || t('calls.callGroup')
                : row.item.display_name || t('calls.subscriber');

            return (
              <View>
                {isFirstAccount && <Text style={styles.sectionTitle}>{t('calls.subscribers')}</Text>}
                <Pressable
                  style={styles.row}
                  disabled={!registered || busy || !line}
                  onPress={() => call(row.item.number, { video: videoOn })}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.number}>{row.item.number}</Text>
                    <Text style={styles.name} numberOfLines={1}>
                      {title}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.dot,
                      {
                        backgroundColor: registered ? colors.success : colors.textSecondary,
                      },
                    ]}
                  />
                  <Text style={[styles.action, !registered && styles.actionDim]}>
                    {registered ? t('calls.call') : t('calls.noConnection')}
                  </Text>
                </Pressable>
              </View>
            );
          }}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {t('calls.emptyList')}
            </Text>
          }
        />
      )}

      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  back: { paddingRight: spacing.md },
  backText: { color: colors.primary, fontSize: 16 },
  title: { color: colors.text, fontSize: 20, fontWeight: '600' },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  status: { color: colors.textSecondary, fontSize: 13, flex: 1 },
  diag: {
    color: colors.textSecondary,
    fontSize: 11,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
  retry: { color: colors.primary, fontSize: 13 },
  videoToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  videoToggleText: { color: colors.textSecondary, fontSize: 13 },
  batteryNotice: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.warning,
    borderWidth: 1,
  },
  batteryTitle: { color: colors.warning, fontSize: 14, fontWeight: '600' },
  batteryText: { color: colors.textSecondary, fontSize: 12, marginTop: 4, lineHeight: 18 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkmark: { color: '#fff', fontSize: 13, lineHeight: 16 },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: 12,
    textTransform: 'uppercase',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  number: { color: colors.text, fontSize: 16, fontWeight: '600' },
  name: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.textSecondary },
  action: { color: colors.primary, fontSize: 14 },
  actionDim: { color: colors.textSecondary },
  empty: {
    color: colors.textSecondary,
    fontSize: 13,
    padding: spacing.md,
    lineHeight: 20,
  },
  error: { color: colors.danger, fontSize: 13, padding: spacing.md },
});
