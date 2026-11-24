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
import type { TFunction } from 'i18next';

import { dateLocale } from '../i18n';
import { useApp } from '../state/AppContext';
import { describeNetworkError } from '../net/api';
import { colors, radius, spacing } from '../theme';
import type { SipCallRecord } from '../types';

/**
 * Пропущенные звонки.
 *
 * Отдельный экран, а не часть списка «кому звонить»: это история, а не
 * действие. Вызов с калитки легко пропустить — телефон был в кармане, сеть
 * пропала, человек не успел, — и без такого списка остаётся только уведомление,
 * которое к утру уже смахнуто.
 *
 * Данные берутся с сервера, а не из памяти телефона: журнал звонков ведётся
 * на объекте вместе с записью разговоров, он общий для всех устройств, и
 * человек должен видеть один и тот же список и на телефоне, и в панели.
 */
export default function MissedCallsScreen({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const { client } = useApp();
  const [calls, setCalls] = useState<SipCallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!client) return;
      if (!silent) setLoading(true);
      try {
        // only_missed отдаёт все неудачные попытки: не ответили, занято,
        // абонент недоступен. Оператору важно именно «до меня не дозвонились»,
        // а не техническая причина — её показываем подписью в строке.
        const list = await client.listSipCalls({ onlyMissed: true, limit: 50 });
        setCalls(list);
        setError(null);
      } catch (err) {
        setError(describeNetworkError(err));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [client],
  );

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && calls.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.centeredText}>{t('missed.loading')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>{t('missed.title')}</Text>
          <Text style={styles.subtitle}>
            {calls.length > 0
              ? t('missed.subtitleCount', { count: calls.length })
              : t('missed.subtitleEmpty')}
          </Text>
        </View>
        <Pressable style={styles.headerButton} onPress={onBack}>
          <Text style={styles.headerButtonText}>{t('missed.toCameras')}</Text>
        </Pressable>
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={calls}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load(true);
            }}
            tintColor={colors.textSecondary}
          />
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {t('missed.empty')}
          </Text>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.caller} numberOfLines={1}>
                {item.from_name || item.from_number || t('missed.unknownCaller')}
              </Text>
              <Text style={styles.time}>{describeTime(item.started_at, t)}</Text>
            </View>
            <Text style={styles.details} numberOfLines={2}>
              {describeDestination(item, t)} · {describeResult(item.result, t)}
              {item.talk_seconds > 0
                ? ` · ${t('missed.talk', { seconds: item.talk_seconds })}`
                : ''}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

/**
 * Время вызова в понятном виде.
 *
 * «Сегодня, 14:32» человек читает быстрее, чем «2026-10-12 14:32», и при
 * разборе происшествия ему важно именно «когда по отношению к сейчас».
 */
function describeTime(iso: string, t: TFunction): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const now = new Date();
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(date, now)) return t('missed.today', { time });

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return t('missed.yesterday', { time });

  const day = date.toLocaleDateString(dateLocale(), {
    day: '2-digit',
    month: '2-digit',
  });
  return `${day}, ${time}`;
}

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** Куда звонили: имя абонента понятнее номера, но есть оно не всегда. */
function describeDestination(call: SipCallRecord, t: TFunction): string {
  const destination = call.to_name || call.to_number;
  return destination
    ? t('missed.toDestination', { destination })
    : t('missed.notDelivered');
}

/** Чем закончилась попытка — на панели у калитки это разные ситуации. */
function describeResult(result: string, t: TFunction): string {
  switch (result) {
    case 'busy':
      return t('missed.resultBusy');
    case 'unavailable':
      return t('missed.resultUnavailable');
    default:
      return t('missed.resultNoAnswer');
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    gap: spacing.sm,
  },
  centeredText: {
    color: colors.textSecondary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    gap: spacing.sm,
  },
  headerText: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '600',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  headerButton: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerButtonText: {
    color: colors.text,
    fontSize: 14,
  },
  errorBox: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderWidth: 1,
    borderColor: colors.danger,
  },
  errorText: {
    color: colors.text,
    fontSize: 13,
  },
  list: {
    padding: spacing.md,
    paddingTop: 0,
    gap: spacing.sm,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    paddingVertical: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  caller: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  time: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  details: {
    color: colors.textSecondary,
    fontSize: 13,
  },
});
