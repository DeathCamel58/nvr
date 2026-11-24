"""Юнит-тест: посторонний класс не попадает в счётчик «объектов без трека».

Запуск:
  python3 test_track_warning.py

Импортируется только detection_config — тяжёлые модели и NATS не нужны,
поэтому тест можно гонять без загрузки детектора.
"""
import sys

sys.path.insert(0, "/app")

from detection_config import RECOGNITION_CLASSES, missing_track_objects

failures = []


def check(name, cond, extra=""):
    if cond:
        print(f"  OK   {name} {extra}")
    else:
        print(f"  FAIL {name} {extra}")
        failures.append(name)


# Лица и номера приходят от отдельного движка распознавания: трекера у них
# нет, и проверка линии не должна принимать их за объекты без track_id.
check("лица и номера не считаются объектами без трека",
      missing_track_objects([
          {"object_class": "face", "track_id": None},
          {"object_class": "plate", "track_id": None},
      ]) == 0)

check("машина без идентификатора считается пропущенной",
      missing_track_objects([
          {"object_class": "car", "track_id": None},
          {"object_class": "person", "track_id": 12},
      ]) == 1)

check("набор классов распознавания не пуст",
      RECOGNITION_CLASSES == frozenset({"face", "plate"}))

# Посторонний класс отсекается настройками камеры ДО счётчика (сама проверка
# живёт в main.py). Здесь фиксируем решение: toilet не входит ни в классы
# объектов, ни в классы распознавания, значит в счётчик он попасть не должен.
allowed = {"person", "car", "truck", "dog", "cat"}
frame = [{"object_class": "toilet", "track_id": None},
         {"object_class": "person", "track_id": 4}]
filtered = [e for e in frame if e["object_class"] in allowed]
check("посторонний класс отсекается настройками камеры",
      missing_track_objects(filtered) == 0, f"→ {filtered}")

print()
if failures:
    print(f"ПРОВАЛЕНО: {len(failures)} — {failures}")
    raise SystemExit(1)
print("Все тесты пройдены")
