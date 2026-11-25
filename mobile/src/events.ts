import type { TFunction } from 'i18next';

import { dateLocale } from './i18n';

/**
 * Событие детекции, как его отдаёт GET /events.
 *
 * Поля повторяют серверную структуру `domain.DetectionEvent`, но только те,
 * что нужны списку: рамка, вектор и путь к файлу снимка телефону не нужны.
 */
export interface DetectionEvent {
  id: string;
  camera_id: string;
  camera_name?: string;
  timestamp: string;
  object_class: string;
  confidence: number;
  /** Причина события: object, line, face, plate, audio, camera. */
  trigger_type?: string;
  matched_name?: string;
  metadata?: Record<string, unknown>;
}

export interface EventsPage {
  events: DetectionEvent[];
  total: number;
  page: number;
  page_size: number;
}

/**
 * Время события в понятном виде.
 *
 * «Сегодня, 14:32» человек читает быстрее, чем «2026-10-12 14:32», и при
 * разборе происшествия важнее «когда относительно сейчас».
 */
export function describeEventTime(iso: string, t: TFunction): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const now = new Date();
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(date, now)) return t('events.today', { time });

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return t('events.yesterday', { time });

  const day = date.toLocaleDateString(dateLocale(), {
    day: '2-digit',
    month: '2-digit',
  });
  return `${day}, ${time}`;
}

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/**
 * Название класса объекта.
 *
 * Классы приходят кодами COCO (person, car, truck, dog). Переводим только
 * те, что реально встречаются в журнале; остальные показываем как есть —
 * выдумывать перевод для неизвестного класса хуже, чем показать код.
 */
export function describeObjectClass(objectClass: string, t: TFunction): string {
  const key = `events.class_${objectClass}`;
  const translated = t(key);
  return translated === key ? objectClass : translated;
}

/**
 * Причина события словами.
 *
 * Сервер пишет trigger_type, но в старых записях его может не быть —
 * тогда остаётся только класс объекта.
 */
export function describeTrigger(event: DetectionEvent, t: TFunction): string {
  switch (event.trigger_type) {
    case 'line':
      return t('events.triggerLine');
    case 'face':
      return t('events.triggerFace');
    case 'plate':
      return t('events.triggerPlate');
    case 'audio':
      return t('events.triggerAudio');
    case 'camera':
      return t('events.triggerCamera');
    default:
      return t('events.triggerObject');
  }
}

/** Совпадение со справочником: имя владельца лица или номер машины. */
export function describeMatch(event: DetectionEvent): string {
  if (event.matched_name) return event.matched_name;
  const plate = event.metadata?.['plate_text'];
  return typeof plate === 'string' ? plate : '';
}
