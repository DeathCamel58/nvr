package cameraevents

import (
	"encoding/xml"
	"fmt"
	"strings"
	"time"
)

// onvifNotification — одно уведомление из PullMessages.
//
// Путь через вложенные Message>Message, а не через пространства имён:
// encoding/xml сопоставляет локальные имена, а префиксы у разных прошивок
// могут быть любыми (wsnt, tev, tt). Проверять префиксы значило бы
// поддерживать не протокол, а конкретную реализацию.
type onvifNotification struct {
	Topic   string       `xml:"Topic"`
	Message onvifMessage `xml:"Message>Message"`
}

type onvifMessage struct {
	UtcTime string            `xml:"UtcTime,attr"`
	Source  []onvifSimpleItem `xml:"Source>SimpleItem"`
	Data    []onvifSimpleItem `xml:"Data>SimpleItem"`
}

type onvifSimpleItem struct {
	Name  string `xml:"Name,attr"`
	Value string `xml:"Value,attr"`
}

// parseONVIFNotifications разбирает ответ PullMessages.
func parseONVIFNotifications(raw []byte) ([]onvifNotification, error) {
	var out struct {
		Notifications []onvifNotification `xml:"Body>PullMessagesResponse>NotificationMessage"`
	}
	if err := xml.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("не удалось разобрать события ONVIF: %w", err)
	}
	return out.Notifications, nil
}

// toEvent переводит уведомление в событие нашего вида.
//
// Поддерживаются только события движения: ONVIF-топики объектной
// детекции у разных производителей не стандартизированы, и придумывать
// общий разбор значило бы угадывать. Объекты с камеры 117 приходят по
// её WebSocket, а у Hikvision — по ISAPI.
func (n onvifNotification) toEvent() (Event, bool) {
	topic := strings.ToLower(strings.TrimSpace(n.Topic))
	if topic == "" {
		return Event{}, false
	}

	active := false
	switch {
	case strings.Contains(topic, "motionalarm"):
		active = itemIsTrue(n.Message.Data, "State")
	case strings.Contains(topic, "cellmotiondetector"), strings.Contains(topic, "motion"):
		active = itemIsTrue(n.Message.Data, "IsMotion")
	default:
		return Event{}, false
	}
	if !active {
		return Event{}, false
	}

	t := time.Now()
	if parsed, err := time.Parse(time.RFC3339Nano, strings.TrimSpace(n.Message.UtcTime)); err == nil {
		t = parsed
	}

	meta := map[string]any{
		"topic":  n.Topic,
		"native": true,
	}
	if src := itemValue(n.Message.Source, "Source"); src != "" {
		meta["onvif_source"] = src
	}

	return Event{
		Timestamp:   eventTime(t),
		ObjectClass: "motion",
		// ONVIF не сообщает уверенность: событие бинарное. Половина —
		// честная отметка «есть движение», а не выдуманная точность.
		Confidence: 0.5,
		Metadata:   meta,
	}, true
}

func itemValue(items []onvifSimpleItem, name string) string {
	for _, it := range items {
		if strings.EqualFold(it.Name, name) {
			return strings.TrimSpace(it.Value)
		}
	}
	return ""
}

func itemIsTrue(items []onvifSimpleItem, name string) bool {
	v := strings.ToLower(itemValue(items, name))
	return v == "true" || v == "1"
}
