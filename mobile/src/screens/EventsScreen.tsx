import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { useApp } from '../state/AppContext';
import { describeNetworkError } from '../net/api';
import { colors, radius, spacing } from '../theme';
import {
  describeEventTime,
  describeMatch,
  describeObjectClass,
  describeTrigger,
  type DetectionEvent,
} from '../events';

/**
 * Лента событий детекции.
 *
 * Отдельный экран, а не часть архива: архив отвечает на вопрос «какое видео
 * есть», а лента — «что произошло». Оператору с телефона чаще нужен второй:
 * он видит тревогу в push и хочет понять, что на камере, не открывая плеер.
 *
 * Данные — GET /events с постраничной подгрузкой: журнал ведётся на сервере
 * и общий для всех устройств, поэтому в памяти телефона его копия не нужна.
 */
export default function EventsScreen({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const { client, baseUrl, token } = useApp();
  const [events, setEvents] = useState<DetectionEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (nextPage: number, silent = false) => {
      if (!client) return;
      if (!silent) {
        if (nextPage === 1) setLoading(true);
        else setLoadingMore(true);
      }
      try {
        const result = await client.listEvents({ page: nextPage, pageSize: 20 });
        setTotal(result.total);
        setPage(result.page);
        setEvents((prev) =>
          nextPage === 1 ? result.events : [...prev, ...result.events],
        );
        setError(null);
      } catch (err) {
        setError(describeNetworkError(err));
      } finally {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [client],
  );

  useEffect(() => {
    void load(1);
  }, [load]);

  const hasMore = events.length < total;

  if (loading && events.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.centeredText}>{t('events.loading')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>{t('events.title')}</Text>
          <Text style={styles.subtitle}>
            {total > 0
              ? t('events.subtitleCount', { count: total })
              : t('events.subtitleEmpty')}
          </Text>
        </View>
        <Pressable style={styles.headerButton} onPress={onBack}>
          <Text style={styles.headerButtonText}>{t('events.toCameras')}</Text>
        </Pressable>
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load(1, true);
            }}
            tintColor={colors.textSecondary}
          />
        }
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          // Догружаем следующую страницу только когда она есть: иначе
          // onEndReached срабатывал бы на каждом движении и слал бы
          // одинаковые запросы.
          if (hasMore && !loadingMore) void load(page + 1);
        }}
        ListEmptyComponent={
          <Text style={styles.emptyText}>{t('events.empty')}</Text>
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator
              color={colors.textSecondary}
              style={styles.footerSpinner}
            />
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.object} numberOfLines={1}>
                {describeObjectClass(item.object_class, t)}
              </Text>
              <Text style={styles.time}>
                {describeEventTime(item.timestamp, t)}
              </Text>
            </View>

            <Text style={styles.details} numberOfLines={2}>
              {item.camera_name || t('events.unknownCamera')} ·{' '}
              {describeTrigger(item, t)}
              {item.confidence > 0
                ? ` · ${Math.round(item.confidence * 100)}%`
                : ''}
            </Text>

            {describeMatch(item) ? (
              <Text style={styles.match} numberOfLines={1}>
                {describeMatch(item)}
              </Text>
            ) : null}

            {/* Снимок — тег img, поэтому токен идёт параметром: заголовок
                Authorization картинка передать не умеет. */}
            {baseUrl && token ? (
              <Image
                style={styles.snapshot}
                source={{
                  uri: `${baseUrl}/api/v1/events/${item.id}/snapshot?jwt=${encodeURIComponent(token)}`,
                }}
                resizeMode="cover"
              />
            ) : null}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  centeredText: { marginTop: spacing.md, color: colors.textSecondary },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerText: { flex: 1 },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  headerButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  headerButtonText: { color: colors.primary, fontWeight: '600' },
  errorBox: {
    margin: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  errorText: { color: colors.danger },
  list: { padding: spacing.lg, gap: spacing.md },
  card: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between' },
  object: { fontSize: 16, fontWeight: '600', color: colors.text, flex: 1 },
  time: { fontSize: 13, color: colors.textSecondary },
  details: { fontSize: 13, color: colors.textSecondary },
  match: { fontSize: 13, color: colors.primary },
  snapshot: {
    marginTop: spacing.xs,
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
  },
  emptyText: {
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  footerSpinner: { marginVertical: spacing.md },
});
