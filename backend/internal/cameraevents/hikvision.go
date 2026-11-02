package cameraevents

import (
	"bytes"
	"context"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"strings"
	"time"

	"github.com/nvr/backend/internal/domain"
	"github.com/nvr/backend/internal/httpdigest"
)

// hikvisionSource — события Hikvision через фирменный ISAPI alertStream.
//
// Почему не ONVIF. На живых камерах парка служба событий ONVIF отвечает
// 400 ter:NotAuthorized, хотя служба устройства с теми же учётными
// данными работает. ISAPI с обычной HTTP Digest отдаёт поток сразу.
//
// Формат потока — multipart: камера присылает XML-документы
// EventNotificationAlert по мере событий. Соединение долгоживущее, и его
// обрыв означает, что события больше не приходят, — менеджер переподключит.
type hikvisionSource struct {
	cam    domain.Camera
	user   string
	pass   string
	client *http.Client
}

func newHikvisionSource(cam domain.Camera, user, pass string) *hikvisionSource {
	return &hikvisionSource{
		cam:  cam,
		user: user,
		pass: pass,
		client: &http.Client{
			// Таймаута на всё тело быть не должно: поток живёт часами.
			// Ограничиваем только ожидание заголовков, чтобы недоступная
			// камера не держала соединение бесконечно.
			Transport: &http.Transport{ResponseHeaderTimeout: 15 * time.Second},
		},
	}
}

func (s *hikvisionSource) Name() string { return "hikvision" }

func (s *hikvisionSource) Run(ctx context.Context, emit func(Event) error) error {
	url := "http://" + s.cam.IP + "/ISAPI/Event/notification/alertStream"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/xml")

	resp, err := httpdigest.Do(s.client, req, s.user, s.pass)
	if err != nil {
		return fmt.Errorf("ISAPI недоступен: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("ISAPI ответил кодом %d: %s", resp.StatusCode, strings.TrimSpace(string(raw)))
	}

	boundary := streamBoundary(resp.Header.Get("Content-Type"))
	if boundary == "" {
		return fmt.Errorf("ISAPI не сообщил boundary потока событий")
	}

	reader := multipart.NewReader(resp.Body, boundary)
	for {
		part, err := reader.NextPart()
		if err != nil {
			if errors.Is(err, io.EOF) {
				// Нормальное завершение потока — для нас это обрыв:
				// события больше не приходят, нужно переподключиться.
				return fmt.Errorf("поток ISAPI завершён камерой")
			}
			return fmt.Errorf("не удалось прочитать событие ISAPI: %w", err)
		}

		raw, err := io.ReadAll(io.LimitReader(part, 1<<20))
		_ = part.Close()
		if err != nil {
			return fmt.Errorf("не удалось прочитать тело события ISAPI: %w", err)
		}
		ev, ok := parseHikvisionAlert(raw)
		if !ok {
			continue
		}
		if err := emit(ev); err != nil {
			return err
		}
	}
}

// streamBoundary достаёт boundary из Content-Type.
func streamBoundary(contentType string) string {
	if contentType == "" {
		return ""
	}
	_, params, err := mime.ParseMediaType(contentType)
	if err != nil {
		return ""
	}
	return params["boundary"]
}

// hikAlert — поля события, которые нужны для решения.
//
// Остальные поля документа не разбираем: их набор зависит от модели и
// прошивки, а решение принимается по типу события, состоянию и цели.
type hikAlert struct {
	EventType        string `xml:"eventType"`
	EventState       string `xml:"eventState"`
	DateTime         string `xml:"dateTime"`
	ChannelID        int    `xml:"channelID"`
	DetectionTarget  string `xml:"detectionTarget"`
	SmartType        string `xml:"smartType"`
	EventDescription string `xml:"eventDescription"`
}

// parseHikvisionAlert переводит документ камеры в событие.
func parseHikvisionAlert(raw []byte) (Event, bool) {
	var alert hikAlert
	if err := xml.Unmarshal(raw, &alert); err != nil {
		return Event{}, false
	}
	eventType := strings.ToLower(strings.TrimSpace(alert.EventType))
	if eventType == "" {
		return Event{}, false
	}

	// Цель детекции у Smart-событий приходит не всегда на верхнем уровне.
	// На части прошивок она лежит во вложенном Extensions, поэтому если
	// прямой разбор ничего не дал — ищем поле по всему документу.
	target := alert.DetectionTarget
	if target == "" {
		target = hikFirstValue(raw, "detectionTarget")
	}
	smartType := alert.SmartType
	if smartType == "" {
		smartType = hikFirstValue(raw, "smartType")
	}

	// «inactive» — событие закончилось. Публиковать его как обнаружение
	// нельзя: оператор получил бы тревогу в момент, когда опасность уже
	// прошла. Пустое состояние встречается у части прошивок и означает
	// именно срабатывание.
	state := strings.ToLower(strings.TrimSpace(alert.EventState))
	if state != "" && state != "active" {
		return Event{}, false
	}

	class, ok := hikClass(eventType, target, smartType, alert.EventDescription)
	if !ok {
		return Event{}, false
	}

	t := time.Now()
	if parsed, err := time.Parse(time.RFC3339, strings.TrimSpace(alert.DateTime)); err == nil {
		t = parsed
	}

	meta := map[string]any{
		"event_type": eventType,
		"native":     true,
	}
	if state != "" {
		meta["event_state"] = state
	}
	if alert.ChannelID != 0 {
		meta["channel_id"] = alert.ChannelID
	}
	if target != "" {
		meta["detection_target"] = target
	}
	if smartType != "" {
		meta["smart_type"] = smartType
	}
	if alert.EventDescription != "" {
		meta["event_description"] = alert.EventDescription
	}

	return Event{
		Timestamp:   eventTime(t),
		ObjectClass: class,
		Confidence:  hikConfidence(class),
		Metadata:    meta,
	}, true
}

// hikClass выбирает класс объекта по типу события и цели детекции.
//
// У Hikvision «умные» события (линия, область) несут цель human или
// vehicle. Если цель не указана, класс оставляем motion: выдавать
// движение за человека значило бы присылать ложные тревоги о людях.
func hikClass(eventType, target, smartType, description string) (string, bool) {
	switch {
	case eventType == "videoloss",
		eventType == "alarmlocal",
		eventType == "ipconflict",
		eventType == "illaccess",
		eventType == "nicbroken",
		eventType == "hddrivererror",
		eventType == "recordexception":
		// Это события состояния устройства, а не обнаружение объекта.
		// Ими занимается монитор здоровья камер.
		return "", false
	}

	if class := targetClass(target); class != "" {
		return class, true
	}
	if class := targetClass(smartType); class != "" {
		return class, true
	}

	switch {
	case strings.Contains(eventType, "linedetection"),
		strings.Contains(eventType, "fielddetection"),
		strings.Contains(eventType, "regionentrance"),
		strings.Contains(eventType, "regionexiting"),
		strings.Contains(eventType, "loitering"),
		strings.Contains(eventType, "group"),
		strings.Contains(eventType, "rapidmove"),
		strings.Contains(eventType, "parking"),
		strings.Contains(eventType, "unattendedbaggage"),
		strings.Contains(eventType, "attendedbaggage"):
		// Цель не пришла, но событие объектное. Разбираем описание:
		// часть прошивок пишет «human»/«vehicle» только в нём.
		if class := targetClass(description); class != "" {
			return class, true
		}
		return "motion", true
	case eventType == "vmd",
		strings.Contains(eventType, "motion"),
		strings.Contains(eventType, "cellmotion"):
		return "motion", true
	case strings.Contains(eventType, "tamper"):
		return "tamper", true
	}
	return "", false
}

func targetClass(v string) string {
	v = strings.ToLower(strings.TrimSpace(v))
	switch {
	case strings.Contains(v, "human"), strings.Contains(v, "person"), strings.Contains(v, "people"):
		return "person"
	case strings.Contains(v, "vehicle"), strings.Contains(v, "car"), strings.Contains(v, "truck"),
		strings.Contains(v, "bus"), strings.Contains(v, "motor"):
		return "car"
	case strings.Contains(v, "animal"), strings.Contains(v, "dog"), strings.Contains(v, "cat"):
		return "dog"
	}
	return ""
}

func hikConfidence(class string) float64 {
	if class == "motion" || class == "tamper" {
		return 0.6
	}
	// Класс пришёл от бортовой аналитики камеры, а не от нашего порога
	// уверенности. 0.9 — отметка «камера считает это человеком/машиной»,
	// а не измеренная вероятность.
	return 0.9
}

// hikFirstValue ищет значение элемента по имени на любой глубине.
//
// Нужен для Smart-событий: у части прошивок detectionTarget и smartType
// лежат внутри Extensions, а не рядом с eventType. Привязываться к
// конкретному пути нельзя — набор обёрток зависит от модели.
func hikFirstValue(raw []byte, name string) string {
	dec := xml.NewDecoder(bytes.NewReader(raw))
	for {
		tok, err := dec.Token()
		if err != nil {
			return ""
		}
		start, ok := tok.(xml.StartElement)
		if !ok || !strings.EqualFold(start.Name.Local, name) {
			continue
		}
		var value string
		if err := dec.DecodeElement(&value, &start); err == nil {
			return strings.TrimSpace(value)
		}
	}
}
