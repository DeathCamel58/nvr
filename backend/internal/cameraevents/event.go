// Package cameraevents принимает события детекции от самих камер.
//
// Зачем отдельный слой. У части камер есть бортовой детектор: NPU считает
// людей и машины прямо на устройстве, а Hikvision умеет Smart-события
// (пересечение линии, вторжение в область). Эти события приходят быстрее
// и дешевле, чем наш анализ кадров, но говорят на разных языках: ONVIF,
// фирменный ISAPI, WebSocket OpenIPC. Здесь они приводятся к одному виду
// и публикуются в NATS тем же сообщением, что и наш ai-detector. Дальше
// работают уже существующие подписчики: база, снимки, запись, уведомления,
// вебхуки и поток событий для операторов.
package cameraevents

import (
	"context"
	"time"

	"github.com/nvr/backend/internal/domain"
)

// Event — нормализованное событие камеры.
//
// Поля совпадают с сообщением ai-detector (internal/nats.DetectionEvent),
// поэтому подписчик не различает, кто нашёл объект. Source и Native
// остаются в metadata: по ним видно происхождение события, но фильтры
// и уведомления работают одинаково.
type Event struct {
	CameraID    string             `json:"camera_id"`
	Timestamp   float64            `json:"timestamp"`
	ObjectClass string             `json:"object_class"`
	Confidence  float64            `json:"confidence"`
	BBox        map[string]float64 `json:"bbox,omitempty"`
	Metadata    map[string]any     `json:"metadata,omitempty"`
}

// Publisher — шина, в которую уходят события.
//
// Интерфейс, а не конкретное подключение к NATS: менеджер проверяется
// тестами без брокера, а способ доставки можно заменить, не трогая
// разбор протоколов камер.
type Publisher interface {
	Publish(subject string, data []byte) error
}

// Source — один протокол получения событий с камеры.
type Source interface {
	// Name — короткое имя источника для журнала и metadata.
	Name() string
	// Run работает до отмены ctx или до обрыва связи. Обрыв возвращается
	// ошибкой: переподключение и задержку делает менеджер, один раз для
	// всех источников.
	Run(ctx context.Context, emit func(Event) error) error
}

// credentials достаёт логин и пароль камеры из settings.
func credentials(settings map[string]any) (string, string) {
	var user, pass string
	if settings == nil {
		return user, pass
	}
	if v, ok := settings["username"].(string); ok {
		user = v
	}
	if v, ok := settings["password"].(string); ok {
		pass = v
	}
	return user, pass
}

// eventTime переводит время события в unix-секунды с долями.
//
// Детектор присылает именно такой формат, и подписчик разбирает его
// одинаково для всех источников. Нулевое время означает «сейчас»: часть
// камер не сообщает время в событии, и подставлять 1970 год нельзя.
func eventTime(t time.Time) float64 {
	if t.IsZero() {
		t = time.Now()
	}
	return float64(t.UnixNano()) / 1e9
}

// settingsFor — настройки приёма событий конкретной камеры.
func settingsFor(cam domain.Camera) domain.CameraEventsSettings {
	return domain.CameraEventsFromSettings(cam.Settings)
}
