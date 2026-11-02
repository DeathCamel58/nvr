package domain

import (
	"fmt"
	"strings"
)

// CameraEventsSettings — приём событий, которые камера считает сама.
//
// Своя детекция по кадрам и бортовая детекция камеры решают одну задачу,
// но по-разному: наша видит класс объекта в кадре, камера — быстрее и без
// нагрузки на сервер. Поэтому источник включается отдельно для каждой
// камеры, а не глобально: у части парка бортовой детекции нет вовсе.
type CameraEventsSettings struct {
	// Enabled — принимать события этой камеры.
	//
	// По умолчанию выключено: включение «для всех» дало бы по два события
	// на каждый объект — от камеры и от нашего детектора.
	Enabled bool `json:"enabled"`
	// Source — откуда брать события: auto, onvif, hikvision, openipc.
	//
	// auto — определить по самой камере: OpenIPC отвечает своим API,
	// Hikvision — ISAPI, остальные пробуются через ONVIF.
	Source string `json:"source"`
	// Motion — принимать события движения без класса объекта.
	Motion bool `json:"motion"`
	// Objects — принимать события с классом: человек, машина, животное.
	Objects bool `json:"objects"`
	// MinIntervalSec — не чаще одного события одного класса с одного места
	// за этот интервал. Камера присылает детекции несколько раз в секунду,
	// и без склейки журнал заполнялся бы одинаковыми записями.
	MinIntervalSec int `json:"min_interval_sec"`
}

// CameraEventsKey — ключ в cameras.settings, под которым лежат настройки.
// Отдельной таблицы нет намеренно: набор полей ещё будет меняться, а
// JSONB позволяет добавить поле без миграции.
const CameraEventsKey = "camera_events"

// NormalizeCameraEventsSettings приводит значения к рабочему виду.
//
// Пустой source означает auto, нулевой интервал — значение по умолчанию.
// Ноль здесь нельзя трактовать как «без ограничения»: тогда камера,
// присылающая пять детекций в секунду, забила бы журнал за минуту.
func NormalizeCameraEventsSettings(s CameraEventsSettings) CameraEventsSettings {
	s.Source = strings.ToLower(strings.TrimSpace(s.Source))
	if s.Source == "" {
		s.Source = "auto"
	}
	if s.MinIntervalSec <= 0 {
		s.MinIntervalSec = 10
	}
	if s.MinIntervalSec > 3600 {
		s.MinIntervalSec = 3600
	}
	return s
}

// ValidateCameraEventsSettings проверяет настройки перед сохранением.
//
// Проверка на входе API, а не только в менеджере: опечатка в source иначе
// сохранилась бы молча, а камера просто перестала бы присылать события,
// и причину пришлось бы искать в журнале сервера.
func ValidateCameraEventsSettings(s CameraEventsSettings) error {
	switch s.Source {
	case "", "auto", "onvif", "hikvision", "openipc":
	default:
		return fmt.Errorf("неизвестный источник событий: %s", s.Source)
	}
	if s.MinIntervalSec < 0 || s.MinIntervalSec > 3600 {
		return fmt.Errorf("интервал склейки должен быть от 0 до 3600 секунд")
	}
	return nil
}

// CameraEventsFromSettings читает настройки из JSONB-поля камеры.
//
// Значения приходят из базы как map[string]any, поэтому числа могут быть
// float64. Отсутствие блока означает «выключено»: старые установки не
// должны начать принимать события после обновления сами по себе.
func CameraEventsFromSettings(settings map[string]any) CameraEventsSettings {
	s := CameraEventsSettings{Source: "auto", Motion: true, Objects: true, MinIntervalSec: 10}
	if settings == nil {
		return s
	}
	raw, ok := settings[CameraEventsKey]
	if !ok {
		return s
	}
	switch v := raw.(type) {
	case CameraEventsSettings:
		return NormalizeCameraEventsSettings(v)
	case map[string]any:
		if b, ok := v["enabled"].(bool); ok {
			s.Enabled = b
		}
		if str, ok := v["source"].(string); ok {
			s.Source = str
		}
		if b, ok := v["motion"].(bool); ok {
			s.Motion = b
		}
		if b, ok := v["objects"].(bool); ok {
			s.Objects = b
		}
		switch n := v["min_interval_sec"].(type) {
		case float64:
			s.MinIntervalSec = int(n)
		case int:
			s.MinIntervalSec = n
		}
	}
	return NormalizeCameraEventsSettings(s)
}
